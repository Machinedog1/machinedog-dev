import { Router, type IRouter } from "express";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, buildJobsTable, deploymentsTable, projectsTable, projectMembersTable, type BuildJob, type Deployment } from "@workspace/db";
import { requireAuth, requireActiveClient, requireAdmin } from "../lib/auth";
import { createBuildJob, chargeBuildTokens, chargeDeployTokens, listBuildsForProject, listDeploymentsForProject, upsertDeployment, updateBuildJob } from "../lib/build-deploy-service";
import { getHostAdapter } from "../lib/hosts";
import { loadProjectSecretValue } from "../lib/build-deploy-service";
import { encryptSecret } from "../lib/encryption";
import { projectSecretsTable, changeRequestsTable } from "@workspace/db";
import { recordAuditEventAsync } from "../lib/audit";

const router: IRouter = Router();

function serializeBuild(b: BuildJob) {
  return {
    id: b.id,
    organizationId: b.organizationId,
    projectId: b.projectId,
    changeRequestId: b.changeRequestId,
    provider: b.provider,
    externalId: b.externalId,
    status: b.status,
    environment: b.environment,
    branch: b.branch,
    commitSha: b.commitSha,
    logsUrl: b.logsUrl,
    errorMessage: b.errorMessage,
    tokenCost: b.tokenCost,
    triggeredByEmail: b.triggeredByEmail,
    metadata: b.metadata,
    startedAt: b.startedAt,
    finishedAt: b.finishedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

function serializeDeployment(d: Deployment) {
  return {
    id: d.id,
    organizationId: d.organizationId,
    projectId: d.projectId,
    buildJobId: d.buildJobId,
    changeRequestId: d.changeRequestId,
    provider: d.provider,
    externalId: d.externalId,
    environment: d.environment,
    status: d.status,
    url: d.url,
    commitSha: d.commitSha,
    branch: d.branch,
    errorMessage: d.errorMessage,
    tokenCost: d.tokenCost,
    metadata: d.metadata,
    deployedAt: d.deployedAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function loadVisibleProject(projectId: number, clientId: number, email: string) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;
  if (project.organizationId === clientId) return project;
  const [member] = await db
    .select()
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, projectId),
        eq(projectMembersTable.status, "active"),
        eq(projectMembersTable.email, email.toLowerCase()),
      ),
    );
  return member ? project : null;
}

router.get(
  "/projects/:id/builds",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadVisibleProject(projectId, req.organization!.id, req.organizationMember!.email);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = await listBuildsForProject(projectId, limit);
    res.json({ data: rows.map(serializeBuild) });
  },
);

router.post(
  "/projects/:id/builds",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadVisibleProject(projectId, req.organization!.id, req.organizationMember!.email);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (project.organizationId !== req.organization!.id) {
      res.status(403).json({ error: "Owner only" });
      return;
    }
    const body = req.body ?? {};
    const environment =
      body.environment === "preview" ||
      body.environment === "staging" ||
      body.environment === "production"
        ? (body.environment as "preview" | "staging" | "production")
        : "production";
    const branch = typeof body.branch === "string" && body.branch ? body.branch : project.githubDefaultBranch;
    const commitSha = typeof body.commitSha === "string" ? body.commitSha : null;
    let changeRequestId =
      typeof body.changeRequestId === "number" ? body.changeRequestId : null;

    // Tenant-scope the supplied changeRequestId. Without this, a caller
    // could link a build/deployment to a foreign org/project's CR by
    // guessing its id, triggering downstream change_request_events writes
    // and autoFlipAwaitingDeploy on a CR they don't own.
    if (changeRequestId !== null) {
      const [cr] = await db
        .select({ id: changeRequestsTable.id })
        .from(changeRequestsTable)
        .where(
          and(
            eq(changeRequestsTable.id, changeRequestId),
            eq(changeRequestsTable.projectId, project.id),
            eq(changeRequestsTable.organizationId, project.organizationId),
          ),
        )
        .limit(1);
      if (!cr) {
        res.status(400).json({
          error: "changeRequestId does not belong to this project",
          code: "invalid_change_request",
        });
        return;
      }
    }

    const provider = project.hostingProvider;

    // Replit-hosted projects have no programmatic deploy trigger — they
    // rely on the existing prod-heartbeat flow to mark deployments live.
    // Reject the trigger before creating any build_job so we never charge
    // tokens for a no-op that would sit queued forever.
    if (provider === "replit") {
      res.status(400).json({
        error:
          "Replit-hosted projects deploy via the prod-heartbeat flow, not the publish trigger. Switch hosting provider to Vercel or Render to use this action.",
        code: "replit_no_manual_trigger",
      });
      return;
    }

    const build = await createBuildJob({
      organizationId: project.organizationId,
      projectId: project.id,
      changeRequestId,
      provider,
      environment,
      branch,
      commitSha,
      triggeredByEmail: req.organizationMember!.email,
    });
    // Authoritative billing: if the org cannot afford the build, mark the
    // job failed and stop before triggering any host work. Webhook callbacks
    // do not charge, so a successful 201 implies a successful debit.
    try {
      await chargeBuildTokens(build.id, project.organizationId, project.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "token deduction failed";
      await updateBuildJob({
        buildJobId: build.id,
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
      });
      res.status(402).json({
        error: message,
        code: "insufficient_tokens",
      });
      return;
    }

    // Trigger via host adapter (best effort — record any failure on the build row)
    {
      const adapter = getHostAdapter(provider);
      const apiToken = await loadProjectSecretValue(
        project.id,
        "production",
        provider === "vercel" ? "VERCEL_API_TOKEN" : "RENDER_API_TOKEN",
      );
      const result = await adapter.triggerDeploy(
        {
          projectId: project.id,
          organizationId: project.organizationId,
          branch,
          commitSha,
          environment,
          changeRequestId,
          triggeredByEmail: req.organizationMember!.email,
        },
        {
          apiToken: apiToken ?? undefined,
          projectId: project.hostingProjectId ?? undefined,
        },
      );
      if (result.status === "failed") {
        // Route through updateBuildJob so the build_failed audit event +
        // change-request event are always emitted, even when the failure
        // happens during the initial trigger (before any webhook arrives).
        const updated = await updateBuildJob({
          buildJobId: build.id,
          status: "failed",
          errorMessage: result.message ?? "trigger failed",
          finishedAt: new Date(),
        });
        res
          .status(502)
          .json({ data: serializeBuild(updated ?? build), error: result.message });
        return;
      }
      if (result.externalId) {
        const updated =
          (await updateBuildJob({
            buildJobId: build.id,
            externalId: result.externalId,
            status: "running",
            startedAt: new Date(),
          })) ?? build;
        // Create a pending deployment row so the publish UI shows progress
        // immediately. The service emits a `deployment_started` audit on
        // first insert.
        const dep = await upsertDeployment({
          organizationId: project.organizationId,
          projectId: project.id,
          buildJobId: build.id,
          changeRequestId,
          provider,
          externalId: result.externalId,
          environment,
          status: "building",
          url: result.url,
          commitSha,
          branch,
        });
        // Charge deploy tokens at action time (per spec: "build/deploy
        // actions deduct tokens"). Webhook callbacks no longer charge so
        // the user is debited regardless of eventual outcome. If the
        // deduction fails (insufficient balance, etc.), mark the
        // deployment failed and surface 402 — the build was already
        // charged above and remains debited.
        try {
          await chargeDeployTokens(dep.id, project.organizationId, project.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : "token deduction failed";
          await upsertDeployment({
            organizationId: project.organizationId,
            projectId: project.id,
            buildJobId: build.id,
            changeRequestId,
            provider,
            externalId: result.externalId,
            environment,
            status: "failed",
            url: result.url,
            commitSha,
            branch,
            errorMessage: message,
          });
          res.status(402).json({
            error: message,
            code: "insufficient_tokens",
            data: serializeBuild(updated),
          });
          return;
        }
        res.status(201).json({ data: serializeBuild(updated) });
        return;
      }
    }

    res.status(201).json({ data: serializeBuild(build) });
  },
);

router.get(
  "/projects/:id/deployments",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadVisibleProject(projectId, req.organization!.id, req.organizationMember!.email);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = await listDeploymentsForProject(projectId, limit);
    res.json({ data: rows.map(serializeDeployment) });
  },
);

// SSE-style log stream — for now polls the build_jobs row and emits status
// updates plus the most recent metadata until the build reaches a terminal
// state. Keeps the frontend bottom panel live without a separate worker.
router.get(
  "/projects/:id/builds/:buildId/logs/stream",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const buildId = Number(req.params.buildId);
    if (!Number.isFinite(projectId) || !Number.isFinite(buildId)) {
      res.status(400).end();
      return;
    }
    const project = await loadVisibleProject(projectId, req.organization!.id, req.organizationMember!.email);
    if (!project) {
      res.status(404).end();
      return;
    }
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    let lastStatus: string | null = null;
    let emittedLineCount = 0;
    let cachedApiToken: string | null = null;
    let credentialsLoaded = false;
    const tick = async () => {
      const [row] = await db
        .select()
        .from(buildJobsTable)
        .where(and(eq(buildJobsTable.id, buildId), eq(buildJobsTable.projectId, projectId)));
      if (!row) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "not found" })}\n\n`);
        res.end();
        return true;
      }
      if (row.status !== lastStatus) {
        lastStatus = row.status;
        res.write(
          `event: status\ndata: ${JSON.stringify({
            status: row.status,
            externalId: row.externalId,
            logsUrl: row.logsUrl,
            errorMessage: row.errorMessage,
            updatedAt: row.updatedAt,
          })}\n\n`,
        );
      }
      // Pull host logs once we have an externalId. Adapter results are
      // cumulative; we only forward the new tail to the client.
      if (row.externalId && project.hostingProvider !== "replit") {
        if (!credentialsLoaded) {
          credentialsLoaded = true;
          cachedApiToken = await loadProjectSecretValue(
            project.id,
            "production",
            project.hostingProvider === "vercel" ? "VERCEL_API_TOKEN" : "RENDER_API_TOKEN",
          );
        }
        const adapter = getHostAdapter(project.hostingProvider);
        if (adapter.getLogs) {
          const logs = await adapter
            .getLogs(row.externalId, {
              apiToken: cachedApiToken ?? undefined,
              projectId: project.hostingProjectId ?? undefined,
            })
            .catch(() => ({ ok: false, lines: [] as string[] }));
          if (logs.ok && logs.lines.length > emittedLineCount) {
            const newLines = logs.lines.slice(emittedLineCount);
            emittedLineCount = logs.lines.length;
            res.write(
              `event: log\ndata: ${JSON.stringify({ lines: newLines })}\n\n`,
            );
          }
        }
      }
      if (row.status === "succeeded" || row.status === "failed" || row.status === "canceled") {
        res.write(`event: done\ndata: ${JSON.stringify({ status: row.status })}\n\n`);
        res.end();
        return true;
      }
      return false;
    };

    const handle = setInterval(() => {
      tick().catch(() => {
        clearInterval(handle);
        res.end();
      });
    }, 2000);
    void tick();
    req.on("close", () => clearInterval(handle));
  },
);

// Owner-only — store host provider credentials (API token + webhook secret)
// directly from the publish/settings UI so operators don't have to bounce
// to the Secrets tab. Values are encrypted via the existing project_secrets
// pipeline; we upsert by (projectId, env, name) and bump version on
// rotations. The project's `hostingCredentialsRef` is set to the API token
// secret name so the row points at where its credentials live.
router.post(
  "/projects/:id/hosting/credentials",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadVisibleProject(projectId, req.organization!.id, req.organizationMember!.email);
    if (!project || project.organizationId !== req.organization!.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Provider is taken from the request body (falls back to persisted)
    // so the user can switch provider in settings and immediately store
    // credentials under the new provider's secret names within the same
    // form submission, without first having to PATCH the project.
    const requestedProvider =
      req.body?.provider === "vercel" || req.body?.provider === "render"
        ? (req.body.provider as "vercel" | "render")
        : project.hostingProvider === "vercel" || project.hostingProvider === "render"
          ? project.hostingProvider
          : null;
    if (!requestedProvider) {
      res
        .status(400)
        .json({ error: "Replit hosting uses the prod-heartbeat token; no credentials needed." });
      return;
    }
    const apiToken = typeof req.body?.apiToken === "string" ? req.body.apiToken.trim() : "";
    const webhookSecret =
      typeof req.body?.webhookSecret === "string" ? req.body.webhookSecret.trim() : "";
    if (!apiToken && !webhookSecret) {
      res.status(400).json({ error: "Provide apiToken and/or webhookSecret to store." });
      return;
    }
    const tokenName =
      requestedProvider === "vercel" ? "VERCEL_API_TOKEN" : "RENDER_API_TOKEN";
    const secretName =
      requestedProvider === "vercel" ? "VERCEL_WEBHOOK_SECRET" : "RENDER_WEBHOOK_SECRET";

    const upsertSecret = async (name: string, value: string): Promise<void> => {
      const enc = encryptSecret(value);
      const preview = value.length > 4 ? `••••${value.slice(-4)}` : "••••";
      await db
        .insert(projectSecretsTable)
        .values({
          organizationId: project.organizationId,
          projectId: project.id,
          name,
          environment: "production",
          encryptedValue: enc.encryptedValue,
          nonce: enc.nonce,
          authTag: enc.authTag,
          valuePreview: preview,
          version: 1,
          createdByEmail: req.organizationMember!.email,
          updatedByEmail: req.organizationMember!.email,
        })
        .onConflictDoUpdate({
          target: [
            projectSecretsTable.projectId,
            projectSecretsTable.environment,
            projectSecretsTable.name,
          ],
          set: {
            encryptedValue: enc.encryptedValue,
            nonce: enc.nonce,
            authTag: enc.authTag,
            valuePreview: preview,
            version: sql`${projectSecretsTable.version} + 1`,
            updatedByEmail: req.organizationMember!.email,
          },
        });
    };

    const stored: string[] = [];
    if (apiToken) {
      await upsertSecret(tokenName, apiToken);
      stored.push(tokenName);
    }
    if (webhookSecret) {
      await upsertSecret(secretName, webhookSecret);
      stored.push(secretName);
    }

    if (stored.length > 0) {
      // Persist the provider switch atomically with the credentials write
      // so the project row points at the same provider whose secrets we
      // just stored — preventing a brief mismatch window.
      await db
        .update(projectsTable)
        .set({ hostingCredentialsRef: tokenName, hostingProvider: requestedProvider })
        .where(eq(projectsTable.id, project.id));
      recordAuditEventAsync({
        organizationId: project.organizationId,
        projectId: project.id,
        actorOrganizationId: req.organization!.id,
        actorEmail: req.organizationMember!.email,
        category: "secret",
        action: "secret_created",
        targetType: "project",
        targetId: String(project.id),
        metadata: { provider: requestedProvider, names: stored, source: "hosting_panel" },
      });
    }

    res.json({ ok: true, storedNames: stored });
  },
);

// Owner-only test connection helper used by the project settings UI.
router.post(
  "/projects/:id/hosting/test",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadVisibleProject(projectId, req.organization!.id, req.organizationMember!.email);
    if (!project || project.organizationId !== req.organization!.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const adapter = getHostAdapter(project.hostingProvider);
    const apiToken = await loadProjectSecretValue(
      project.id,
      "production",
      project.hostingProvider === "vercel"
        ? "VERCEL_API_TOKEN"
        : project.hostingProvider === "render"
          ? "RENDER_API_TOKEN"
          : "REPLIT_NOOP",
    );
    const result = await adapter.testConnection({
      apiToken: apiToken ?? undefined,
      projectId: project.hostingProjectId ?? undefined,
    });
    res.json(result);
  },
);

// Admin: list all builds with filters.
router.get(
  "/admin/builds",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const filters: SQL[] = [];
    if (req.query.organizationId) {
      const v = Number(req.query.organizationId);
      if (Number.isFinite(v)) filters.push(eq(buildJobsTable.organizationId, v));
    }
    if (req.query.projectId) {
      const v = Number(req.query.projectId);
      if (Number.isFinite(v)) filters.push(eq(buildJobsTable.projectId, v));
    }
    if (typeof req.query.provider === "string" && req.query.provider) {
      filters.push(eq(buildJobsTable.provider, req.query.provider as "vercel" | "render" | "replit"));
    }
    if (typeof req.query.status === "string" && req.query.status) {
      filters.push(
        eq(buildJobsTable.status, req.query.status as "queued" | "running" | "succeeded" | "failed" | "canceled"),
      );
    }
    if (typeof req.query.since === "string" && req.query.since) {
      const d = new Date(req.query.since);
      if (!Number.isNaN(d.getTime())) {
        filters.push(sql`${buildJobsTable.createdAt} >= ${d.toISOString()}`);
      }
    }
    if (typeof req.query.until === "string" && req.query.until) {
      const d = new Date(req.query.until);
      if (!Number.isNaN(d.getTime())) {
        filters.push(sql`${buildJobsTable.createdAt} <= ${d.toISOString()}`);
      }
    }
    const whereClause = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select()
      .from(buildJobsTable)
      .where(whereClause)
      .orderBy(desc(buildJobsTable.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(buildJobsTable)
      .where(whereClause);
    res.json({ data: rows.map(serializeBuild), total: Number(count) });
  },
);

router.get(
  "/admin/deployments",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const filters: SQL[] = [];
    if (req.query.organizationId) {
      const v = Number(req.query.organizationId);
      if (Number.isFinite(v)) filters.push(eq(deploymentsTable.organizationId, v));
    }
    if (req.query.projectId) {
      const v = Number(req.query.projectId);
      if (Number.isFinite(v)) filters.push(eq(deploymentsTable.projectId, v));
    }
    if (typeof req.query.provider === "string" && req.query.provider) {
      filters.push(eq(deploymentsTable.provider, req.query.provider as "vercel" | "render" | "replit"));
    }
    if (typeof req.query.status === "string" && req.query.status) {
      filters.push(
        eq(
          deploymentsTable.status,
          req.query.status as "pending" | "building" | "live" | "failed" | "canceled" | "rolled_back",
        ),
      );
    }
    if (typeof req.query.since === "string" && req.query.since) {
      const d = new Date(req.query.since);
      if (!Number.isNaN(d.getTime())) {
        filters.push(sql`${deploymentsTable.createdAt} >= ${d.toISOString()}`);
      }
    }
    if (typeof req.query.until === "string" && req.query.until) {
      const d = new Date(req.query.until);
      if (!Number.isNaN(d.getTime())) {
        filters.push(sql`${deploymentsTable.createdAt} <= ${d.toISOString()}`);
      }
    }
    const whereClause = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select()
      .from(deploymentsTable)
      .where(whereClause)
      .orderBy(desc(deploymentsTable.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deploymentsTable)
      .where(whereClause);
    res.json({ data: rows.map(serializeDeployment), total: Number(count) });
  },
);

export default router;
