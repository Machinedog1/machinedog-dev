import { Router, type IRouter } from "express";
import { db, projectsTable, type Project } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireActiveClient, reqClient } from "../lib/auth";
import {
  resolveBranchSha,
  pushBranchWithFiles,
  openPullRequest,
  GitHubNotConfiguredError,
  GitHubApiError,
} from "../lib/github";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface SecretHit {
  path: string;
  line: number;
  rule: string;
}

const SECRET_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /AWS_SECRET_ACCESS_KEY\s*=\s*[A-Za-z0-9/+=]{20,}/i, label: "AWS secret access key" },
  { pattern: /AKIA[0-9A-Z]{16}/, label: "AWS access key id" },
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/, label: "Private key block" },
  { pattern: /sk_live_[A-Za-z0-9]{20,}/, label: "Stripe live secret" },
  { pattern: /sk_test_[A-Za-z0-9]{20,}/, label: "Stripe test secret" },
  { pattern: /(?:GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)\s*=\s*[A-Za-z0-9_]{20,}/i, label: "GitHub token" },
  { pattern: /ghp_[A-Za-z0-9]{30,}/, label: "GitHub PAT (ghp_)" },
  { pattern: /ghs_[A-Za-z0-9]{30,}/, label: "GitHub server token (ghs_)" },
  { pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/, label: "Slack token" },
];

function scanForSecrets(files: Array<{ path: string; contents: string }>): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const file of files) {
    const lines = file.contents.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const rule of SECRET_RULES) {
        if (rule.pattern.test(line)) {
          hits.push({ path: file.path, line: idx + 1, rule: rule.label });
        }
      }
    });
  }
  return hits;
}

function sanitizeBranchName(input: string): string {
  // Allow only safe ref characters; strip whitespace and special chars,
  // preserve slashes for namespacing (e.g. machinedog/feature-x).
  const cleaned = input
    .trim()
    .replace(/[^a-zA-Z0-9/_.-]+/g, "-")
    .replace(/^[/.-]+|[/.-]+$/g, "")
    .slice(0, 200);
  return cleaned;
}

router.post(
  "/projects/:id/commit-files",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid project id" } });
      return;
    }
    const body = req.body as {
      branchName?: unknown;
      commitMessage?: unknown;
      files?: unknown;
      prTitle?: unknown;
      prBody?: unknown;
    };
    const rawBranch = typeof body.branchName === "string" ? body.branchName : "";
    const branchName = sanitizeBranchName(rawBranch);
    const commitMessage = typeof body.commitMessage === "string" ? body.commitMessage.trim() : "";
    const filesIn = Array.isArray(body.files) ? body.files : [];
    if (!branchName) {
      res.status(400).json({ error: { code: "bad_request", message: "branchName required" } });
      return;
    }
    if (!commitMessage) {
      res.status(400).json({ error: { code: "bad_request", message: "commitMessage required" } });
      return;
    }
    if (!filesIn.length) {
      res.status(400).json({ error: { code: "bad_request", message: "At least one file required" } });
      return;
    }
    const files: Array<{ path: string; contents: string }> = [];
    for (const f of filesIn) {
      if (!f || typeof f !== "object") continue;
      const rec = f as { path?: unknown; contents?: unknown };
      if (typeof rec.path !== "string" || typeof rec.contents !== "string") {
        res.status(400).json({ error: { code: "bad_request", message: "files entries need path+contents strings" } });
        return;
      }
      const trimmedPath = rec.path.trim().replace(/^\/+/, "");
      if (!trimmedPath || trimmedPath.includes("..")) {
        res.status(400).json({ error: { code: "bad_request", message: `Invalid file path: ${rec.path}` } });
        return;
      }
      files.push({ path: trimmedPath, contents: rec.contents });
    }

    const client = reqClient(req);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);
    if (!project || project.organizationId !== client.id) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }
    if (!project.githubOwner || !project.githubRepo) {
      res.status(409).json({
        error: {
          code: "github_not_configured",
          message: "Set the GitHub owner/repo on this project before committing.",
        },
      });
      return;
    }

    // Secret scan — refuse the push if any rule matches. The UI surfaces
    // path:line:rule so the customer can scrub the file and retry.
    const hits = scanForSecrets(files);
    if (hits.length) {
      res.status(422).json({
        error: {
          code: "secret_detected",
          message: "Refusing to push: possible secrets detected. Remove them and retry.",
          details: hits,
        },
      });
      return;
    }

    const projectCfg = {
      githubOwner: project.githubOwner,
      githubRepo: project.githubRepo,
      githubDefaultBranch: project.githubDefaultBranch,
    };

    try {
      const baseSha = await resolveBranchSha(projectCfg);
      await pushBranchWithFiles(
        projectCfg,
        branchName,
        baseSha,
        files,
        commitMessage,
      );
      const prTitle = typeof body.prTitle === "string" && body.prTitle.trim()
        ? body.prTitle.trim().slice(0, 200)
        : commitMessage.split("\n")[0]!.slice(0, 200);
      const prBody = typeof body.prBody === "string" && body.prBody.trim()
        ? body.prBody.trim()
        : `Pushed from the Machinedog workspace by ${client.email}.`;
      const pr = await openPullRequest(projectCfg, branchName, prTitle, prBody);
      res.status(201).json({
        branch: branchName,
        commitMessage,
        prNumber: pr.prNumber,
        prUrl: pr.prUrl,
        fileCount: files.length,
      });
    } catch (err) {
      if (err instanceof GitHubNotConfiguredError) {
        res.status(409).json({ error: { code: "github_not_configured", message: err.message } });
        return;
      }
      if (err instanceof GitHubApiError) {
        logger.warn(
          { err, projectId, branchName, status: err.status },
          "commit-files github api error",
        );
        res.status(502).json({
          error: { code: "github_error", message: err.message, details: { status: err.status } },
        });
        return;
      }
      logger.error({ err, projectId, branchName }, "commit-files unexpected error");
      res.status(500).json({ error: { code: "internal", message: "Commit failed" } });
    }
  },
);

export default router;
