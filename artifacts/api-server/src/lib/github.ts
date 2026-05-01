/**
 * GitHub helpers for the change-request workflow.
 *
 * Uses the Replit Connectors SDK proxy — the Replit GitHub OAuth integration
 * must be authorized at the account level, otherwise every call throws
 * `GitHubNotConfiguredError` and the change-request route catches it and
 * leaves the request in its previous state.
 *
 * Flow per change request:
 *   1. resolveBaseSha(project)          → current HEAD of default branch
 *   2. createSnapshotTag(project, sha, name)
 *   3. pushBranchWithFiles(project, branch, baseSha, files, msg)
 *   4. openPullRequest(project, branch, title, body)
 *   5. (later) mergePullRequest(project, prNumber)
 *   6. (later) openRevertPr(project, branchName, snapshotTag)
 *
 * All file contents are uploaded as blobs and assembled into a single tree
 * commit via the Git Data API, so partial pushes can't leave the branch in a
 * half-baked state.
 */

import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

export class GitHubNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubNotConfiguredError";
  }
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export interface GitHubProjectConfig {
  githubOwner: string | null;
  githubRepo: string | null;
  githubDefaultBranch: string;
}

export interface PushFile {
  path: string;
  contents: string;
}

const connectors = new ReplitConnectors();

function requireRepo(project: GitHubProjectConfig): {
  owner: string;
  repo: string;
  defaultBranch: string;
} {
  const owner = project.githubOwner?.trim();
  const repo = project.githubRepo?.trim();
  if (!owner || !repo) {
    throw new GitHubNotConfiguredError(
      "GitHub repo not set on this project (owner/repo missing).",
    );
  }
  return {
    owner,
    repo,
    defaultBranch: project.githubDefaultBranch || "main",
  };
}

async function gh<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await connectors.proxy("github", path, {
      method: opts.method ?? "GET",
      body: opts.body,
      headers: { accept: "application/vnd.github+json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.toLowerCase().includes("not connected") ||
      message.toLowerCase().includes("no connection")
    ) {
      throw new GitHubNotConfiguredError(
        "GitHub connector not authorized for this Repl. Visit Replit > Integrations > GitHub.",
      );
    }
    throw err;
  }

  if (response.status === 404) {
    const text = await response.text().catch(() => "");
    throw new GitHubApiError(
      `GitHub 404 for ${opts.method ?? "GET"} ${path}: ${text || "not found"}`,
      404,
      text,
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GitHubApiError(
      `GitHub ${response.status} for ${opts.method ?? "GET"} ${path}: ${text}`,
      response.status,
      text,
    );
  }
  if (response.status === 204) {
    return undefined as unknown as T;
  }
  return (await response.json()) as T;
}

export async function resolveBranchSha(
  project: GitHubProjectConfig,
  branch?: string,
): Promise<string> {
  const { owner, repo, defaultBranch } = requireRepo(project);
  const target = branch ?? defaultBranch;
  const ref = await gh<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(target)}`,
  );
  return ref.object.sha;
}

export async function createSnapshotTag(
  project: GitHubProjectConfig,
  sha: string,
  tagName: string,
): Promise<{ tag: string; sha: string }> {
  const { owner, repo } = requireRepo(project);

  // Create an annotated tag object first (gives us a real tagger + message
  // for audit), then point a ref at it. Lightweight tags (ref-only) work but
  // the spec calls for annotated tags so rollback history is self-describing.
  const tagObject = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/git/tags`,
    {
      method: "POST",
      body: {
        tag: tagName,
        message: `Machinedog snapshot before applying change.`,
        object: sha,
        type: "commit",
        tagger: {
          name: "Machinedog",
          email: "ops@machinedog.com",
          date: new Date().toISOString(),
        },
      },
    },
  );

  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    body: { ref: `refs/tags/${tagName}`, sha: tagObject.sha },
  });
  return { tag: tagName, sha };
}

export async function pushBranchWithFiles(
  project: GitHubProjectConfig,
  branch: string,
  baseSha: string,
  files: PushFile[],
  commitMessage: string,
): Promise<{ branch: string; commitSha: string }> {
  const { owner, repo } = requireRepo(project);
  if (files.length === 0) {
    throw new Error("pushBranchWithFiles called with no files");
  }

  // Upload every file as a blob.
  const blobs = await Promise.all(
    files.map(async (file) => {
      const blob = await gh<{ sha: string }>(
        `/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          body: { content: file.contents, encoding: "utf-8" },
        },
      );
      return { path: file.path, sha: blob.sha };
    }),
  );

  // Build a tree on top of the base commit's tree.
  const baseCommit = await gh<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${baseSha}`,
  );

  const tree = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      body: {
        base_tree: baseCommit.tree.sha,
        tree: blobs.map((b) => ({
          path: b.path,
          mode: "100644",
          type: "blob",
          sha: b.sha,
        })),
      },
    },
  );

  const commit = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message: commitMessage,
        tree: tree.sha,
        parents: [baseSha],
      },
    },
  );

  // Create the branch ref. If it already exists, force-update it so retries
  // are idempotent.
  const refPath = `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`;
  try {
    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 422) {
      // Ref exists — fast-forward update.
      await gh(refPath, {
        method: "PATCH",
        body: { sha: commit.sha, force: true },
      });
    } else {
      throw err;
    }
  }

  return { branch, commitSha: commit.sha };
}

export async function openPullRequest(
  project: GitHubProjectConfig,
  branch: string,
  title: string,
  body: string,
): Promise<{ prNumber: number; prUrl: string }> {
  const { owner, repo, defaultBranch } = requireRepo(project);
  const pr = await gh<{ number: number; html_url: string }>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: {
        title,
        body,
        head: branch,
        base: defaultBranch,
        maintainer_can_modify: true,
      },
    },
  );
  return { prNumber: pr.number, prUrl: pr.html_url };
}

export async function mergePullRequest(
  project: GitHubProjectConfig,
  prNumber: number,
  method: "merge" | "squash" | "rebase" = "squash",
): Promise<{ merged: boolean; sha: string | null }> {
  const { owner, repo } = requireRepo(project);
  try {
    const result = await gh<{ merged: boolean; sha: string }>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      {
        method: "PUT",
        body: { merge_method: method },
      },
    );
    return { merged: result.merged, sha: result.sha ?? null };
  } catch (err) {
    if (err instanceof GitHubApiError && (err.status === 405 || err.status === 409)) {
      // PR not mergeable (conflicts, unstable, already merged). Surface a
      // clean error to the caller without spinning the change request into a
      // hard fail.
      throw new GitHubApiError(
        `PR #${prNumber} is not mergeable yet (${err.status}).`,
        err.status,
        err.responseBody,
      );
    }
    throw err;
  }
}

export async function openRevertPr(
  project: GitHubProjectConfig,
  branchName: string,
  snapshotTag: string,
  prTitle: string,
  prBody: string,
): Promise<{ prNumber: number; prUrl: string; branch: string }> {
  const { owner, repo, defaultBranch } = requireRepo(project);

  // Resolve the snapshot tag down to its underlying commit sha.
  const tagRef = await gh<{ object: { sha: string; type: string } }>(
    `/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(snapshotTag)}`,
  );
  let snapshotCommitSha = tagRef.object.sha;
  if (tagRef.object.type === "tag") {
    const tag = await gh<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/tags/${snapshotCommitSha}`,
    );
    snapshotCommitSha = tag.object.sha;
  }

  // Pull the snapshot's tree so we can replay it on top of current default
  // branch HEAD. This produces a NEW commit that's strictly ahead of main
  // — meaning GitHub will let us open a PR (no "no commits between" 422).
  const snapshotCommit = await gh<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${snapshotCommitSha}`,
  );

  const baseSha = await resolveBranchSha(project);
  if (baseSha === snapshotCommitSha) {
    // Default branch already at snapshot — nothing to revert.
    throw new GitHubApiError(
      "Default branch is already at the snapshot — nothing to revert.",
      409,
      undefined,
    );
  }

  const revertCommit = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message: `[Machinedog rollback] Restore tree from snapshot ${snapshotTag}`,
        tree: snapshotCommit.tree.sha,
        parents: [baseSha],
      },
    },
  );

  // Push the revert branch (idempotent — force-update if it already exists).
  try {
    await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branchName}`, sha: revertCommit.sha },
    });
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 422) {
      await gh(
        `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
        { method: "PATCH", body: { sha: revertCommit.sha, force: true } },
      );
    } else {
      throw err;
    }
  }

  const pr = await gh<{ number: number; html_url: string }>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: {
        title: prTitle,
        body: prBody,
        head: branchName,
        base: defaultBranch,
        maintainer_can_modify: true,
      },
    },
  );
  return { prNumber: pr.number, prUrl: pr.html_url, branch: branchName };
}

/**
 * Build the per-CR preview URL.
 *  - If `previewUrlTemplate` contains "{branch}", substitute the branch.
 *  - Otherwise fall back to the project's dev URL (`liveUrl`). We never
 *    return the raw template — without {branch} it's not a real per-branch
 *    URL and would mislead the operator into thinking they're previewing
 *    the new code when they're actually looking at main.
 */
export function computePreviewUrl(
  template: string | null,
  branch: string,
  fallbackDevUrl: string | null,
): string | null {
  if (template && template.includes("{branch}")) {
    return template.replace(/\{branch\}/g, branch);
  }
  return fallbackDevUrl ?? null;
}

export function buildBranchName(changeRequestId: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    || "change";
  return `machinedog/cr-${changeRequestId}-${slug}`;
}

export function buildSnapshotTag(changeRequestId: number): string {
  // Millisecond-precision timestamp + 4-char random nonce so rapid retries
  // (which can happen when an operator clicks a button twice or the agent
  // pipeline retries) never collide on the GitHub side.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = Math.random().toString(36).slice(2, 6);
  return `machinedog/snapshot-cr-${changeRequestId}-${ts}-${nonce}`;
}

export function buildRevertBranchName(changeRequestId: number): string {
  return `machinedog/revert-cr-${changeRequestId}`;
}

export { logger as githubLogger };
