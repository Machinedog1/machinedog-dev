/**
 * Phase 4 — AI Console routes.
 *
 * Public surface (project-scoped, owner+collaborator):
 *   GET    /api/projects/:id/ai/conversations
 *   POST   /api/projects/:id/ai/conversations
 *   GET    /api/ai/conversations/:cid                  (with messages + changes)
 *   POST   /api/ai/conversations/:cid/messages         (send a prompt)
 *   POST   /api/ai/proposed-changes/:pcId/accept       (commit or open as CR)
 *   POST   /api/ai/proposed-changes/:pcId/reject
 *   GET    /api/ai/categories                          (mode selector metadata)
 */
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectMembersTable,
  changeRequestsTable,
  changeRequestEventsTable,
  aiConversationsTable,
  aiMessagesTable,
  aiProposedChangesTable,
  organizationsTable,
  AI_MODEL_CATEGORIES,
  type AiConversation,
  type AiMessage,
  type AiProposedChange,
  type AiModelCategory,
  type Project,
} from "@workspace/db";
import {
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
} from "../lib/auth";
import {
  aiSend,
  phiPreflight,
  loadProjectAndOrg,
  checkHealthcareGating,
} from "../lib/ai-service";
import {
  resolveCategoryModel,
  computeTokenCost,
  hasEnabledProviders,
} from "../lib/ai-registry";
import { getBalance } from "../lib/token-service";
import { applyProposedChanges } from "../lib/ai-apply-changes";
import { pushPatchToGitHub, type PatchFileEntry } from "./change-requests";
import { recordAuditEventAsync, reqAuditMeta } from "../lib/audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type Role = "owner" | "collaborator";

async function loadViewable(
  projectId: number,
  clientId: number,
  clientEmail: string,
): Promise<{ project: Project; role: Role } | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;
  if (project.organizationId === clientId) return { project, role: "owner" };
  const [member] = await db
    .select()
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, projectId),
        eq(projectMembersTable.status, "active"),
        eq(projectMembersTable.organizationId, clientId),
      ),
    )
    .limit(1);
  if (member) return { project, role: "collaborator" };
  // Email-based membership fallback
  const [memberByEmail] = await db
    .select()
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, projectId),
        eq(projectMembersTable.status, "active"),
        eq(projectMembersTable.email, clientEmail.toLowerCase()),
      ),
    )
    .limit(1);
  if (memberByEmail) return { project, role: "collaborator" };
  return null;
}

function fail(
  res: Parameters<Parameters<typeof router.post>[1]>[1] & {
    status: (n: number) => any;
  },
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  res.status(status).json({
    error: { code, message, ...(details ? { details } : {}) },
  });
}

function serializeConversation(c: AiConversation) {
  return {
    id: c.id,
    projectId: c.projectId,
    title: c.title,
    lastCategory: c.lastCategory,
    archivedAt: c.archivedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function serializeMessage(m: AiMessage) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    providerSlug: m.providerSlug,
    modelKey: m.modelKey,
    category: m.category,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    tokenCost: m.tokenCost,
    metadata: (m.metadata as Record<string, unknown> | null) ?? null,
    createdAt: m.createdAt,
  };
}

function serializeProposedChange(c: AiProposedChange) {
  return {
    id: c.id,
    conversationId: c.conversationId,
    messageId: c.messageId,
    projectId: c.projectId,
    op: c.op,
    path: c.path,
    newPath: c.newPath,
    contents: c.contents,
    previousContents: c.previousContents,
    status: c.status,
    appliedAt: c.appliedAt,
    appliedAs: c.appliedAs,
    appliedChangeRequestId: c.appliedChangeRequestId,
    rejectedAt: c.rejectedAt,
    createdAt: c.createdAt,
  };
}

// ─── Categories metadata (mode selector) ───────────────────────────────────

router.get(
  "/ai/categories",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (_req, res): Promise<void> => {
    const out: Array<{
      id: AiModelCategory;
      label: string;
      description: string;
      configured: boolean;
      modelKey: string | null;
      providerSlug: string | null;
      estimatedCostPerCall: number | null;
    }> = [];
    const anyProvider = await hasEnabledProviders();
    for (const id of AI_MODEL_CATEGORIES) {
      const resolved = await resolveCategoryModel(id);
      // `auto` does not require a registry row of its own — it routes to one
      // of the other lanes server-side. It's "configured" whenever ANY
      // enabled provider/model exists in the registry, and falls back to the
      // labeled mock otherwise (which is itself a working state).
      const configured =
        id === "auto" ? true : !!resolved;
      out.push({
        id,
        label: labelFor(id),
        description: descriptionFor(id),
        configured,
        modelKey: resolved?.model.modelKey ?? null,
        providerSlug: resolved?.provider.slug ?? null,
        // Rough estimate: 500 input + 1500 output tokens per call.
        estimatedCostPerCall: resolved
          ? computeTokenCost(resolved.model, 500, 1500)
          : null,
      });
    }
    res.json({ data: out, anyProviderEnabled: anyProvider });
  },
);

function labelFor(id: AiModelCategory): string {
  switch (id) {
    case "auto":
      return "Auto";
    case "fast":
      return "Fast";
    case "coding":
      return "Coding";
    case "architect":
      return "Architect";
    case "long_context":
      return "Long Context";
    case "healthcare_safe":
      return "Healthcare Safe";
  }
}

function descriptionFor(id: AiModelCategory): string {
  switch (id) {
    case "auto":
      return "Pick the best model based on task type, project size, plan, and balance.";
    case "fast":
      return "Low-cost lane for summaries, UI copy, and small fixes.";
    case "coding":
      return "Default lane: code generation, debugging, file edits.";
    case "architect":
      return "High-value lane: large refactors, schema migrations, security reviews.";
    case "long_context":
      return "Repo imports, route audits, full-codebase analysis.";
    case "healthcare_safe":
      return "Locked unless plan + signed BAA + HIPAA deployment + project PHI mode are all enabled.";
  }
}

// ─── Conversations ─────────────────────────────────────────────────────────

router.get(
  "/projects/:id/ai/conversations",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId))
      return fail(res, 400, "bad_request", "Invalid project id");
    const client = req.dbClient!;
    const access = await loadViewable(projectId, client.id, client.email);
    if (!access) return fail(res, 404, "not_found", "Project not found");
    const rows = await db
      .select()
      .from(aiConversationsTable)
      .where(eq(aiConversationsTable.projectId, projectId))
      .orderBy(desc(aiConversationsTable.updatedAt))
      .limit(50);
    res.json({ data: rows.map(serializeConversation) });
  },
);

router.post(
  "/projects/:id/ai/conversations",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId))
      return fail(res, 400, "bad_request", "Invalid project id");
    const client = req.dbClient!;
    const access = await loadViewable(projectId, client.id, client.email);
    if (!access) return fail(res, 404, "not_found", "Project not found");
    const title =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim().slice(0, 200)
        : "New conversation";
    const [created] = await db
      .insert(aiConversationsTable)
      .values({
        organizationId: access.project.organizationId,
        projectId,
        createdByClientId: client.id,
        title,
      })
      .returning();
    res.status(201).json(serializeConversation(created));
  },
);

router.get(
  "/ai/conversations/:cid",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const cid = Number(req.params.cid);
    if (!Number.isFinite(cid))
      return fail(res, 400, "bad_request", "Invalid conversation id");
    const [conv] = await db
      .select()
      .from(aiConversationsTable)
      .where(eq(aiConversationsTable.id, cid));
    if (!conv) return fail(res, 404, "not_found", "Conversation not found");
    const client = req.dbClient!;
    const access = await loadViewable(conv.projectId, client.id, client.email);
    if (!access) return fail(res, 404, "not_found", "Conversation not found");
    const messages = await db
      .select()
      .from(aiMessagesTable)
      .where(eq(aiMessagesTable.conversationId, cid))
      .orderBy(asc(aiMessagesTable.createdAt));
    const changes = messages.length
      ? await db
          .select()
          .from(aiProposedChangesTable)
          .where(
            inArray(
              aiProposedChangesTable.messageId,
              messages.map((m) => m.id),
            ),
          )
      : [];
    res.json({
      conversation: serializeConversation(conv),
      messages: messages.map(serializeMessage),
      proposedChanges: changes.map(serializeProposedChange),
    });
  },
);

// ─── Send a prompt ─────────────────────────────────────────────────────────

router.post(
  "/ai/conversations/:cid/messages",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const cid = Number(req.params.cid);
    if (!Number.isFinite(cid))
      return fail(res, 400, "bad_request", "Invalid conversation id");
    const promptText =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const requestedCategoryRaw =
      typeof req.body?.category === "string" ? req.body.category : "coding";
    if (!promptText)
      return fail(res, 400, "bad_request", "Prompt content is required");
    if (
      !(AI_MODEL_CATEGORIES as readonly string[]).includes(requestedCategoryRaw)
    ) {
      return fail(res, 400, "bad_request", "Invalid category");
    }
    const requestedCategory = requestedCategoryRaw as AiModelCategory;

    const [conv] = await db
      .select()
      .from(aiConversationsTable)
      .where(eq(aiConversationsTable.id, cid));
    if (!conv) return fail(res, 404, "not_found", "Conversation not found");
    const client = req.dbClient!;
    const access = await loadViewable(conv.projectId, client.id, client.email);
    if (!access) return fail(res, 404, "not_found", "Conversation not found");
    const loaded = await loadProjectAndOrg(conv.projectId);
    if (!loaded) return fail(res, 404, "not_found", "Project not found");

    // PHI preflight runs BEFORE we persist any user content. If the prompt
    // is blocked we store only a sanitized placeholder so PHI never lands
    // in the conversation row.
    const preflight = await phiPreflight(promptText, {
      organizationId: loaded.project.organizationId,
      projectId: loaded.project.id,
      userClientId: client.id,
      project: loaded.project,
    });
    if (preflight.blocked) {
      const [userPlaceholder] = await db
        .insert(aiMessagesTable)
        .values({
          conversationId: cid,
          role: "user",
          content: `[PHI guard blocked prompt — content not stored. Rules: ${preflight.rules.join(", ")}]`,
          metadata: {
            phiBlocked: true,
            rules: preflight.rules,
          },
        })
        .returning();
      const [systemMsg] = await db
        .insert(aiMessagesTable)
        .values({
          conversationId: cid,
          role: "assistant",
          content: preflight.blockedMessage,
          providerSlug: "n/a",
          modelKey: "n/a",
          category: requestedCategory,
          inputTokens: 0,
          outputTokens: 0,
          tokenCost: 0,
          metadata: {
            ok: false,
            status: "blocked_phi",
            mocked: false,
            blockReason: {
              code: "phi_blocked",
              message: "Prompt contains content that looks like PHI.",
              details: { rules: preflight.rules },
            },
          },
        })
        .returning();
      res.json({
        userMessage: serializeMessage(userPlaceholder),
        assistantMessage: serializeMessage(systemMsg),
        proposedChanges: [],
        result: {
          ok: false,
          status: "blocked_phi",
          mocked: false,
          category: requestedCategory,
          providerSlug: "n/a",
          modelKey: "n/a",
          inputTokens: 0,
          outputTokens: 0,
          tokenCost: 0,
          blockReason: {
            code: "phi_blocked",
            message: "Prompt contains content that looks like PHI.",
            details: { rules: preflight.rules },
          },
        },
      });
      return;
    }

    // Prompt is clean — persist the real user message and proceed.
    const [userMsg] = await db
      .insert(aiMessagesTable)
      .values({
        conversationId: cid,
        role: "user",
        content: promptText,
      })
      .returning();

    // Build the message list from the persisted thread.
    const history = await db
      .select()
      .from(aiMessagesTable)
      .where(eq(aiMessagesTable.conversationId, cid))
      .orderBy(asc(aiMessagesTable.createdAt));
    const messagesForProvider = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const result = await aiSend(
      {
        category: requestedCategory,
        messages: messagesForProvider,
        projectContext: {
          title: loaded.project.title,
          description: loaded.project.description,
          summary: loaded.project.summary,
          framework: loaded.project.framework,
          githubOwner: loaded.project.githubOwner,
          githubRepo: loaded.project.githubRepo,
        },
      },
      {
        organizationId: loaded.project.organizationId,
        projectId: loaded.project.id,
        userClientId: client.id,
        project: loaded.project,
        org: loaded.org,
      },
    );

    // Persist the assistant message.
    const [assistantMsg] = await db
      .insert(aiMessagesTable)
      .values({
        conversationId: cid,
        role: "assistant",
        content: result.text,
        providerSlug: result.providerSlug,
        modelKey: result.modelKey,
        category: result.category,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tokenCost: result.tokenCost,
        metadata: {
          ok: result.ok,
          status: result.status,
          mocked: result.mocked,
          blockReason: result.blockReason ?? null,
        },
      })
      .returning();

    // Persist proposed changes. We snapshot previousContents from the
    // current project_files table so the diff viewer can render before/after
    // even after the file changes.
    const insertedChanges: AiProposedChange[] = [];
    if (result.proposedChanges.length) {
      const { projectFilesTable } = await import("@workspace/db");
      const { ObjectStorageService } = await import("../lib/objectStorage");
      const storage = new ObjectStorageService();
      for (const c of result.proposedChanges) {
        let previous: string | null = null;
        try {
          const [existing] = await db
            .select()
            .from(projectFilesTable)
            .where(
              and(
                eq(projectFilesTable.projectId, loaded.project.id),
                eq(projectFilesTable.name, c.path),
              ),
            )
            .limit(1);
          if (existing && c.op !== "create") {
            const file = await storage.getObjectEntityFile(
              existing.objectPath,
            );
            const [buf] = await file.download();
            previous = buf.toString("utf8");
          }
        } catch (err) {
          logger.warn(
            { err, path: c.path },
            "ai: failed to snapshot previous contents",
          );
        }
        const [row] = await db
          .insert(aiProposedChangesTable)
          .values({
            conversationId: cid,
            messageId: assistantMsg.id,
            projectId: loaded.project.id,
            op: c.op,
            path: c.path,
            newPath: c.newPath ?? null,
            contents: c.contents ?? null,
            previousContents: previous,
          })
          .returning();
        insertedChanges.push(row);
      }
    }

    // Bump the conversation's lastCategory + updatedAt.
    await db
      .update(aiConversationsTable)
      .set({ lastCategory: result.category })
      .where(eq(aiConversationsTable.id, cid));

    // Insufficient-token outcomes return HTTP 402 (Payment Required) per
    // the API contract, with the upsell URL surfaced via blockReason.
    const httpStatus = result.status === "insufficient_tokens" ? 402 : 200;
    res.status(httpStatus).json({
      userMessage: serializeMessage(userMsg),
      assistantMessage: serializeMessage(assistantMsg),
      proposedChanges: insertedChanges.map(serializeProposedChange),
      result: {
        ok: result.ok,
        status: result.status,
        mocked: result.mocked,
        category: result.category,
        providerSlug: result.providerSlug,
        modelKey: result.modelKey,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tokenCost: result.tokenCost,
        blockReason: result.blockReason ?? null,
      },
    });
  },
);

// ─── Streaming send (SSE) ──────────────────────────────────────────────────
//
// Mirrors POST /ai/conversations/:cid/messages but streams assistant tokens
// via Server-Sent Events as they arrive from the provider. Final SSE event is
// `done` with the full result payload (including persisted message/changes).

router.post(
  "/ai/conversations/:cid/messages/stream",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const cid = Number(req.params.cid);
    if (!Number.isFinite(cid))
      return fail(res, 400, "bad_request", "Invalid conversation id");
    const promptText =
      typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const requestedCategoryRaw =
      typeof req.body?.category === "string" ? req.body.category : "coding";
    if (!promptText)
      return fail(res, 400, "bad_request", "Prompt content is required");
    if (!(AI_MODEL_CATEGORIES as readonly string[]).includes(requestedCategoryRaw)) {
      return fail(res, 400, "bad_request", "Invalid category");
    }
    const requestedCategory = requestedCategoryRaw as AiModelCategory;

    const [conv] = await db
      .select()
      .from(aiConversationsTable)
      .where(eq(aiConversationsTable.id, cid));
    if (!conv) return fail(res, 404, "not_found", "Conversation not found");
    const client = req.dbClient!;
    const access = await loadViewable(conv.projectId, client.id, client.email);
    if (!access) return fail(res, 404, "not_found", "Conversation not found");
    const loaded = await loadProjectAndOrg(conv.projectId);
    if (!loaded) return fail(res, 404, "not_found", "Project not found");

    // PHI preflight runs BEFORE we persist any user content. If blocked we
    // emit the SSE done event with a sanitized placeholder and never store
    // the offending text.
    const preflight = await phiPreflight(promptText, {
      organizationId: loaded.project.organizationId,
      projectId: loaded.project.id,
      userClientId: client.id,
      project: loaded.project,
    });
    if (preflight.blocked) {
      const [userPlaceholder] = await db
        .insert(aiMessagesTable)
        .values({
          conversationId: cid,
          role: "user",
          content: `[PHI guard blocked prompt — content not stored. Rules: ${preflight.rules.join(", ")}]`,
          metadata: { phiBlocked: true, rules: preflight.rules },
        })
        .returning();
      const [systemMsg] = await db
        .insert(aiMessagesTable)
        .values({
          conversationId: cid,
          role: "assistant",
          content: preflight.blockedMessage,
          providerSlug: "n/a",
          modelKey: "n/a",
          category: requestedCategory,
          inputTokens: 0,
          outputTokens: 0,
          tokenCost: 0,
          metadata: {
            ok: false,
            status: "blocked_phi",
            mocked: false,
            blockReason: {
              code: "phi_blocked",
              message: "Prompt contains content that looks like PHI.",
              details: { rules: preflight.rules },
            },
          },
        })
        .returning();
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(
        `event: user_message\ndata: ${JSON.stringify(serializeMessage(userPlaceholder))}\n\n`,
      );
      res.write(
        `event: done\ndata: ${JSON.stringify({
          userMessage: serializeMessage(userPlaceholder),
          assistantMessage: serializeMessage(systemMsg),
          proposedChanges: [],
          result: {
            ok: false,
            status: "blocked_phi",
            mocked: false,
            category: requestedCategory,
            providerSlug: "n/a",
            modelKey: "n/a",
            inputTokens: 0,
            outputTokens: 0,
            tokenCost: 0,
            blockReason: {
              code: "phi_blocked",
              message: "Prompt contains content that looks like PHI.",
              details: { rules: preflight.rules },
            },
          },
        })}\n\n`,
      );
      res.end();
      return;
    }

    const [userMsg] = await db
      .insert(aiMessagesTable)
      .values({ conversationId: cid, role: "user", content: promptText })
      .returning();

    const history = await db
      .select()
      .from(aiMessagesTable)
      .where(eq(aiMessagesTable.conversationId, cid))
      .orderBy(asc(aiMessagesTable.createdAt));
    const messagesForProvider = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Defer flushing SSE headers until we know the call is going to proceed.
    // If aiSend short-circuits with insufficient_tokens (no provider call,
    // no deltas) we want to return HTTP 402 with the upsell payload, which
    // requires the response to still be in JSON mode.
    let sseStarted = false;
    function startSse() {
      if (sseStarted) return;
      sseStarted = true;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(
        `event: user_message\ndata: ${JSON.stringify(serializeMessage(userMsg))}\n\n`,
      );
    }
    function send(event: string, data: unknown) {
      startSse();
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }

    try {
      const result = await aiSend(
        {
          category: requestedCategory,
          messages: messagesForProvider,
          projectContext: {
            title: loaded.project.title,
            description: loaded.project.description,
            summary: loaded.project.summary,
            framework: loaded.project.framework,
            githubOwner: loaded.project.githubOwner,
            githubRepo: loaded.project.githubRepo,
          },
          onDelta: (delta) => send("delta", { text: delta }),
        },
        {
          organizationId: loaded.project.organizationId,
          projectId: loaded.project.id,
          userClientId: client.id,
          project: loaded.project,
          org: loaded.org,
        },
      );

      // Insufficient-token short-circuit: aiSend returned before any
      // provider call or deltas, so headers are still un-flushed and we
      // can downgrade to a plain HTTP 402 JSON response carrying the same
      // upsell payload as the non-stream route.
      if (result.status === "insufficient_tokens" && !sseStarted) {
        res.status(402).json({
          userMessage: serializeMessage(userMsg),
          result: {
            ok: result.ok,
            status: result.status,
            mocked: result.mocked,
            category: result.category,
            providerSlug: result.providerSlug,
            modelKey: result.modelKey,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            tokenCost: result.tokenCost,
            blockReason: result.blockReason ?? null,
          },
        });
        return;
      }

      const [assistantMsg] = await db
        .insert(aiMessagesTable)
        .values({
          conversationId: cid,
          role: "assistant",
          content: result.text,
          providerSlug: result.providerSlug,
          modelKey: result.modelKey,
          category: result.category,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          tokenCost: result.tokenCost,
          metadata: {
            ok: result.ok,
            status: result.status,
            mocked: result.mocked,
            blockReason: result.blockReason ?? null,
          },
        })
        .returning();

      const insertedChanges: AiProposedChange[] = [];
      if (result.proposedChanges.length) {
        const { projectFilesTable } = await import("@workspace/db");
        const { ObjectStorageService } = await import("../lib/objectStorage");
        const storage = new ObjectStorageService();
        for (const c of result.proposedChanges) {
          let previous: string | null = null;
          try {
            const [existing] = await db
              .select()
              .from(projectFilesTable)
              .where(
                and(
                  eq(projectFilesTable.projectId, loaded.project.id),
                  eq(projectFilesTable.name, c.path),
                ),
              )
              .limit(1);
            if (existing && c.op !== "create") {
              const file = await storage.getObjectEntityFile(existing.objectPath);
              const [buf] = await file.download();
              previous = buf.toString("utf8");
            }
          } catch (err) {
            logger.warn(
              { err, path: c.path },
              "ai/stream: failed to snapshot previous contents",
            );
          }
          const [row] = await db
            .insert(aiProposedChangesTable)
            .values({
              conversationId: cid,
              messageId: assistantMsg.id,
              projectId: loaded.project.id,
              op: c.op,
              path: c.path,
              newPath: c.newPath ?? null,
              contents: c.contents ?? null,
              previousContents: previous,
            })
            .returning();
          insertedChanges.push(row);
        }
      }

      await db
        .update(aiConversationsTable)
        .set({ lastCategory: result.category })
        .where(eq(aiConversationsTable.id, cid));

      send("done", {
        userMessage: serializeMessage(userMsg),
        assistantMessage: serializeMessage(assistantMsg),
        proposedChanges: insertedChanges.map(serializeProposedChange),
        result: {
          ok: result.ok,
          status: result.status,
          mocked: result.mocked,
          category: result.category,
          providerSlug: result.providerSlug,
          modelKey: result.modelKey,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          tokenCost: result.tokenCost,
          blockReason: result.blockReason ?? null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "ai/stream: send failed");
      send("error", { message });
    } finally {
      res.end();
    }
  },
);

// ─── Accept / reject ───────────────────────────────────────────────────────

async function loadProposedChangeForViewer(
  pcId: number,
  clientId: number,
  clientEmail: string,
): Promise<{ change: AiProposedChange; project: Project } | null> {
  const [change] = await db
    .select()
    .from(aiProposedChangesTable)
    .where(eq(aiProposedChangesTable.id, pcId));
  if (!change) return null;
  const access = await loadViewable(change.projectId, clientId, clientEmail);
  if (!access) return null;
  return { change, project: access.project };
}

router.post(
  "/ai/proposed-changes/:pcId/accept",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const pcId = Number(req.params.pcId);
    if (!Number.isFinite(pcId))
      return fail(res, 400, "bad_request", "Invalid id");
    const client = req.dbClient!;
    const loaded = await loadProposedChangeForViewer(
      pcId,
      client.id,
      client.email,
    );
    if (!loaded) return fail(res, 404, "not_found", "Change not found");
    if (loaded.change.status !== "pending") {
      return fail(
        res,
        409,
        "invalid_state",
        `Change is already ${loaded.change.status}`,
      );
    }

    const asChangeRequest = req.body?.asChangeRequest === true;

    if (asChangeRequest) {
      // Open as change request: hand off to the canonical CR pipeline.
      // pushPatchToGitHub now consumes op-aware patch entries
      // (create/update/delete/rename) and translates them into the
      // pushBranchWithFiles (files, deletions) pair, so all four ops
      // produce a real branch + PR.
      const ch = loaded.change;
      let patchEntry: PatchFileEntry;
      switch (ch.op) {
        case "create":
        case "update":
          patchEntry = { op: ch.op, path: ch.path, contents: ch.contents ?? "" };
          break;
        case "delete":
          patchEntry = { op: "delete", path: ch.path };
          break;
        case "rename":
          if (!ch.newPath) {
            return fail(
              res,
              400,
              "invalid_state",
              "Rename change is missing newPath; cannot open as change request.",
            );
          }
          patchEntry = {
            op: "rename",
            path: ch.path,
            newPath: ch.newPath,
            ...(ch.contents != null ? { contents: ch.contents } : {}),
            ...(ch.previousContents != null
              ? { previousContents: ch.previousContents }
              : {}),
          };
          break;
        default:
          return fail(
            res,
            400,
            "unsupported_op",
            `Unsupported op for change request handoff: ${String(ch.op)}`,
          );
      }

      // Insert in `patched` status so pushPatchToGitHub can immediately
      // snapshot, push the branch, and open the PR — same codepath used
      // by /change-requests/:id/generate-patch.
      const [cr] = await db
        .insert(changeRequestsTable)
        .values({
          projectId: loaded.project.id,
          organizationId: loaded.project.organizationId,
          status: "patched",
          title: `AI: ${ch.op} ${ch.path}`.slice(0, 200),
          rawRequest: `Proposed by AI Console (${ch.op} ${ch.path})`,
          patchSummary: `AI-proposed ${ch.op} of ${ch.path}`,
          patchFiles: [patchEntry] satisfies PatchFileEntry[],
        })
        .returning();
      await db.insert(changeRequestEventsTable).values({
        changeRequestId: cr.id,
        kind: "patch_succeeded",
        message: "Patch generated by AI Console.",
        actorOrganizationId: client.id,
      });

      // Hand off to the canonical CR push helper. This snapshots base SHA,
      // pushes a branch, and opens a PR — flipping status to pr_open and
      // populating githubBranch / githubPrNumber / githubPrUrl. If GitHub
      // isn't configured it gracefully no-ops with an event (same as the
      // standard CR generate-patch route).
      const pushed = await pushPatchToGitHub(cr, loaded.project, client.id);
      const [updated] = await db
        .update(aiProposedChangesTable)
        .set({
          status: "accepted",
          appliedAt: new Date(),
          appliedByClientId: client.id,
          appliedAs: "change_request",
          appliedChangeRequestId: pushed.id,
        })
        .where(eq(aiProposedChangesTable.id, pcId))
        .returning();
      const meta = reqAuditMeta(req);
      recordAuditEventAsync({
        organizationId: loaded.project.organizationId,
        actorOrganizationId: client.id,
        category: "ai",
        action: "ai_change_accepted",
        targetType: "ai_proposed_change",
        targetId: String(pcId),
        metadata: {
          changeRequestId: pushed.id,
          changeRequestStatus: pushed.status,
          githubPrNumber: pushed.githubPrNumber,
          githubPrUrl: pushed.githubPrUrl,
          githubBranch: pushed.githubBranch,
        },
        ...meta,
      });
      res.json({
        change: serializeProposedChange(updated),
        changeRequestId: pushed.id,
        changeRequestStatus: pushed.status,
        githubPrNumber: pushed.githubPrNumber,
        githubPrUrl: pushed.githubPrUrl,
        githubBranch: pushed.githubBranch,
        commit: null,
        commitWarning: null,
      });
      return;
    }

    // Direct commit path.
    const result = await applyProposedChanges(loaded.project, client.id, [
      loaded.change,
    ]);
    const outcome = result.outcomes[0];
    if (!outcome?.ok) {
      return fail(
        res,
        500,
        "apply_failed",
        outcome?.error ?? "Failed to apply change",
      );
    }
    const [updated] = await db
      .update(aiProposedChangesTable)
      .set({
        status: "accepted",
        appliedAt: new Date(),
        appliedByClientId: client.id,
        appliedAs: "commit",
      })
      .where(eq(aiProposedChangesTable.id, pcId))
      .returning();
    const meta = reqAuditMeta(req);
    recordAuditEventAsync({
      organizationId: loaded.project.organizationId,
      actorOrganizationId: client.id,
      category: "ai",
      action: "ai_change_accepted",
      targetType: "ai_proposed_change",
      targetId: String(pcId),
      metadata: {
        op: loaded.change.op,
        path: loaded.change.path,
        commit: result.commit,
        commitWarning: result.commitWarning,
      },
      ...meta,
    });
    res.json({
      change: serializeProposedChange(updated),
      commit: result.commit,
      commitWarning: result.commitWarning,
    });
  },
);

router.post(
  "/ai/proposed-changes/:pcId/reject",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const pcId = Number(req.params.pcId);
    if (!Number.isFinite(pcId))
      return fail(res, 400, "bad_request", "Invalid id");
    const client = req.dbClient!;
    const loaded = await loadProposedChangeForViewer(
      pcId,
      client.id,
      client.email,
    );
    if (!loaded) return fail(res, 404, "not_found", "Change not found");
    if (loaded.change.status !== "pending") {
      return fail(
        res,
        409,
        "invalid_state",
        `Change is already ${loaded.change.status}`,
      );
    }
    const [updated] = await db
      .update(aiProposedChangesTable)
      .set({ status: "rejected", rejectedAt: new Date() })
      .where(eq(aiProposedChangesTable.id, pcId))
      .returning();
    const meta = reqAuditMeta(req);
    recordAuditEventAsync({
      organizationId: loaded.project.organizationId,
      actorOrganizationId: client.id,
      category: "ai",
      action: "ai_change_rejected",
      targetType: "ai_proposed_change",
      targetId: String(pcId),
      ...meta,
    });
    res.json({ change: serializeProposedChange(updated) });
  },
);

// ─── Healthcare gating preview (UI uses to render lock state) ───────────────

router.get(
  "/projects/:id/ai/healthcare-gate",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId))
      return fail(res, 400, "bad_request", "Invalid project id");
    const client = req.dbClient!;
    const access = await loadViewable(projectId, client.id, client.email);
    if (!access) return fail(res, 404, "not_found", "Project not found");
    const loaded = await loadProjectAndOrg(projectId);
    if (!loaded) return fail(res, 404, "not_found", "Project not found");
    const gate = checkHealthcareGating({
      org: loaded.org,
      project: loaded.project,
    });
    res.json({
      ok: gate.ok,
      failedPreconditions: gate.failedPreconditions,
    });
  },
);

export default router;
