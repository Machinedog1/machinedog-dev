import { Router, type IRouter, type Request } from "express";
import { eq, desc, and, or, inArray, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectMembersTable,
  changeRequestsTable,
  changeRequestEventsTable,
  organizationsTable,
  type Project,
  type ChangeRequest,
  type ChangeRequestEvent,
  type ChangeRequestEventKind,
  type ChangeRequestStatus,
} from "@workspace/db";
import {
  CreateChangeRequestBody,
  CreateChangeRequestParams,
  ListProjectChangeRequestsParams,
  GetChangeRequestParams,
  DistillChangeRequestParams,
  GenerateChangePatchParams,
  RequestChangePublishParams,
  MarkChangeDeployedParams,
  RollbackChangeRequestParams,
  SubmitAgentChangeRequestParams,
  GetProjectAgentThreadParams,
} from "@workspace/api-zod";
import {
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
} from "../lib/auth";
import {
  distillChangeRequest,
  generateChangePatch,
  type DistilledSpec,
  type GeneratedPatch,
} from "../lib/change-request-claude";
import { sendChangeRequestPublishEmail } from "../lib/mailer";
import { logger } from "../lib/logger";
import {
  resolveBranchSha,
  createSnapshotTag,
  pushBranchWithFiles,
  openPullRequest,
  mergePullRequest,
  openRevertPr,
  computePreviewUrl,
  buildBranchName,
  buildSnapshotTag,
  buildRevertBranchName,
  GitHubNotConfiguredError,
  GitHubApiError,
} from "../lib/github";

const router: IRouter = Router();

type Role = "owner" | "collaborator";

interface ViewableContext {
  project: Project;
  role: Role;
  clientId: number;
  clientEmail: string;
}

async function loadViewableProject(
  projectId: number,
  clientId: number,
  clientEmail: string,
): Promise<{ project: Project; role: Role } | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;
  if (project.organizationId === clientId) {
    return { project, role: "owner" };
  }
  const [member] = await db
    .select()
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, projectId),
        eq(projectMembersTable.status, "active"),
        or(
          eq(projectMembersTable.organizationId, clientId),
          eq(projectMembersTable.email, clientEmail.toLowerCase()),
        ),
      ),
    );
  if (member) return { project, role: "collaborator" };
  return null;
}

async function loadChangeRequestForViewer(
  changeRequestId: number,
  clientId: number,
  clientEmail: string,
): Promise<{ cr: ChangeRequest; ctx: ViewableContext } | null> {
  const [cr] = await db
    .select()
    .from(changeRequestsTable)
    .where(eq(changeRequestsTable.id, changeRequestId));
  if (!cr) return null;
  const access = await loadViewableProject(cr.projectId, clientId, clientEmail);
  if (!access) return null;
  return {
    cr,
    ctx: {
      project: access.project,
      role: access.role,
      clientId,
      clientEmail,
    },
  };
}

async function lookupEmails(
  clientIds: number[],
): Promise<Map<number, string>> {
  const unique = Array.from(new Set(clientIds.filter((id) => Number.isFinite(id))));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: organizationsTable.id, email: organizationsTable.primaryEmail })
    .from(organizationsTable)
    .where(inArray(organizationsTable.id, unique));
  return new Map(rows.map((r) => [r.id, r.email]));
}

function serializeChangeRequest(
  cr: ChangeRequest,
  emails: Map<number, string>,
): SerializedChangeRequest {
  return {
    id: cr.id,
    projectId: cr.projectId,
    organizationId: cr.organizationId,
    requesterEmail: emails.get(cr.organizationId) ?? null,
    status: cr.status,
    title: cr.title,
    rawRequest: cr.rawRequest,
    distilledSpec: (cr.distilledSpec as Record<string, unknown> | null) ?? null,
    patchSummary: cr.patchSummary,
    patchFiles: (cr.patchFiles as Record<string, unknown>[] | null) ?? null,
    githubBranch: cr.githubBranch,
    githubPrNumber: cr.githubPrNumber,
    githubPrUrl: cr.githubPrUrl,
    snapshotTag: cr.snapshotTag,
    snapshotSha: cr.snapshotSha,
    previewUrl: cr.previewUrl,
    errorMessage: cr.errorMessage,
    requestedPublishAt: cr.requestedPublishAt,
    mergedAt: cr.mergedAt,
    deployedAt: cr.deployedAt,
    rolledBackAt: cr.rolledBackAt,
    createdAt: cr.createdAt,
    updatedAt: cr.updatedAt,
  };
}

interface SerializedChangeRequest {
  id: number;
  projectId: number;
  organizationId: number;
  requesterEmail: string | null;
  status: ChangeRequestStatus;
  title: string;
  rawRequest: string;
  distilledSpec: Record<string, unknown> | null;
  patchSummary: string | null;
  patchFiles: Record<string, unknown>[] | null;
  githubBranch: string | null;
  githubPrNumber: number | null;
  githubPrUrl: string | null;
  snapshotTag: string | null;
  snapshotSha: string | null;
  previewUrl: string | null;
  errorMessage: string | null;
  requestedPublishAt: Date | null;
  mergedAt: Date | null;
  deployedAt: Date | null;
  rolledBackAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

async function appendEvent(
  changeRequestId: number,
  kind: ChangeRequestEventKind,
  message: string,
  actorOrganizationId: number | null,
  metadata: Record<string, unknown> | null = null,
): Promise<void> {
  await db.insert(changeRequestEventsTable).values({
    changeRequestId,
    kind,
    message,
    actorOrganizationId: actorOrganizationId ?? null,
    metadata: metadata ?? null,
  });
}

async function updateChangeRequest(
  id: number,
  patch: Partial<typeof changeRequestsTable.$inferInsert>,
): Promise<ChangeRequest> {
  const [updated] = await db
    .update(changeRequestsTable)
    .set(patch)
    .where(eq(changeRequestsTable.id, id))
    .returning();
  return updated;
}

/**
 * Snapshot the project's default branch, push the patch on a fresh branch,
 * and open a PR. Returns the patched ChangeRequest. Caller must ensure the
 * change request has a non-null `patchFiles`. Gracefully no-ops (returns the
 * request unchanged) when the project lacks GitHub config or the connector
 * is not authorized — appends an explanatory event in those cases.
 */
async function pushPatchToGitHub(
  cr: ChangeRequest,
  project: Project,
  actorOrganizationId: number | null,
): Promise<ChangeRequest> {
  const files = (cr.patchFiles as Array<{ path: string; contents: string }> | null) ?? [];
  if (!files.length) {
    return cr;
  }
  if (!project.githubOwner || !project.githubRepo) {
    await appendEvent(
      cr.id,
      "comment",
      "GitHub repo not configured on this project — patch saved locally only.",
      actorOrganizationId,
    );
    return cr;
  }

  const projectCfg = {
    githubOwner: project.githubOwner,
    githubRepo: project.githubRepo,
    githubDefaultBranch: project.githubDefaultBranch,
  };

  try {
    const baseSha = await resolveBranchSha(projectCfg);
    const tagName = buildSnapshotTag(cr.id);
    await createSnapshotTag(projectCfg, baseSha, tagName);
    await appendEvent(cr.id, "snapshot_created", `Snapshot tag ${tagName} created.`, actorOrganizationId, {
      tag: tagName,
      sha: baseSha,
    });

    const branchName = buildBranchName(cr.id, cr.title);
    await pushBranchWithFiles(
      projectCfg,
      branchName,
      baseSha,
      files,
      cr.patchSummary || `Machinedog change request #${cr.id}: ${cr.title}`,
    );
    await appendEvent(cr.id, "branch_pushed", `Pushed branch ${branchName}.`, actorOrganizationId, {
      branch: branchName,
    });

    const prBody = [
      `**Machinedog change request #${cr.id}** — ${cr.title}`,
      "",
      cr.rawRequest,
      "",
      "_Snapshot tag for rollback:_ `" + tagName + "`",
      "_Generated by Claude via Machinedog._",
    ].join("\n");
    const pr = await openPullRequest(
      projectCfg,
      branchName,
      `[Machinedog] ${cr.title}`,
      prBody,
    );
    await appendEvent(cr.id, "pr_opened", `Opened PR #${pr.prNumber}.`, actorOrganizationId, {
      prNumber: pr.prNumber,
      prUrl: pr.prUrl,
    });

    const previewUrl = computePreviewUrl(
      project.previewUrlTemplate,
      branchName,
      project.liveUrl,
    );

    return await updateChangeRequest(cr.id, {
      status: "pr_open",
      githubBranch: branchName,
      githubPrNumber: pr.prNumber,
      githubPrUrl: pr.prUrl,
      snapshotTag: tagName,
      snapshotSha: baseSha,
      previewUrl,
    });
  } catch (err) {
    if (err instanceof GitHubNotConfiguredError) {
      await appendEvent(
        cr.id,
        "comment",
        `GitHub not authorized — ${err.message}`,
        actorOrganizationId,
      );
      return cr;
    }
    const message = err instanceof Error ? err.message : "Unknown GitHub error";
    logger.error({ err, changeRequestId: cr.id }, "GitHub push failed");
    await appendEvent(
      cr.id,
      "error",
      `GitHub push failed: ${message}`,
      actorOrganizationId,
    );
    // Don't flip the whole request to failed — the patch is still saved
    // locally and the operator can retry. Keep status at `patched`.
    return cr;
  }
}

function getPortalUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const dev = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (dev) return `https://${dev.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "https://machinedog.dev";
}

function changeRequestPortalUrl(cr: ChangeRequest): string {
  const portal = getPortalUrl();
  return `${portal}/projects/${cr.projectId}/changes/${cr.id}`;
}

function fail(
  res: Parameters<Parameters<typeof router.post>[1]>[1] & { status: (n: number) => any },
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json({ error: { code, message } });
}

// ─── Routes ────────────────────────────────────────────────────────────────

router.get(
  "/projects/:id/change-requests",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = ListProjectChangeRequestsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid project id" } });
      return;
    }
    const client = req.dbClient!;
    const access = await loadViewableProject(params.data.id, client.id, client.email);
    if (!access) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }
    const rows = await db
      .select()
      .from(changeRequestsTable)
      .where(eq(changeRequestsTable.projectId, access.project.id))
      .orderBy(desc(changeRequestsTable.createdAt));
    const emails = await lookupEmails(rows.map((r) => r.organizationId));
    res.json({ data: rows.map((r) => serializeChangeRequest(r, emails)) });
  },
);

router.post(
  "/projects/:id/change-requests",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = CreateChangeRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid project id" } });
      return;
    }
    const body = CreateChangeRequestBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid request body" } });
      return;
    }
    const wordCount = body.data.rawRequest.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 6) {
      res.status(400).json({
        error: {
          code: "bad_request",
          message: "Describe the change in more than five words so Claude has enough to work with.",
        },
      });
      return;
    }
    const client = req.dbClient!;
    const access = await loadViewableProject(params.data.id, client.id, client.email);
    if (!access) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }
    const fallbackTitle = body.data.rawRequest.split("\n")[0]!.slice(0, 80);
    const [cr] = await db
      .insert(changeRequestsTable)
      .values({
        projectId: access.project.id,
        organizationId: client.id,
        status: "draft",
        title: (body.data.title?.trim() || fallbackTitle).slice(0, 200),
        rawRequest: body.data.rawRequest,
      })
      .returning();
    await appendEvent(cr.id, "created", "Change request submitted.", client.id, {
      titleAuto: !body.data.title,
    });
    const emails = new Map<number, string>([[client.id, client.email]]);
    res.status(201).json(serializeChangeRequest(cr, emails));
  },
);

router.get(
  "/change-requests/:id",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = GetChangeRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid change request id" } });
      return;
    }
    const client = req.dbClient!;
    const loaded = await loadChangeRequestForViewer(params.data.id, client.id, client.email);
    if (!loaded) {
      res.status(404).json({ error: { code: "not_found", message: "Change request not found" } });
      return;
    }
    const events = await db
      .select()
      .from(changeRequestEventsTable)
      .where(eq(changeRequestEventsTable.changeRequestId, loaded.cr.id))
      .orderBy(changeRequestEventsTable.createdAt);

    const actorIds = events
      .map((e) => e.actorOrganizationId)
      .filter((id): id is number => typeof id === "number");
    const emails = await lookupEmails([loaded.cr.organizationId, ...actorIds]);

    const project = loaded.ctx.project;
    res.json({
      changeRequest: serializeChangeRequest(loaded.cr, emails),
      events: events.map((e) => ({
        id: e.id,
        changeRequestId: e.changeRequestId,
        kind: e.kind,
        message: e.message,
        actorOrganizationId: e.actorOrganizationId,
        actorEmail: e.actorOrganizationId ? emails.get(e.actorOrganizationId) ?? null : null,
        metadata: (e.metadata as Record<string, unknown> | null) ?? null,
        createdAt: e.createdAt,
      })),
      project: {
        id: project.id,
        title: project.title,
        githubOwner: project.githubOwner,
        githubRepo: project.githubRepo,
        githubDefaultBranch: project.githubDefaultBranch,
        previewUrlTemplate: project.previewUrlTemplate,
        productionUrl: project.productionUrl,
        githubConfigured: !!(project.githubOwner && project.githubRepo),
      },
    });
  },
);

router.post(
  "/change-requests/:id/distill",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = DistillChangeRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid change request id" } });
      return;
    }
    const client = req.dbClient!;
    const loaded = await loadChangeRequestForViewer(params.data.id, client.id, client.email);
    if (!loaded) {
      res.status(404).json({ error: { code: "not_found", message: "Change request not found" } });
      return;
    }
    const cr = loaded.cr;
    if (
      cr.status !== "draft" &&
      cr.status !== "distilled" &&
      cr.status !== "failed"
    ) {
      res.status(409).json({
        error: { code: "invalid_state", message: `Cannot distill from status "${cr.status}"` },
      });
      return;
    }

    await updateChangeRequest(cr.id, { status: "distilling", errorMessage: null });
    await appendEvent(cr.id, "distill_started", "Distilling raw request with Claude.", client.id);

    let spec: DistilledSpec;
    try {
      spec = await distillChangeRequest(cr.rawRequest, {
        title: loaded.ctx.project.title,
        description: loaded.ctx.project.description,
        summary: loaded.ctx.project.summary,
        githubOwner: loaded.ctx.project.githubOwner,
        githubRepo: loaded.ctx.project.githubRepo,
        githubDefaultBranch: loaded.ctx.project.githubDefaultBranch,
      });
    } catch (err) {
      logger.error({ err, changeRequestId: cr.id }, "Distill failed");
      const message = err instanceof Error ? err.message : "Unknown error";
      await updateChangeRequest(cr.id, { status: "failed", errorMessage: message });
      await appendEvent(cr.id, "distill_failed", `Distill failed: ${message}`, client.id);
      res.status(502).json({ error: { code: "distill_failed", message } });
      return;
    }

    const updated = await updateChangeRequest(cr.id, {
      status: "distilled",
      title: spec.title?.slice(0, 200) || cr.title,
      distilledSpec: spec as unknown as Record<string, unknown>,
    });
    await appendEvent(cr.id, "distill_succeeded", "Spec ready for patch generation.", client.id, {
      fileCount: spec.files.length,
    });

    const emails = await lookupEmails([updated.organizationId]);
    res.json(serializeChangeRequest(updated, emails));
  },
);

router.post(
  "/change-requests/:id/generate-patch",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = GenerateChangePatchParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid change request id" } });
      return;
    }
    const client = req.dbClient!;
    const loaded = await loadChangeRequestForViewer(params.data.id, client.id, client.email);
    if (!loaded) {
      res.status(404).json({ error: { code: "not_found", message: "Change request not found" } });
      return;
    }
    const cr = loaded.cr;
    if (cr.status !== "distilled" && cr.status !== "patched" && cr.status !== "failed") {
      res.status(409).json({
        error: { code: "invalid_state", message: `Cannot generate patch from status "${cr.status}"` },
      });
      return;
    }
    if (!cr.distilledSpec) {
      res.status(409).json({
        error: { code: "no_spec", message: "Distill the request first" },
      });
      return;
    }

    await updateChangeRequest(cr.id, { status: "generating_patch", errorMessage: null });
    await appendEvent(cr.id, "patch_started", "Asking Claude for the file patch.", client.id);

    let patch: GeneratedPatch;
    try {
      patch = await generateChangePatch(
        cr.distilledSpec as unknown as DistilledSpec,
        {
          title: loaded.ctx.project.title,
          description: loaded.ctx.project.description,
          summary: loaded.ctx.project.summary,
          githubOwner: loaded.ctx.project.githubOwner,
          githubRepo: loaded.ctx.project.githubRepo,
          githubDefaultBranch: loaded.ctx.project.githubDefaultBranch,
        },
      );
    } catch (err) {
      logger.error({ err, changeRequestId: cr.id }, "Patch generation failed");
      const message = err instanceof Error ? err.message : "Unknown error";
      await updateChangeRequest(cr.id, { status: "failed", errorMessage: message });
      await appendEvent(cr.id, "patch_failed", `Patch generation failed: ${message}`, client.id);
      res.status(502).json({ error: { code: "patch_failed", message } });
      return;
    }

    const patched = await updateChangeRequest(cr.id, {
      status: "patched",
      patchSummary: patch.summary,
      patchFiles: patch.fileChanges as unknown as Record<string, unknown>[],
    });
    await appendEvent(cr.id, "patch_succeeded", "Patch ready for preview.", client.id, {
      fileCount: patch.fileChanges.length,
      commitMessage: patch.commitMessage,
    });

    // Try to push to GitHub. No-ops gracefully when github not configured.
    const pushed = await pushPatchToGitHub(patched, loaded.ctx.project, client.id);
    const emails = await lookupEmails([pushed.organizationId]);
    res.json(serializeChangeRequest(pushed, emails));
  },
);

router.post(
  "/change-requests/:id/request-publish",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = RequestChangePublishParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid change request id" } });
      return;
    }
    const client = req.dbClient!;
    const loaded = await loadChangeRequestForViewer(params.data.id, client.id, client.email);
    if (!loaded) {
      res.status(404).json({ error: { code: "not_found", message: "Change request not found" } });
      return;
    }
    const cr = loaded.cr;
    const allowed: ChangeRequestStatus[] = ["patched", "pr_open", "merged", "awaiting_publish"];
    if (!allowed.includes(cr.status)) {
      res.status(409).json({
        error: { code: "invalid_state", message: `Cannot request publish from status "${cr.status}"` },
      });
      return;
    }

    const now = new Date();
    await appendEvent(cr.id, "publish_requested", "Client clicked Publish.", client.id);

    const project = loaded.ctx.project;
    let updated: ChangeRequest = cr;

    // Merge-before-notify: if we have an open PR, the merge must succeed
    // before we flip the change request to awaiting_deploy or email the
    // operator. Otherwise the operator might redeploy main before the new
    // code is on it.
    if (cr.githubPrNumber && project.githubOwner && project.githubRepo) {
      try {
        const result = await mergePullRequest(
          {
            githubOwner: project.githubOwner,
            githubRepo: project.githubRepo,
            githubDefaultBranch: project.githubDefaultBranch,
          },
          cr.githubPrNumber,
        );
        if (!result.merged) {
          await appendEvent(
            cr.id,
            "error",
            `GitHub reported PR #${cr.githubPrNumber} as not merged. Resolve in GitHub and retry.`,
            client.id,
          );
          res.status(409).json({
            error: {
              code: "merge_failed",
              message: `PR #${cr.githubPrNumber} could not be merged. Resolve in GitHub then retry.`,
            },
          });
          return;
        }
        updated = await updateChangeRequest(cr.id, {
          status: "awaiting_deploy",
          requestedPublishAt: now,
          mergedAt: new Date(),
        });
        await appendEvent(
          cr.id,
          "pr_merged",
          `Merged PR #${cr.githubPrNumber} into ${project.githubDefaultBranch}.`,
          client.id,
          { prNumber: cr.githubPrNumber, sha: result.sha },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown merge error";
        logger.error({ err, changeRequestId: cr.id }, "PR merge failed");
        await appendEvent(
          cr.id,
          "error",
          `Could not auto-merge PR #${cr.githubPrNumber}: ${message}`,
          client.id,
        );
        // Keep CR at pr_open so the client (or operator) can retry.
        const emailsForFail = await lookupEmails([cr.organizationId]);
        res.status(409).json({
          error: {
            code: "merge_failed",
            message,
            changeRequest: serializeChangeRequest(cr, emailsForFail),
          },
        });
        return;
      }
    } else {
      // No GitHub config — fall back to the manual flow: just mark awaiting
      // deploy and email the operator so they can deploy from Replit.
      updated = await updateChangeRequest(cr.id, {
        status: "awaiting_deploy",
        requestedPublishAt: now,
        mergedAt: cr.mergedAt ?? now,
      });
    }
    const operatorEmail = project.operatorEmail?.trim() || process.env.OPERATOR_EMAIL?.trim() || null;
    if (operatorEmail) {
      try {
        await sendChangeRequestPublishEmail({
          to: operatorEmail,
          projectTitle: project.title,
          changeRequestTitle: updated.title || "Untitled change",
          changeRequestUrl: changeRequestPortalUrl(updated),
          prUrl: updated.githubPrUrl,
          productionUrl: project.productionUrl,
          requesterEmail: client.email,
        });
        await appendEvent(
          cr.id,
          "publish_requested",
          `Operator notified at ${operatorEmail}.`,
          client.id,
          { operatorEmail },
        );
      } catch (err) {
        logger.error({ err, changeRequestId: cr.id }, "Operator notification email failed");
      }
    } else {
      await appendEvent(
        cr.id,
        "publish_requested",
        "No operator email configured — skipping notification.",
        client.id,
      );
    }

    const emails = await lookupEmails([updated.organizationId]);
    res.json(serializeChangeRequest(updated, emails));
  },
);

router.post(
  "/change-requests/:id/mark-deployed",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = MarkChangeDeployedParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid change request id" } });
      return;
    }
    const client = req.dbClient!;
    const loaded = await loadChangeRequestForViewer(params.data.id, client.id, client.email);
    if (!loaded) {
      res.status(404).json({ error: { code: "not_found", message: "Change request not found" } });
      return;
    }
    const cr = loaded.cr;
    if (cr.status !== "awaiting_deploy" && cr.status !== "merged") {
      res.status(409).json({
        error: { code: "invalid_state", message: `Cannot mark deployed from status "${cr.status}"` },
      });
      return;
    }
    const updated = await updateChangeRequest(cr.id, {
      status: "deployed",
      deployedAt: new Date(),
    });
    await appendEvent(cr.id, "deploy_marked", "Marked as deployed in production.", client.id);
    const emails = await lookupEmails([updated.organizationId]);
    res.json(serializeChangeRequest(updated, emails));
  },
);

// ─── Agent pipeline ────────────────────────────────────────────────────────

async function runAgentPipeline(
  changeRequestId: number,
  rawRequest: string,
  projectContext: {
    title: string;
    description: string;
    summary: string;
    githubOwner: string | null;
    githubRepo: string | null;
    githubDefaultBranch: string;
  },
): Promise<void> {
  try {
    await updateChangeRequest(changeRequestId, { status: "distilling", errorMessage: null });
    await appendEvent(
      changeRequestId,
      "distill_started",
      "Reading your project and turning your request into a plan.",
      null,
    );
    const spec = await distillChangeRequest(rawRequest, projectContext);
    await updateChangeRequest(changeRequestId, {
      status: "distilled",
      title: spec.title?.slice(0, 200) || "Untitled change",
      distilledSpec: spec as unknown as Record<string, unknown>,
    });
    await appendEvent(
      changeRequestId,
      "distill_succeeded",
      `Plan ready — ${spec.files.length} file(s) to touch. Drafting the code now…`,
      null,
      { fileCount: spec.files.length },
    );
  } catch (err) {
    logger.error({ err, changeRequestId }, "Agent distill step failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateChangeRequest(changeRequestId, { status: "failed", errorMessage: message });
    await appendEvent(
      changeRequestId,
      "distill_failed",
      `Couldn't form a plan: ${message}`,
      null,
    );
    return;
  }

  try {
    await updateChangeRequest(changeRequestId, { status: "generating_patch" });
    await appendEvent(
      changeRequestId,
      "patch_started",
      "Writing the file changes…",
      null,
    );
    const [crRow] = await db
      .select()
      .from(changeRequestsTable)
      .where(eq(changeRequestsTable.id, changeRequestId));
    if (!crRow || !crRow.distilledSpec) {
      throw new Error("Distilled spec missing");
    }
    const patch = await generateChangePatch(
      crRow.distilledSpec as unknown as DistilledSpec,
      projectContext,
    );
    const patched = await updateChangeRequest(changeRequestId, {
      status: "patched",
      patchSummary: patch.summary,
      patchFiles: patch.fileChanges as unknown as Record<string, unknown>[],
    });
    await appendEvent(
      changeRequestId,
      "patch_succeeded",
      `Drafted ${patch.fileChanges.length} file change(s). Pushing to GitHub for preview…`,
      null,
      {
        fileCount: patch.fileChanges.length,
        commitMessage: patch.commitMessage,
      },
    );

    // Reload the project so we have the latest GitHub config.
    const [latestProject] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, patched.projectId));
    if (latestProject) {
      await pushPatchToGitHub(patched, latestProject, null);
    }
  } catch (err) {
    logger.error({ err, changeRequestId }, "Agent patch step failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateChangeRequest(changeRequestId, { status: "failed", errorMessage: message });
    await appendEvent(
      changeRequestId,
      "patch_failed",
      `Couldn't draft the code: ${message}`,
      null,
    );
  }
}

router.post(
  "/projects/:id/change-requests/agent",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = SubmitAgentChangeRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid project id" } });
      return;
    }
    const body = CreateChangeRequestBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid request body" } });
      return;
    }
    const wordCount = body.data.rawRequest.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 6) {
      res.status(400).json({
        error: {
          code: "bad_request",
          message: "Describe the change in more than five words so the agent has enough to work with.",
        },
      });
      return;
    }
    const client = req.dbClient!;
    const access = await loadViewableProject(params.data.id, client.id, client.email);
    if (!access) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }

    // Enforce one active agent run per project (server-side guard).
    const IN_PROGRESS_STATUSES: ChangeRequestStatus[] = [
      "draft",
      "distilling",
      "distilled",
      "generating_patch",
    ];
    const [active] = await db
      .select({ id: changeRequestsTable.id })
      .from(changeRequestsTable)
      .where(
        and(
          eq(changeRequestsTable.projectId, access.project.id),
          inArray(changeRequestsTable.status, IN_PROGRESS_STATUSES),
        ),
      )
      .limit(1);
    if (active) {
      res.status(409).json({
        error: {
          code: "agent_busy",
          message:
            "The agent is still working on the previous request. Please wait for it to finish.",
        },
      });
      return;
    }

    const fallbackTitle = body.data.rawRequest.split("\n")[0]!.slice(0, 80);
    const [cr] = await db
      .insert(changeRequestsTable)
      .values({
        projectId: access.project.id,
        organizationId: client.id,
        status: "draft",
        title: (body.data.title?.trim() || fallbackTitle).slice(0, 200),
        rawRequest: body.data.rawRequest,
      })
      .returning();
    await appendEvent(cr.id, "created", "Request received.", client.id);

    const projectContext = {
      title: access.project.title,
      description: access.project.description ?? "",
      summary: access.project.summary ?? "",
      githubOwner: access.project.githubOwner,
      githubRepo: access.project.githubRepo,
      githubDefaultBranch: access.project.githubDefaultBranch,
    };

    void runAgentPipeline(cr.id, body.data.rawRequest, projectContext).catch((err) => {
      logger.error({ err, changeRequestId: cr.id }, "Agent pipeline crashed");
    });

    const emails = new Map<number, string>([[client.id, client.email]]);
    res.status(201).json(serializeChangeRequest(cr, emails));
  },
);

router.get(
  "/projects/:id/agent-thread",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = GetProjectAgentThreadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid project id" } });
      return;
    }
    const client = req.dbClient!;
    const access = await loadViewableProject(params.data.id, client.id, client.email);
    if (!access) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }
    const project = access.project;

    const crs = await db
      .select()
      .from(changeRequestsTable)
      .where(eq(changeRequestsTable.projectId, project.id))
      .orderBy(changeRequestsTable.createdAt);

    const crIds = crs.map((c) => c.id);
    const events: ChangeRequestEvent[] = crIds.length
      ? await db
          .select()
          .from(changeRequestEventsTable)
          .where(inArray(changeRequestEventsTable.changeRequestId, crIds))
          .orderBy(changeRequestEventsTable.createdAt)
      : [];

    const actorIds = events
      .map((e) => e.actorOrganizationId)
      .filter((id): id is number => typeof id === "number");
    const allClientIds = [...crs.map((c) => c.organizationId), ...actorIds];
    const emails = await lookupEmails(allClientIds);

    const eventsByCr = new Map<number, ChangeRequestEvent[]>();
    for (const e of events) {
      const arr = eventsByCr.get(e.changeRequestId) ?? [];
      arr.push(e);
      eventsByCr.set(e.changeRequestId, arr);
    }

    res.json({
      project: {
        id: project.id,
        title: project.title,
        githubOwner: project.githubOwner,
        githubRepo: project.githubRepo,
        githubDefaultBranch: project.githubDefaultBranch,
        previewUrlTemplate: project.previewUrlTemplate,
        productionUrl: project.productionUrl,
        liveUrl: project.liveUrl,
        githubConfigured: !!(project.githubOwner && project.githubRepo),
      },
      items: crs.map((cr) => ({
        changeRequest: serializeChangeRequest(cr, emails),
        events: (eventsByCr.get(cr.id) ?? []).map((e) => ({
          id: e.id,
          changeRequestId: e.changeRequestId,
          kind: e.kind,
          message: e.message,
          actorOrganizationId: e.actorOrganizationId,
          actorEmail: e.actorOrganizationId ? emails.get(e.actorOrganizationId) ?? null : null,
          metadata: (e.metadata as Record<string, unknown> | null) ?? null,
          createdAt: e.createdAt,
        })),
      })),
    });
  },
);

router.post(
  "/change-requests/:id/rollback",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = RollbackChangeRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid change request id" } });
      return;
    }
    const client = req.dbClient!;
    const loaded = await loadChangeRequestForViewer(params.data.id, client.id, client.email);
    if (!loaded) {
      res.status(404).json({ error: { code: "not_found", message: "Change request not found" } });
      return;
    }
    const cr = loaded.cr;
    if (cr.status !== "deployed" && cr.status !== "awaiting_deploy" && cr.status !== "merged") {
      res.status(409).json({
        error: { code: "invalid_state", message: `Cannot rollback from status "${cr.status}"` },
      });
      return;
    }
    const project = loaded.ctx.project;
    await appendEvent(
      cr.id,
      "rollback_requested",
      "Rollback requested.",
      client.id,
      { snapshotTag: cr.snapshotTag },
    );

    let updated: ChangeRequest = cr;

    // If we have a snapshot tag and GitHub config, open a revert PR. The PR
    // contains a new commit on top of main whose tree matches the snapshot
    // — so it's strictly ahead of main and GitHub will accept it. Operator
    // merges + redeploys. We DON'T mark `rolled_back` until the revert PR
    // is at least open; otherwise the UI lies about what happened.
    if (cr.snapshotTag && project.githubOwner && project.githubRepo) {
      try {
        const revertBranch = buildRevertBranchName(cr.id);
        const revertPr = await openRevertPr(
          {
            githubOwner: project.githubOwner,
            githubRepo: project.githubRepo,
            githubDefaultBranch: project.githubDefaultBranch,
          },
          revertBranch,
          cr.snapshotTag,
          `[Machinedog] Revert change #${cr.id} (${cr.title})`,
          [
            `Reverts Machinedog change request #${cr.id} by replaying`,
            `the tree from snapshot tag \`${cr.snapshotTag}\` on top of`,
            `the current default branch.`,
            "",
            "Merge this PR to roll back, then redeploy in Replit.",
          ].join("\n"),
        );
        await appendEvent(
          cr.id,
          "rollback_pr_opened",
          `Opened rollback PR #${revertPr.prNumber}.`,
          client.id,
          { prNumber: revertPr.prNumber, prUrl: revertPr.prUrl, branch: revertPr.branch },
        );
        updated = await updateChangeRequest(cr.id, {
          status: "rolled_back",
          rolledBackAt: new Date(),
          githubPrNumber: revertPr.prNumber,
          githubPrUrl: revertPr.prUrl,
          githubBranch: revertPr.branch,
        });
        await appendEvent(cr.id, "rolled_back", "Marked as rolled back.", client.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown revert error";
        logger.error({ err, changeRequestId: cr.id }, "Revert PR failed");
        await appendEvent(
          cr.id,
          "error",
          `Couldn't open revert PR: ${message}. Operator should restore the snapshot manually in GitHub.`,
          client.id,
        );
        // Keep prior status — don't lie that it's rolled back.
        const emailsForFail = await lookupEmails([cr.organizationId]);
        res.status(502).json({
          error: {
            code: "revert_failed",
            message,
            changeRequest: serializeChangeRequest(cr, emailsForFail),
          },
        });
        return;
      }
    } else {
      // No GitHub config — best we can do is mark rolled back so the UI
      // reflects the operator's intent. They'll handle the actual revert
      // out-of-band.
      updated = await updateChangeRequest(cr.id, {
        status: "rolled_back",
        rolledBackAt: new Date(),
      });
      await appendEvent(
        cr.id,
        "rolled_back",
        "Marked as rolled back (no GitHub config — manual revert required).",
        client.id,
      );
    }

    const emails = await lookupEmails([updated.organizationId]);
    res.json(serializeChangeRequest(updated, emails));
  },
);

export default router;
