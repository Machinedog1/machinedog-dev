import { and, eq, inArray, sql, desc } from "drizzle-orm";
import {
  db,
  buildJobsTable,
  deploymentsTable,
  changeRequestsTable,
  changeRequestEventsTable,
  projectSecretsTable,
  organizationsTable,
  type BuildJob,
  type Deployment,
  type BuildJobProvider,
  type BuildJobStatus,
  type DeploymentStatus,
} from "@workspace/db";
import { decryptSecret } from "./encryption";
import { logger } from "./logger";
import { recordAuditEventAsync } from "./audit";
import * as tokenService from "./token-service";

export const BUILD_TOKEN_COST = 5;
export const DEPLOY_TOKEN_COST = 10;

interface CreateBuildJobInput {
  organizationId: number;
  projectId: number;
  changeRequestId?: number | null;
  provider: BuildJobProvider;
  environment?: "development" | "preview" | "staging" | "production";
  branch?: string | null;
  commitSha?: string | null;
  externalId?: string | null;
  triggeredBy?: string | null;
  triggeredByEmail?: string | null;
  metadata?: Record<string, unknown>;
}

export async function createBuildJob(input: CreateBuildJobInput): Promise<BuildJob> {
  const [row] = await db
    .insert(buildJobsTable)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      changeRequestId: input.changeRequestId ?? null,
      provider: input.provider,
      status: "queued",
      environment: input.environment ?? "production",
      branch: input.branch ?? null,
      commitSha: input.commitSha ?? null,
      externalId: input.externalId ?? null,
      triggeredBy: input.triggeredBy ?? null,
      triggeredByEmail: input.triggeredByEmail ?? null,
      tokenCost: 0,
      metadata: input.metadata ?? null,
    })
    .returning();
  recordAuditEventAsync({
    organizationId: input.organizationId,
    projectId: input.projectId,
    actorOrganizationId: input.organizationId,
    actorEmail: input.triggeredByEmail ?? null,
    category: "build",
    action: "build_started",
    targetType: "build_job",
    targetId: String(row.id),
    metadata: {
      provider: input.provider,
      branch: input.branch,
      commitSha: input.commitSha,
      changeRequestId: input.changeRequestId,
    },
  });
  if (input.changeRequestId) {
    await db.insert(changeRequestEventsTable).values({
      changeRequestId: input.changeRequestId,
      kind: "build_started",
      message: `Build queued on ${input.provider}.`,
      actorOrganizationId: null,
      metadata: { buildJobId: row.id, provider: input.provider },
    });
  }
  return row;
}

/**
 * Webhook-side helper: ensure a build_jobs row exists for the given
 * (provider, externalId) pair. Used by the auto-deploy path where a PR
 * merge triggers the host directly (no operator click on Publish), so
 * the host webhook is the first time we hear about the deploy.
 *
 * Idempotent: if a row already exists, returns it untouched. Otherwise
 * inserts a new queued build with whatever metadata the webhook provided
 * and emits the standard build_started audit/CR event via createBuildJob.
 */
export async function findOrCreateBuildJobForWebhook(input: {
  organizationId: number;
  projectId: number;
  changeRequestId: number | null;
  provider: BuildJobProvider;
  externalId: string;
  environment: "preview" | "staging" | "production";
  branch: string | null;
  commitSha: string | null;
}): Promise<BuildJob> {
  const [existing] = await db
    .select()
    .from(buildJobsTable)
    .where(
      and(
        eq(buildJobsTable.provider, input.provider),
        eq(buildJobsTable.externalId, input.externalId),
      ),
    )
    .limit(1);
  if (existing) return existing;
  return createBuildJob({
    organizationId: input.organizationId,
    projectId: input.projectId,
    changeRequestId: input.changeRequestId,
    provider: input.provider,
    environment: input.environment,
    branch: input.branch,
    commitSha: input.commitSha,
    externalId: input.externalId,
    triggeredBy: "host_webhook",
    triggeredByEmail: null,
    metadata: { source: "host_webhook" },
  });
}

export async function chargeBuildTokens(
  buildJobId: number,
  organizationId: number,
  projectId: number,
  amount = BUILD_TOKEN_COST,
): Promise<void> {
  // Token deduction is authoritative: if tokenService.deduct throws
  // (e.g. insufficient balance) we let the error propagate so the
  // calling route can fail the build and respond 402. We only update
  // the build row's tokenCost after a successful deduction.
  await tokenService.deduct(organizationId, amount, "build", {
    projectId,
    description: `Build #${buildJobId}`,
    metadata: { buildJobId },
  });
  await db
    .update(buildJobsTable)
    .set({ tokenCost: sql`${buildJobsTable.tokenCost} + ${amount}` })
    .where(eq(buildJobsTable.id, buildJobId));
}

export async function chargeDeployTokens(
  deploymentId: number,
  organizationId: number,
  projectId: number,
  amount = DEPLOY_TOKEN_COST,
): Promise<void> {
  // Authoritative deduct (see chargeBuildTokens). Caller must handle
  // failure (mark deployment failed, return 402).
  await tokenService.deduct(organizationId, amount, "deploy", {
    projectId,
    description: `Deployment #${deploymentId}`,
    metadata: { deploymentId },
  });
  await db
    .update(deploymentsTable)
    .set({ tokenCost: sql`${deploymentsTable.tokenCost} + ${amount}` })
    .where(eq(deploymentsTable.id, deploymentId));
}

interface UpdateBuildJobInput {
  buildJobId: number;
  status?: BuildJobStatus;
  externalId?: string | null;
  logsUrl?: string | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  commitSha?: string | null;
}

export async function updateBuildJob(input: UpdateBuildJobInput): Promise<BuildJob | null> {
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.externalId !== undefined) patch.externalId = input.externalId;
  if (input.logsUrl !== undefined) patch.logsUrl = input.logsUrl;
  if (input.errorMessage !== undefined) patch.errorMessage = input.errorMessage;
  if (input.startedAt !== undefined) patch.startedAt = input.startedAt;
  if (input.finishedAt !== undefined) patch.finishedAt = input.finishedAt;
  if (input.commitSha !== undefined) patch.commitSha = input.commitSha;
  if (Object.keys(patch).length === 0) return null;
  const [row] = await db
    .update(buildJobsTable)
    .set(patch)
    .where(eq(buildJobsTable.id, input.buildJobId))
    .returning();
  if (!row) return null;
  // Per-org build-minute accounting on terminal transitions. Idempotent
  // by virtue of updateBuildJob being called once per terminal status
  // (subsequent calls are short-circuited by the monotonic state guards
  // on the caller side).
  if (
    (input.status === "succeeded" ||
      input.status === "failed" ||
      input.status === "canceled") &&
    row.startedAt &&
    row.finishedAt
  ) {
    const ms = row.finishedAt.getTime() - row.startedAt.getTime();
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    await db
      .update(organizationsTable)
      .set({
        buildMinutesUsed: sql`${organizationsTable.buildMinutesUsed} + ${minutes}`,
      })
      .where(eq(organizationsTable.id, row.organizationId));
  }
  if (input.status === "succeeded" || input.status === "failed") {
    recordAuditEventAsync({
      organizationId: row.organizationId,
      projectId: row.projectId,
      category: "build",
      action: input.status === "succeeded" ? "build_succeeded" : "build_failed",
      targetType: "build_job",
      targetId: String(row.id),
      metadata: { provider: row.provider, externalId: row.externalId, errorMessage: row.errorMessage },
    });
    if (row.changeRequestId) {
      await db.insert(changeRequestEventsTable).values({
        changeRequestId: row.changeRequestId,
        kind: input.status === "succeeded" ? "build_succeeded" : "build_failed",
        message:
          input.status === "succeeded"
            ? "Build completed successfully."
            : `Build failed: ${row.errorMessage ?? "unknown error"}`,
        actorOrganizationId: null,
        metadata: { buildJobId: row.id, provider: row.provider },
      });
    }
  }
  return row;
}

/**
 * Reconcile a host webhook with the build_jobs row that originally triggered
 * the deploy. We match by (provider, externalId) — the externalId is set
 * when the build is first queued via the host adapter — and only update when
 * the kind maps to a real lifecycle change. Returns the build job (or null
 * when no match exists, e.g. a webhook for a deploy initiated outside of
 * Machinedog).
 */
export async function reconcileBuildFromWebhook(
  provider: BuildJobProvider,
  externalId: string,
  kind:
    | "deployment.created"
    | "deployment.live"
    | "deployment.failed"
    | "deployment.canceled",
  errorMessage: string | null,
): Promise<BuildJob | null> {
  const [job] = await db
    .select()
    .from(buildJobsTable)
    .where(
      and(
        eq(buildJobsTable.provider, provider),
        eq(buildJobsTable.externalId, externalId),
      ),
    );
  if (!job) return null;
  // Only progress forward — never regress a finished build to running.
  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
    return job;
  }
  if (kind === "deployment.created") {
    if (job.status === "queued") {
      return updateBuildJob({
        buildJobId: job.id,
        status: "running",
        startedAt: new Date(),
      });
    }
    return job;
  }
  if (kind === "deployment.live") {
    return updateBuildJob({
      buildJobId: job.id,
      status: "succeeded",
      finishedAt: new Date(),
      startedAt: job.startedAt ?? new Date(),
    });
  }
  if (kind === "deployment.failed") {
    return updateBuildJob({
      buildJobId: job.id,
      status: "failed",
      finishedAt: new Date(),
      errorMessage: errorMessage ?? "deployment failed",
    });
  }
  if (kind === "deployment.canceled") {
    return updateBuildJob({
      buildJobId: job.id,
      status: "canceled",
      finishedAt: new Date(),
    });
  }
  return job;
}

interface UpsertDeploymentInput {
  organizationId: number;
  projectId: number;
  buildJobId?: number | null;
  changeRequestId?: number | null;
  provider: BuildJobProvider;
  externalId: string | null;
  environment?: "preview" | "staging" | "production";
  status: DeploymentStatus;
  url?: string | null;
  commitSha?: string | null;
  branch?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Upsert the deployment row, returning {row, transitionedToLive} so the
 * caller can perform side-effects (token charging, project URL update,
 * audit emission) exactly once per real status transition. Webhook retries
 * are common — without this idempotency guard we would deduct deploy
 * tokens repeatedly for the same deploy id.
 */
export async function upsertDeployment(
  input: UpsertDeploymentInput,
): Promise<Deployment> {
  const result = await upsertDeploymentDetailed(input);
  return result.row;
}

export async function upsertDeploymentDetailed(input: UpsertDeploymentInput): Promise<{
  row: Deployment;
  transitionedToLive: boolean;
}> {
  let existing: Deployment | null = null;
  if (input.externalId) {
    const [row] = await db
      .select()
      .from(deploymentsTable)
      .where(
        and(
          eq(deploymentsTable.provider, input.provider),
          eq(deploymentsTable.externalId, input.externalId),
        ),
      );
    existing = row ?? null;
  }
  const wasLive = existing?.status === "live";
  // Monotonic state machine: webhooks may be reordered or replayed, so
  // never let an out-of-order frame regress a deployment from a terminal
  // state (live/failed/canceled) back to building/queued. Metadata fields
  // (url, commitSha, etc.) may still be backfilled.
  const TERMINAL: ReadonlyArray<string> = ["live", "failed", "canceled"] as const;
  const isRegression =
    !!existing &&
    TERMINAL.includes(existing.status) &&
    input.status !== existing.status &&
    !TERMINAL.includes(input.status);
  let row: Deployment;
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!isRegression) patch.status = input.status;
    if (input.url !== undefined) patch.url = input.url ?? existing.url;
    if (input.errorMessage !== undefined && !isRegression) patch.errorMessage = input.errorMessage;
    if (input.status === "live" && !isRegression) patch.deployedAt = new Date();
    if (input.commitSha !== undefined && input.commitSha) patch.commitSha = input.commitSha;
    if (input.branch !== undefined && input.branch) patch.branch = input.branch;
    if (input.buildJobId) patch.buildJobId = input.buildJobId;
    if (input.changeRequestId) patch.changeRequestId = input.changeRequestId;
    if (Object.keys(patch).length === 0) {
      row = existing;
    } else {
      [row] = await db
        .update(deploymentsTable)
        .set(patch)
        .where(eq(deploymentsTable.id, existing.id))
        .returning();
    }
  } else {
    [row] = await db
      .insert(deploymentsTable)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        buildJobId: input.buildJobId ?? null,
        changeRequestId: input.changeRequestId ?? null,
        provider: input.provider,
        externalId: input.externalId,
        environment: input.environment ?? "production",
        status: input.status,
        url: input.url ?? null,
        commitSha: input.commitSha ?? null,
        branch: input.branch ?? null,
        errorMessage: input.errorMessage ?? null,
        deployedAt: input.status === "live" ? new Date() : null,
        metadata: input.metadata ?? null,
      })
      .returning();
    // First time we record this deployment — emit `deployment_started` so
    // the audit log captures the initiation (separate from `deployment_live`
    // / `deployment_failed` which fire on terminal transitions below).
    if (input.status !== "live" && input.status !== "failed") {
      recordAuditEventAsync({
        organizationId: row.organizationId,
        projectId: row.projectId,
        category: "deployment",
        action: "deployment_started",
        targetType: "deployment",
        targetId: String(row.id),
        metadata: {
          provider: row.provider,
          externalId: row.externalId,
          environment: row.environment,
          buildJobId: row.buildJobId,
        },
      });
    }
  }

  const transitionedToLive = !isRegression && input.status === "live" && !wasLive;
  // Only emit lifecycle audit/CR-event side effects on real transitions
  // — duplicate webhook deliveries should be no-ops.
  const shouldEmit =
    transitionedToLive ||
    (input.status === "failed" && existing?.status !== "failed");

  if (shouldEmit && (input.status === "live" || input.status === "failed")) {
    recordAuditEventAsync({
      organizationId: row.organizationId,
      projectId: row.projectId,
      category: "deployment",
      action: input.status === "live" ? "deployment_live" : "deployment_failed",
      targetType: "deployment",
      targetId: String(row.id),
      metadata: { provider: row.provider, externalId: row.externalId, url: row.url },
    });
    if (row.changeRequestId) {
      await db.insert(changeRequestEventsTable).values({
        changeRequestId: row.changeRequestId,
        kind: input.status === "live" ? "deployment_live" : "deployment_failed",
        message:
          input.status === "live"
            ? `Deployment live at ${row.url ?? "(no url)"}`
            : `Deployment failed: ${row.errorMessage ?? "unknown"}`,
        actorOrganizationId: null,
        metadata: { deploymentId: row.id, provider: row.provider, url: row.url },
      });
    }
  }

  // Auto-flip CRs only on first live transition of a production deployment.
  // Preview/staging live events must not flip CR.status -> deployed.
  if (transitionedToLive && row.environment === "production") {
    await autoFlipAwaitingDeploy(row);
    if (input.commitSha) {
      await autoFlipByCommit(row);
    }
  }
  return { row, transitionedToLive };
}

async function autoFlipAwaitingDeploy(deployment: Deployment): Promise<void> {
  if (!deployment.changeRequestId) return;
  const transitioned = await db
    .update(changeRequestsTable)
    .set({ status: "deployed", deployedAt: new Date() })
    .where(
      and(
        eq(changeRequestsTable.id, deployment.changeRequestId),
        eq(changeRequestsTable.status, "awaiting_deploy"),
      ),
    )
    .returning({ id: changeRequestsTable.id });
  if (transitioned.length > 0) {
    await db.insert(changeRequestEventsTable).values({
      changeRequestId: transitioned[0].id,
      kind: "deploy_auto_detected",
      message: `Host webhook reported deployment live (${deployment.provider}).`,
      actorOrganizationId: null,
      metadata: { deploymentId: deployment.id, url: deployment.url },
    });
  }
}

async function autoFlipByCommit(deployment: Deployment): Promise<void> {
  if (!deployment.commitSha) return;
  // Strict matching: only flip awaiting_deploy CRs that produced a build
  // job for this project with the exact same commit SHA as the live
  // deployment. This avoids the previous time-window heuristic that could
  // sweep up unrelated CRs merged near the deploy window.
  const linkedBuilds = await db
    .selectDistinct({ changeRequestId: buildJobsTable.changeRequestId })
    .from(buildJobsTable)
    .where(
      and(
        eq(buildJobsTable.projectId, deployment.projectId),
        eq(buildJobsTable.commitSha, deployment.commitSha),
      ),
    );
  const ids = linkedBuilds
    .map((b) => b.changeRequestId)
    .filter((id): id is number => typeof id === "number");
  if (ids.length === 0) return;
  const transitioned = await db
    .update(changeRequestsTable)
    .set({ status: "deployed", deployedAt: new Date() })
    .where(
      and(
        inArray(changeRequestsTable.id, ids),
        eq(changeRequestsTable.status, "awaiting_deploy"),
      ),
    )
    .returning({ id: changeRequestsTable.id });
  if (transitioned.length > 0) {
    await db.insert(changeRequestEventsTable).values(
      transitioned.map((cr) => ({
        changeRequestId: cr.id,
        kind: "deploy_auto_detected" as const,
        message: `Host webhook reported deployment live (${deployment.provider}) — auto-marked deployed.`,
        actorOrganizationId: null,
        metadata: {
          deploymentId: deployment.id,
          provider: deployment.provider,
          url: deployment.url,
          commitSha: deployment.commitSha,
        },
      })),
    );
  }
}

export async function loadProjectSecretValue(
  projectId: number,
  environment: "development" | "staging" | "production",
  name: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(projectSecretsTable)
    .where(
      and(
        eq(projectSecretsTable.projectId, projectId),
        eq(projectSecretsTable.environment, environment),
        eq(projectSecretsTable.name, name),
      ),
    );
  if (!row) return null;
  try {
    return decryptSecret({
      encryptedValue: row.encryptedValue,
      nonce: row.nonce,
      authTag: row.authTag,
    });
  } catch (err) {
    logger.warn({ err, projectId, name }, "Failed to decrypt project secret");
    return null;
  }
}

export async function listBuildsForProject(projectId: number, limit = 50): Promise<BuildJob[]> {
  return db
    .select()
    .from(buildJobsTable)
    .where(eq(buildJobsTable.projectId, projectId))
    .orderBy(desc(buildJobsTable.createdAt))
    .limit(limit);
}

export async function listDeploymentsForProject(
  projectId: number,
  limit = 50,
): Promise<Deployment[]> {
  return db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.projectId, projectId))
    .orderBy(desc(deploymentsTable.createdAt))
    .limit(limit);
}
