import { Router, type IRouter, type Request } from "express";
import { eq, desc, and, or, inArray, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectMembersTable,
  changeRequestsTable,
  changeRequestEventsTable,
  clientsTable,
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
  if (project.clientId === clientId) {
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
          eq(projectMembersTable.clientId, clientId),
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
    .select({ id: clientsTable.id, email: clientsTable.email })
    .from(clientsTable)
    .where(inArray(clientsTable.id, unique));
  return new Map(rows.map((r) => [r.id, r.email]));
}

function serializeChangeRequest(
  cr: ChangeRequest,
  emails: Map<number, string>,
): SerializedChangeRequest {
  return {
    id: cr.id,
    projectId: cr.projectId,
    requesterClientId: cr.requesterClientId,
    requesterEmail: emails.get(cr.requesterClientId) ?? null,
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
  requesterClientId: number;
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
  actorClientId: number | null,
  metadata: Record<string, unknown> | null = null,
): Promise<void> {
  await db.insert(changeRequestEventsTable).values({
    changeRequestId,
    kind,
    message,
    actorClientId: actorClientId ?? null,
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
    const emails = await lookupEmails(rows.map((r) => r.requesterClientId));
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
        requesterClientId: client.id,
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
      .map((e) => e.actorClientId)
      .filter((id): id is number => typeof id === "number");
    const emails = await lookupEmails([loaded.cr.requesterClientId, ...actorIds]);

    const project = loaded.ctx.project;
    res.json({
      changeRequest: serializeChangeRequest(loaded.cr, emails),
      events: events.map((e) => ({
        id: e.id,
        changeRequestId: e.changeRequestId,
        kind: e.kind,
        message: e.message,
        actorClientId: e.actorClientId,
        actorEmail: e.actorClientId ? emails.get(e.actorClientId) ?? null : null,
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

    const emails = await lookupEmails([updated.requesterClientId]);
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

    const updated = await updateChangeRequest(cr.id, {
      status: "patched",
      patchSummary: patch.summary,
      patchFiles: patch.fileChanges as unknown as Record<string, unknown>[],
    });
    await appendEvent(cr.id, "patch_succeeded", "Patch ready for preview.", client.id, {
      fileCount: patch.fileChanges.length,
      commitMessage: patch.commitMessage,
    });
    const emails = await lookupEmails([updated.requesterClientId]);
    res.json(serializeChangeRequest(updated, emails));
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
    const updated = await updateChangeRequest(cr.id, {
      status: "awaiting_deploy",
      requestedPublishAt: now,
      mergedAt: cr.mergedAt ?? now,
    });
    await appendEvent(cr.id, "publish_requested", "Client clicked Publish.", client.id);

    const project = loaded.ctx.project;
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

    const emails = await lookupEmails([updated.requesterClientId]);
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
    const emails = await lookupEmails([updated.requesterClientId]);
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
    await updateChangeRequest(changeRequestId, {
      status: "patched",
      patchSummary: patch.summary,
      patchFiles: patch.fileChanges as unknown as Record<string, unknown>[],
    });
    await appendEvent(
      changeRequestId,
      "patch_succeeded",
      `Drafted ${patch.fileChanges.length} file change(s). Review the plan and click Publish when you're happy.`,
      null,
      {
        fileCount: patch.fileChanges.length,
        commitMessage: patch.commitMessage,
      },
    );
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
        requesterClientId: client.id,
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
      .map((e) => e.actorClientId)
      .filter((id): id is number => typeof id === "number");
    const allClientIds = [...crs.map((c) => c.requesterClientId), ...actorIds];
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
          actorClientId: e.actorClientId,
          actorEmail: e.actorClientId ? emails.get(e.actorClientId) ?? null : null,
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
    const updated = await updateChangeRequest(cr.id, {
      status: "rolled_back",
      rolledBackAt: new Date(),
    });
    await appendEvent(
      cr.id,
      "rollback_requested",
      "Rollback requested. Operator should restore the snapshot in Replit.",
      client.id,
      { snapshotTag: cr.snapshotTag },
    );
    await appendEvent(cr.id, "rolled_back", "Marked as rolled back.", client.id);
    const emails = await lookupEmails([updated.requesterClientId]);
    res.json(serializeChangeRequest(updated, emails));
  },
);

export default router;
