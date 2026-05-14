import { Router, type IRouter, raw } from "express";
import { db, projectsTable, changeRequestsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getHostAdapter } from "../lib/hosts";
import {
  upsertDeploymentDetailed,
  loadProjectSecretValue,
  reconcileBuildFromWebhook,
  chargeBuildTokens,
  chargeDeployTokens,
  findOrCreateBuildJobForWebhook,
} from "../lib/build-deploy-service";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function handleProvider(
  provider: "vercel" | "render",
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<{ status: number; body: unknown }> {
  const adapter = getHostAdapter(provider);
  const parsed = adapter.parseWebhookEvent(rawBody, headers);

  // Find a candidate project to look up the per-project signing secret. We
  // tolerate missing hostingProjectId by falling back to a global env-var
  // secret so smoke tests work in dev.
  let project: typeof projectsTable.$inferSelect | null = null;
  if (parsed.hostingProjectId) {
    const [p] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.hostingProvider, provider),
          eq(projectsTable.hostingProjectId, parsed.hostingProjectId),
        ),
      );
    project = p ?? null;
  }

  const secretName = provider === "vercel" ? "VERCEL_WEBHOOK_SECRET" : "RENDER_WEBHOOK_SECRET";
  const projectSecret = project
    ? await loadProjectSecretValue(project.id, "production", secretName)
    : null;
  const fallback = process.env[secretName] ?? null;

  const verified = adapter.verifyWebhook({ rawBody, headers, projectSecret, fallbackSecret: fallback });
  if (!verified.valid) {
    logger.warn({ provider, reason: verified.reason }, "Host webhook signature invalid");
    return { status: 401, body: { error: "invalid signature", reason: verified.reason } };
  }

  if (!project) {
    logger.warn({ provider, hostingProjectId: parsed.hostingProjectId }, "No matching project for host webhook");
    return { status: 202, body: { received: true, matched: false } };
  }

  const isBuildOrDeploy =
    parsed.kind === "deployment.created" ||
    parsed.kind === "deployment.live" ||
    parsed.kind === "deployment.failed" ||
    parsed.kind === "deployment.canceled";

  if (!isBuildOrDeploy) {
    return { status: 200, body: { received: true, kind: parsed.kind } };
  }

  const status =
    parsed.kind === "deployment.live"
      ? "live"
      : parsed.kind === "deployment.failed"
        ? "failed"
        : parsed.kind === "deployment.canceled"
          ? "canceled"
          : "building";

  // Stable externalId is required for idempotent ingestion. Without it
  // we cannot dedupe across retries (would risk duplicate rows + repeated
  // token charges), so drop with 202.
  if (!parsed.externalId) {
    logger.warn({ provider, kind: parsed.kind }, "host webhook missing externalId; ignored");
    return { status: 202, body: { received: true, ignored: "missing externalId" } };
  }

  // CR correlation by merge commit SHA (set on PR merge in change-requests.ts).
  let correlatedChangeRequestId: number | null = null;
  if (parsed.commitSha) {
    const [matchedCr] = await db
      .select({ id: changeRequestsTable.id })
      .from(changeRequestsTable)
      .where(
        and(
          eq(changeRequestsTable.projectId, project.id),
          eq(changeRequestsTable.mergeCommitSha, parsed.commitSha),
        ),
      )
      .limit(1);
    correlatedChangeRequestId = matchedCr?.id ?? null;
  }

  // Ensure a build_jobs row exists for this externalId so admin/builds
  // and the publish history reflect every deploy, including PR-merge
  // auto-deploys that never went through POST /projects/:id/builds.
  const job = await findOrCreateBuildJobForWebhook({
    organizationId: project.organizationId,
    projectId: project.id,
    changeRequestId: correlatedChangeRequestId,
    provider,
    externalId: parsed.externalId,
    environment: parsed.environment ?? "production",
    branch: parsed.branch,
    commitSha: parsed.commitSha,
  });

  // Advance the build's lifecycle to match the webhook event.
  await reconcileBuildFromWebhook(
    provider,
    parsed.externalId,
    parsed.kind as
      | "deployment.created"
      | "deployment.live"
      | "deployment.failed"
      | "deployment.canceled",
    parsed.errorMessage,
  );
  const reconciledBuildId = job.id;

  // Idempotent build-token charge: tokenCost === 0 means we have not yet
  // debited for this build. chargeBuildTokens only bumps tokenCost on a
  // successful debit, so retries no-op. Failures are logged so the host
  // doesn't retry forever on insufficient balance.
  if (job.tokenCost === 0) {
    try {
      await chargeBuildTokens(job.id, job.organizationId, job.projectId);
    } catch (err) {
      logger.warn({ err, buildJobId: job.id }, "auto-deploy build charge failed");
    }
  }

  const { row: deployment, transitionedToLive } = await upsertDeploymentDetailed({
    organizationId: project.organizationId,
    projectId: project.id,
    buildJobId: reconciledBuildId,
    changeRequestId: correlatedChangeRequestId,
    provider,
    externalId: parsed.externalId,
    environment: parsed.environment ?? "production",
    status,
    url: parsed.url,
    commitSha: parsed.commitSha,
    branch: parsed.branch,
    errorMessage: parsed.errorMessage,
    metadata: { webhookKind: parsed.kind },
  });

  // Idempotent deploy-token charge for the same row (one charge per
  // distinct externalId). See build charge above for the same pattern.
  if (deployment.tokenCost === 0) {
    try {
      await chargeDeployTokens(deployment.id, deployment.organizationId, deployment.projectId);
    } catch (err) {
      logger.warn({ err, deploymentId: deployment.id }, "auto-deploy charge failed");
    }
  }

  // Only production deployments touch productionUrl/productionHeartbeatAt.
  if (transitionedToLive && deployment.environment === "production") {
    if (parsed.url && !project.productionUrl) {
      await db
        .update(projectsTable)
        .set({ productionUrl: parsed.url, productionHeartbeatAt: new Date() })
        .where(eq(projectsTable.id, project.id));
    } else {
      await db
        .update(projectsTable)
        .set({ productionHeartbeatAt: new Date() })
        .where(eq(projectsTable.id, project.id));
    }
  }

  return {
    status: 200,
    body: { received: true, deploymentId: deployment.id, buildJobId: reconciledBuildId, status, transitionedToLive },
  };
}

router.post(
  "/hosts/vercel/webhook",
  raw({ type: "*/*", limit: "1mb" }),
  async (req, res): Promise<void> => {
    try {
      const result = await handleProvider("vercel", req.body as Buffer, req.headers);
      res.status(result.status).json(result.body);
    } catch (err) {
      logger.error({ err }, "Vercel webhook handler failed");
      res.status(500).json({ error: "webhook handler failed" });
    }
  },
);

router.post(
  "/hosts/render/webhook",
  raw({ type: "*/*", limit: "1mb" }),
  async (req, res): Promise<void> => {
    try {
      const result = await handleProvider("render", req.body as Buffer, req.headers);
      res.status(result.status).json(result.body);
    } catch (err) {
      logger.error({ err }, "Render webhook handler failed");
      res.status(500).json({ error: "webhook handler failed" });
    }
  },
);

export default router;
