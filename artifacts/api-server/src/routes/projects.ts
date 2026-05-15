import { Router, type IRouter } from "express";
import { eq, desc, asc, and, inArray, or, ne, isNotNull, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectMembersTable,
  projectCommentsTable,
  projectFilesTable,
  promptSessionsTable,
  organizationsTable,
  changeRequestsTable,
  changeRequestEventsTable,
  templatesTable,
  complianceProfilesTable,
  type Project,
} from "@workspace/db";
import {
  ListMyProjectsResponse,
  CreateProjectBody,
  GetProjectParams,
  GetProjectResponse,
  UpdateProjectParams,
  UpdateProjectBody,
  UpdateProjectResponse,
  ListProjectMembersParams,
  ListProjectMembersResponse,
  InviteProjectMemberParams,
  InviteProjectMemberBody,
  RemoveProjectMemberParams,
  ListProjectCommentsParams,
  ListProjectCommentsResponse,
  AddProjectCommentParams,
  AddProjectCommentBody,
  DeleteProjectCommentParams,
  ListProjectPromptsParams,
  ListProjectPromptsResponse,
  SubmitProjectPromptParams,
  SubmitProjectPromptBody,
  SubmitProjectPromptResponse,
  ListProjectFilesParams,
  ListProjectFilesResponse,
  AddProjectFileParams,
  AddProjectFileBody,
  DeleteProjectFileParams,
  ProjectHeartbeatBody,
  ProjectHeartbeatResponse,
  ProjectProdHeartbeatBody,
  ProjectProdHeartbeatResponse,
  RotateProjectHeartbeatTokenParams,
  RotateProjectHeartbeatTokenResponse,
} from "@workspace/api-zod";
import { randomBytes } from "node:crypto";
import { requireAuth, loadOrCreateClient, requireActiveClient } from "../lib/auth";
import { sendProjectInviteEmail } from "../lib/project-invites";
import { logger } from "../lib/logger";
import { runClaudePrompt } from "../lib/anthropic";
import { computeChargedTokens } from "../lib/billing";
import { deduct as deductTokens, getBalance as getTokenBalance } from "../lib/token-service";
import { importGithubAsProject } from "../lib/github-import";
import {
  resolveBranchSha,
  pushBranchWithFiles,
  fetchBranchTreeFiles,
  listBranchTreePaths,
  GitHubApiError,
  GitHubConflictError,
  GitHubNotConfiguredError,
} from "../lib/github";
import { generateSecureToken } from "../lib/passwords";
import { recordAuditEventAsync, reqAuditMeta } from "../lib/audit";
import { ObjectStorageService } from "../lib/objectStorage";
import { scanForPhi } from "../lib/ai-phi-guard";

const PROJECT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const router: IRouter = Router();

type ProjectWithRole = Project & { viewerRole: "owner" | "collaborator" };

function withOwnerRole(row: Project): ProjectWithRole {
  return { ...row, viewerRole: "owner" };
}

function withCollaboratorRole(row: Project): ProjectWithRole {
  // Strip owner-only fields from collaborator-visible payloads. The heartbeat
  // token is functionally a per-project secret — anyone with it can overwrite
  // the project's liveUrl from anywhere on the internet.
  return {
    ...row,
    heartbeatToken: null,
    viewerRole: "collaborator",
  };
}

function generateHeartbeatToken(): string {
  // 32 hex chars = 128 bits — collision-resistant and short enough to paste.
  return randomBytes(16).toString("hex");
}

async function getViewableProject(
  projectId: number,
  clientId: number,
  clientEmail: string,
): Promise<ProjectWithRole | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;

  if (project.organizationId === clientId) {
    return withOwnerRole(project);
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
  if (member) {
    return withCollaboratorRole(project);
  }
  return null;
}

router.get(
  "/projects",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const client = req.dbClient!;
    const owned = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.organizationId, client.id))
      .orderBy(desc(projectsTable.updatedAt));

    const memberships = await db
      .select({ projectId: projectMembersTable.projectId })
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.status, "active"),
          or(
            eq(projectMembersTable.organizationId, client.id),
            eq(projectMembersTable.email, client.email.toLowerCase()),
          ),
        ),
      );

    const sharedIds = memberships.map((m) => m.projectId);
    const shared =
      sharedIds.length > 0
        ? await db
            .select()
            .from(projectsTable)
            .where(
              and(
                inArray(projectsTable.id, sharedIds),
                ne(projectsTable.organizationId, client.id),
              ),
            )
            .orderBy(desc(projectsTable.updatedAt))
        : [];

    const data: ProjectWithRole[] = [
      ...owned.map(withOwnerRole),
      ...shared.map(withCollaboratorRole),
    ];
    res.json(ListMyProjectsResponse.parse({ data }));
  },
);

router.post(
  "/projects",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;
    const templateSlug = data.templateSlug?.trim() || null;
    const githubOwner = data.githubOwner?.trim() || null;
    const githubRepo = data.githubRepo?.trim() || null;
    const githubDefaultBranch = data.githubDefaultBranch?.trim() || "main";

    // The wizard sends one of: blank (neither), template (templateSlug), or
    // GitHub (owner+repo). Mixing them would imply ambiguous origin, so we
    // bail rather than guess which one wins.
    if (templateSlug && (githubOwner || githubRepo)) {
      res
        .status(400)
        .json({ error: "Cannot combine templateSlug with GitHub fields." });
      return;
    }
    // Reject partial GitHub input — owner without repo (or vice versa) is
    // ambiguous and would silently fall back to a blank project, which has
    // bitten the wizard in QA. Require both, or neither.
    if (Boolean(githubOwner) !== Boolean(githubRepo)) {
      res.status(400).json({
        error:
          "githubOwner and githubRepo must be provided together for a GitHub-origin project.",
        code: "github_partial_input",
      });
      return;
    }

    let template: typeof templatesTable.$inferSelect | undefined;
    if (templateSlug) {
      [template] = await db
        .select()
        .from(templatesTable)
        .where(eq(templatesTable.slug, templateSlug));
      if (!template) {
        res.status(404).json({ error: `Template "${templateSlug}" not found.` });
        return;
      }
      // Healthcare templates are gated by org plan tier — surface a clear
      // upgrade-required error rather than silently allowing creation.
      const resolved = req.organization ? { organization: req.organization } : null;
      if (template.isHealthcare) {
        const tier = resolved?.organization.planType ?? null;
        if (tier !== "healthcare" && tier !== "enterprise") {
          res.status(403).json({
            error:
              "This template requires a Healthcare or Enterprise plan. Upgrade your workspace to enable HIPAA-ready templates.",
            code: "plan_upgrade_required",
            requiredPlans: ["healthcare", "enterprise"],
          });
          return;
        }
      }
      // Premium-template token preflight. Templates with a non-zero
      // tokenCost charge the org's token ledger when a project is created
      // from them. We block creation up-front rather than half-creating a
      // project and failing on the deduct.
      if ((template.tokenCost ?? 0) > 0) {
        if (!resolved) {
          res.status(403).json({
            error:
              "This template requires a token balance, but your workspace has no organization configured.",
            code: "no_organization",
          });
          return;
        }
        const balance = await getTokenBalance(resolved.organization.id);
        if (balance < template.tokenCost) {
          res.status(402).json({
            error: `This template costs ${template.tokenCost} tokens. Your balance is ${balance}.`,
            code: "insufficient_tokens",
            tokenCost: template.tokenCost,
            tokenBalance: balance,
          });
          return;
        }
      }
    }

    let row: typeof projectsTable.$inferSelect;
    if (githubOwner && githubRepo) {
      // GitHub origin — delegate to the shared importGithubAsProject
      // service so the wizard and the admin /admin/projects/import-github
      // endpoint share dedupe semantics, normalization, and the unique-
      // index race handling.
      const outcome = await importGithubAsProject({
        organizationId: req.dbClient!.id,
        owner: githubOwner,
        repo: githubRepo,
        defaultBranch: githubDefaultBranch,
        title: data.title,
        description: data.description,
        summary: data.summary ?? "",
      });
      if (!outcome.ok) {
        res.status(409).json({
          error: outcome.message,
          code: "github_repo_already_imported",
          existingProjectId: outcome.existingProjectId,
        });
        return;
      }
      row = outcome.project;
    } else {
      [row] = await db
        .insert(projectsTable)
        .values({
          organizationId: req.dbClient!.id,
          title: data.title,
          description: data.description,
          summary: data.summary ?? "",
          liveUrl: data.liveUrl?.trim() || null,
          coverImageUrl: data.coverImageUrl?.trim() || null,
          status: "draft",
          projectType: template?.projectType ?? "web_app",
          framework: template?.framework ?? "react",
          templateSlug: template?.slug ?? null,
          // Phase 6: default new projects to GitHub-driven Vercel hosting so
          // PR-merge auto-deploy "just works" without operator clicks. Users
          // can switch to Render or Replit (heartbeat) in Project Settings.
          // Existing rows keep whatever provider they had.
          hostingProvider: "vercel",
          healthcareMode: template?.isHealthcare ?? false,
          // PHI capture stays disabled even for healthcare templates until
          // the BAA flow (Phase 8) flips it on. We only mark BAA "required"
          // so the UI prompts the operator.
          phiAllowed: false,
          baaStatus: template?.isHealthcare ? "required" : "not_required",
          heartbeatToken: generateHeartbeatToken(),
        })
        .returning();
    }

    // Materialize starter files into project_files so the project opens
    // with at least one row, regardless of origin:
    //   - template origin: copy each templates.starterFiles entry
    //   - blank origin:    seed a generated README.md
    //   - github origin:   skipped (the repo IS the starter content)
    // Each row's content is uploaded to object storage and recorded with a
    // real `/objects/...` path so the existing files UI (which links
    // straight at objectPath) and the /objects/* download route both work.
    const storage = new ObjectStorageService();
    type StarterFile = { path: string; contents: string; contentType?: string };
    const filesToSeed: StarterFile[] = [];
    if (template && Array.isArray(template.starterFiles) && template.starterFiles.length > 0) {
      for (const f of template.starterFiles) {
        filesToSeed.push({
          path: f.path,
          contents: f.contents ?? "",
          contentType: "text/plain",
        });
      }
    } else if (!template && !(githubOwner && githubRepo)) {
      filesToSeed.push({
        path: "README.md",
        contents: `# ${row.title}\n\n${row.summary ?? row.description ?? "New Machinedog project."}\n`,
        contentType: "text/markdown",
      });
    }
    if (filesToSeed.length > 0) {
      try {
        const uploaded = await Promise.all(
          filesToSeed.map(async (f) => {
            const objectPath = await storage.uploadInlineObject({
              contents: f.contents,
              contentType: f.contentType ?? "text/plain",
            });
            return {
              projectId: row.id,
              uploadedByOrganizationId: req.dbClient!.id,
              name: f.path,
              contentType: f.contentType ?? "text/plain",
              sizeBytes: Buffer.byteLength(f.contents, "utf8"),
              objectPath,
            };
          }),
        );
        await db.insert(projectFilesTable).values(uploaded);
      } catch (err) {
        // Best-effort: don't fail the create if storage hiccups — the
        // project itself is fine and the user can re-add files via the UI.
        logger.warn(
          { err, projectId: row.id, templateSlug: template?.slug ?? null },
          "Failed to seed starter project_files",
        );
      }
    }

    // Deduct the template's token cost (if any) AFTER the project row is
    // committed so the ledger entry can reference projectId. The balance
    // was preflighted above; if a concurrent deduction races us under the
    // row lock and pushes us negative, we throw and 500 — the project row
    // remains, and the operator can retry the deduct manually. This is
    // acceptable for v1 because tokenCost is 0 for every seeded template
    // today; premium-template introduction (Phase 4) will harden the path.
    if (template && (template.tokenCost ?? 0) > 0) {
      try {
        const resolved = req.organization ? { organization: req.organization } : null;
        if (resolved) {
          await deductTokens(
            resolved.organization.id,
            template.tokenCost,
            "template",
            {
              actorOrganizationId: req.dbClient!.id,
              projectId: row.id,
              description: `Template "${template.slug}" creation: -${template.tokenCost}`,
              metadata: { templateSlug: template.slug, templateName: template.name },
            },
          );
        }
      } catch (err) {
        logger.warn(
          { err, projectId: row.id, templateSlug: template.slug },
          "Token deduction for premium template failed after project create",
        );
      }
    }

    recordAuditEventAsync({
      organizationId: row.organizationId,
      projectId: row.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "project",
      action: "project_created",
      targetType: "project",
      targetId: String(row.id),
      metadata: {
        title: row.title,
        templateSlug,
        githubOwner,
        githubRepo,
      },
      ...reqAuditMeta(req),
    });
    if (row.healthcareMode) {
      recordAuditEventAsync({
        organizationId: row.organizationId,
        projectId: row.id,
        actorOrganizationId: req.dbClient!.id,
        actorEmail: req.dbClient!.email,
        category: "healthcare",
        action: "healthcare_mode_requested",
        targetType: "project",
        targetId: String(row.id),
        metadata: { templateSlug, baaStatus: row.baaStatus },
        ...reqAuditMeta(req),
      });
    }
    if (githubOwner && githubRepo) {
      recordAuditEventAsync({
        organizationId: row.organizationId,
        projectId: row.id,
        actorOrganizationId: req.dbClient!.id,
        actorEmail: req.dbClient!.email,
        category: "github",
        action: "github_connected",
        targetType: "project",
        targetId: String(row.id),
        metadata: { owner: githubOwner, repo: githubRepo },
        ...reqAuditMeta(req),
      });
    }
    res.status(201).json(GetProjectResponse.parse(withOwnerRole(row)));
  },
);

// Public heartbeat endpoint — no session auth. Auth is the per-project token
// in the body. Called by the small snippet installed in client apps to keep
// liveUrl in sync with the current Replit dev domain (which changes per-run).
router.post("/projects/heartbeat", async (req, res): Promise<void> => {
  const body = ProjectHeartbeatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: { code: "bad_request", message: body.error.message } });
    return;
  }
  const devUrl = body.data.devUrl.trim();
  // Refuse anything that doesn't look like a URL we'd actually iframe.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(devUrl);
  } catch {
    res.status(400).json({ error: { code: "bad_request", message: "devUrl is not a valid URL" } });
    return;
  }
  if (parsedUrl.protocol !== "https:") {
    res.status(400).json({ error: { code: "bad_request", message: "devUrl must be https" } });
    return;
  }
  // Lock the heartbeat to Replit-issued dev hosts. Without this, a leaked
  // token would let an attacker repoint the project's liveUrl (and therefore
  // the iframe shown to collaborators) at an arbitrary phishing destination.
  // Allow `*.replit.dev` (any subdomain depth) and the bare apex; everything
  // else is rejected. Production URLs (`*.replit.app`) are managed via the
  // separate productionUrl field, not heartbeats.
  const host = parsedUrl.hostname.toLowerCase();
  const isReplitDev =
    host === "replit.dev" || host.endsWith(".replit.dev");
  if (!isReplitDev) {
    res.status(400).json({
      error: {
        code: "bad_request",
        message: "devUrl must be a *.replit.dev host",
      },
    });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.heartbeatToken, body.data.token));
  if (!project) {
    res.status(401).json({ error: { code: "unauthorized", message: "Unknown token" } });
    return;
  }

  const now = new Date();
  const normalized = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const [updated] = await db
    .update(projectsTable)
    .set({ liveUrl: normalized, heartbeatAt: now })
    .where(eq(projectsTable.id, project.id))
    .returning();

  logger.info(
    {
      projectId: updated.id,
      devUrl: normalized,
      replId: body.data.replId ?? null,
      replSlug: body.data.replSlug ?? null,
    },
    "Project heartbeat received",
  );

  const payload = ProjectHeartbeatResponse.parse({
    ok: true,
    projectId: updated.id,
    liveUrl: updated.liveUrl ?? normalized,
    receivedAt: now,
  });
  res.json(payload);
});

// Public production heartbeat endpoint — no session auth, token-only. Hit by
// the same snippet running on the deployed app (where REPLIT_DEV_DOMAIN is
// unset). Records each fresh boot and, when a fresh boot happens far enough
// after but not too long after a CR's merge, auto-flips that CR's status
// from `awaiting_deploy` to `deployed` with a `deploy_auto_detected` event.
//
// Defenses against the inherent ambiguity of "did this instance boot from
// the new code, or is it just an Autoscale instance running old code?":
//   1. **Bounded bootedAt** (BOOT_SKEW_MS): the client-supplied bootedAt must
//      be within 5 minutes of server clock. Without this, a leaked token
//      could submit a far-future bootedAt and force any subsequent merge to
//      auto-deploy.
//   2. **Post-merge grace** (POST_MERGE_GRACE_MS): boot must be at least 60s
//      AFTER the merge. Catches the common race of an Autoscale spawn that
//      happens between merge and the operator's Republish click.
//   3. **Pre-merge ceiling** (MAX_AGE_AFTER_MERGE_MS): only consider CRs
//      merged in the last 90 minutes. Beyond that, the operator probably
//      hasn't redeployed yet; an Autoscale boot of old code shouldn't
//      retroactively mark deploys older than 90 minutes.
//   4. **Atomic marker CAS**: claiming a fresh boot marker uses a conditional
//      UPDATE — only the first concurrent request with the same fresh marker
//      runs the auto-mark logic, preventing duplicate events.
//   5. **Status-guarded CR update**: the awaiting→deployed UPDATE re-asserts
//      `status='awaiting_deploy'` in its WHERE, so two concurrent heartbeats
//      seeing the same CRs can't both succeed at the flip.
router.post("/projects/prod-heartbeat", async (req, res): Promise<void> => {
  const body = ProjectProdHeartbeatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: { code: "bad_request", message: body.error.message } });
    return;
  }
  const { token, bootedAt: bootedAtMs, prodUrl, releaseMarker } = body.data;
  const bootedAt = new Date(bootedAtMs);
  if (Number.isNaN(bootedAt.getTime())) {
    res.status(400).json({ error: { code: "bad_request", message: "bootedAt must be a valid epoch ms" } });
    return;
  }

  // (1) Bounded bootedAt — reject blatant clock spoofing.
  const BOOT_SKEW_MS = 5 * 60 * 1000;
  const skew = Math.abs(bootedAtMs - Date.now());
  if (skew > BOOT_SKEW_MS) {
    res.status(400).json({
      error: {
        code: "bad_request",
        message: `bootedAt is ${Math.round(skew / 1000)}s from server clock; max allowed skew is ${BOOT_SKEW_MS / 1000}s`,
      },
    });
    return;
  }

  let normalizedProdUrl: string | null = null;
  if (prodUrl) {
    try {
      const parsed = new URL(prodUrl);
      if (parsed.protocol !== "https:") {
        throw new Error("not https");
      }
      normalizedProdUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {
      res.status(400).json({ error: { code: "bad_request", message: "prodUrl must be a valid https URL" } });
      return;
    }
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.heartbeatToken, token));
  if (!project) {
    res.status(401).json({ error: { code: "unauthorized", message: "Unknown token" } });
    return;
  }

  const now = new Date();
  // Round bootedAt to whole seconds — process startup jitter shouldn't
  // fragment the marker. Pair with the (optional) releaseMarker so that
  // Replit's per-deploy ID, when present, is the dominant signal.
  const bootMarker = `${Math.floor(bootedAtMs / 1000)}|${releaseMarker ?? ""}`;

  // Always-update fields (liveness + first-seen prodUrl). These are safe
  // to overwrite on every heartbeat regardless of dedup outcome.
  const liveUpdates: Partial<typeof projectsTable.$inferInsert> = {
    productionHeartbeatAt: now,
  };
  if (normalizedProdUrl && !project.productionUrl) {
    liveUpdates.productionUrl = normalizedProdUrl;
  }
  await db.update(projectsTable).set(liveUpdates).where(eq(projectsTable.id, project.id));

  // (4) Atomic marker CAS — only the first request with this fresh marker
  // wins. Concurrent requests will see 0 rows updated and bail out of the
  // auto-mark path, even though the marker comparison passed in app code.
  let wonFreshBootClaim = false;
  if (bootMarker !== project.productionBootMarker) {
    const claimed = await db
      .update(projectsTable)
      .set({ productionBootedAt: bootedAt, productionBootMarker: bootMarker })
      .where(
        and(
          eq(projectsTable.id, project.id),
          sql`(${projectsTable.productionBootMarker} IS DISTINCT FROM ${bootMarker})`,
        ),
      )
      .returning({ id: projectsTable.id });
    wonFreshBootClaim = claimed.length > 0;
  }

  let autoMarkedCrId: number | null = null;

  if (wonFreshBootClaim) {
    // (2) Post-merge grace + (3) pre-merge ceiling — bound the eligibility
    // window so this only considers recently merged CRs.
    const POST_MERGE_GRACE_MS = 60 * 1000;
    const MAX_AGE_AFTER_MERGE_MS = 90 * 60 * 1000;
    const upperCutoff = new Date(bootedAt.getTime() - POST_MERGE_GRACE_MS);
    const lowerCutoff = new Date(bootedAt.getTime() - MAX_AGE_AFTER_MERGE_MS);

    const candidates = await db
      .select({ id: changeRequestsTable.id })
      .from(changeRequestsTable)
      .where(
        and(
          eq(changeRequestsTable.projectId, project.id),
          eq(changeRequestsTable.status, "awaiting_deploy"),
          isNotNull(changeRequestsTable.mergedAt),
          sql`${changeRequestsTable.mergedAt} <= ${upperCutoff.toISOString()}`,
          sql`${changeRequestsTable.mergedAt} >= ${lowerCutoff.toISOString()}`,
        ),
      );

    if (candidates.length > 0) {
      const ids = candidates.map((c) => c.id);
      // (5) Status-guarded UPDATE — re-assert awaiting_deploy in WHERE so
      // a parallel manual mark-deployed call can't be overwritten and we
      // only emit events for rows we actually transitioned.
      const transitioned = await db
        .update(changeRequestsTable)
        .set({ status: "deployed", deployedAt: now })
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
            message: "Production boot detected after merge — auto-marked deployed.",
            actorOrganizationId: null,
            metadata: {
              bootedAt: bootedAt.toISOString(),
              releaseMarker: releaseMarker ?? null,
              prodUrl: normalizedProdUrl,
            },
          })),
        );
        autoMarkedCrId = transitioned[0].id;
        logger.info(
          {
            projectId: project.id,
            changeRequestIds: transitioned.map((c) => c.id),
            bootedAt: bootedAt.toISOString(),
          },
          "Auto-marked change requests as deployed via prod heartbeat",
        );
      }
    }
  }

  logger.info(
    {
      projectId: project.id,
      bootedAt: bootedAt.toISOString(),
      wonFreshBootClaim,
      releaseMarker: releaseMarker ?? null,
      autoMarkedCrId,
    },
    "Project prod heartbeat received",
  );

  const payload = ProjectProdHeartbeatResponse.parse({
    ok: true,
    projectId: project.id,
    receivedAt: now,
    autoMarkedDeployedChangeRequestId: autoMarkedCrId,
  });
  res.json(payload);
});

// Owner-only: rotate the heartbeat token. Old token immediately stops working.
router.post(
  "/projects/:id/heartbeat-token",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = RotateProjectHeartbeatTokenParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: { code: "bad_request", message: "Invalid project id" } });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: { code: "not_found", message: "Project not found" } });
      return;
    }
    if (project.viewerRole !== "owner") {
      res.status(403).json({ error: { code: "forbidden", message: "Only the owner can rotate the token" } });
      return;
    }
    const newToken = generateHeartbeatToken();
    await db
      .update(projectsTable)
      .set({ heartbeatToken: newToken })
      .where(eq(projectsTable.id, project.id));
    res.json(RotateProjectHeartbeatTokenResponse.parse({ heartbeatToken: newToken }));
  },
);

router.get(
  "/projects/:id",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = GetProjectParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(GetProjectResponse.parse(project));
  },
);

router.patch(
  "/projects/:id",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = UpdateProjectParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateProjectBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    // Phase 8 — server-side gate for the project-level PHI mode toggle.
    // Owners may only flip phiAllowed=true once their org meets ALL
    // healthcare-safe preconditions (plan, BAA, MFA, HIPAA deployment).
    // The gate runs against the *current* DB state (not the body), so a
    // single request can never both flip phiAllowed and bypass the check.
    if (body.data.phiAllowed === true || body.data.healthcareMode === true) {
      const [existingProject] = await db
        .select()
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.id, params.data.id),
            eq(projectsTable.organizationId, req.dbClient!.id),
          ),
        );
      if (!existingProject) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const flippingHealthcare =
        body.data.healthcareMode === true && !existingProject.healthcareMode;
      const flippingPhi =
        body.data.phiAllowed === true && !existingProject.phiAllowed;
      if (flippingHealthcare && !flippingPhi) {
        // Plan-tier gate for healthcareMode toggles. PHI requires the full
        // BAA / HIPAA / MFA stack (checked below); healthcareMode by itself
        // only requires the org be on a Healthcare or Enterprise plan.
        const [org] = await db
          .select({ planType: organizationsTable.planType })
          .from(organizationsTable)
          .where(eq(organizationsTable.id, req.dbClient!.id))
          .limit(1);
        const planType = org?.planType ?? "free";
        if (planType !== "healthcare" && planType !== "enterprise") {
          recordAuditEventAsync({
            organizationId: existingProject.organizationId,
            projectId: existingProject.id,
            actorOrganizationId: req.dbClient!.id,
            actorEmail: req.dbClient!.email,
            category: "compliance",
            action: "healthcare_gating_blocked",
            targetType: "project",
            targetId: String(existingProject.id),
            metadata: {
              attempted: "healthcare_mode_enable",
              failedPreconditions: [
                `org.planType must be healthcare or enterprise (is ${planType})`,
              ],
            },
            ...reqAuditMeta(req),
          });
          res.status(403).json({
            error:
              "Healthcare mode is locked until your organization is on a Healthcare or Enterprise plan. Visit /compliance to review the requirements.",
            code: "phi_gating_failed",
            failedPreconditions: [
              `org.planType must be healthcare or enterprise (is ${planType})`,
            ],
          });
          return;
        }
      }
      if (flippingPhi) {
        const [org] = await db
          .select()
          .from(organizationsTable)
          .where(eq(organizationsTable.id, req.dbClient!.id))
          .limit(1);
        const [profile] = await db
          .select({
            auditLoggingEnabled: complianceProfilesTable.auditLoggingEnabled,
          })
          .from(complianceProfilesTable)
          .where(eq(complianceProfilesTable.organizationId, req.dbClient!.id))
          .limit(1);
        const failed: string[] = [];
        const planType = org?.planType ?? "free";
        if (planType !== "healthcare" && planType !== "enterprise") {
          failed.push(
            `org.planType must be healthcare or enterprise (is ${planType})`,
          );
        }
        if ((org?.baaStatus ?? "not_required") !== "active") {
          failed.push(
            `org.baaStatus must be active (signed BAA) (is ${org?.baaStatus ?? "not_required"})`,
          );
        }
        if ((org?.hipaaDeploymentStatus ?? "not_required") !== "approved") {
          failed.push(
            `org.hipaaDeploymentStatus must be approved (is ${org?.hipaaDeploymentStatus ?? "not_required"})`,
          );
        }
        if (!org || Number(org.mfaRequired) <= 0) {
          failed.push("org.mfaRequired must be true (MFA enforcement enabled)");
        }
        // Mirror /compliance/me's `phiModeUnlocked` rule: audit logging must
        // be enabled at the org-compliance-profile level before PHI mode can
        // be flipped on a project. Default-true; only fails if an admin has
        // explicitly turned it off.
        if (profile && profile.auditLoggingEnabled === false) {
          failed.push("compliance.auditLoggingEnabled must be true");
        }
        if (failed.length > 0) {
          recordAuditEventAsync({
            organizationId: existingProject.organizationId,
            projectId: existingProject.id,
            actorOrganizationId: req.dbClient!.id,
            actorEmail: req.dbClient!.email,
            category: "compliance",
            action: "healthcare_gating_blocked",
            targetType: "project",
            targetId: String(existingProject.id),
            metadata: { failedPreconditions: failed, attempted: "phi_mode_enable" },
            ...reqAuditMeta(req),
          });
          res.status(403).json({
            error:
              "PHI mode is locked until your organization has an approved Healthcare or Enterprise plan, signed BAA, MFA enforcement, audit logging, and approved HIPAA deployment environment. Do not enter real patient data in this MVP.",
            code: "phi_gating_failed",
            failedPreconditions: failed,
          });
          return;
        }
      }
    }

    // Capture the prior phiAllowed value so we can emit accurate
    // phi_mode_enabled / phi_mode_disabled audit events for transitions.
    let priorPhiAllowed: boolean | null = null;
    if (body.data.phiAllowed !== undefined) {
      const [existingProject] = await db
        .select({ phiAllowed: projectsTable.phiAllowed })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.id, params.data.id),
            eq(projectsTable.organizationId, req.dbClient!.id),
          ),
        );
      priorPhiAllowed = existingProject?.phiAllowed ?? null;
    }

    const [row] = await db
      .update(projectsTable)
      .set({
        ...(body.data.title !== undefined && { title: body.data.title }),
        ...(body.data.healthcareMode !== undefined && {
          healthcareMode: body.data.healthcareMode,
        }),
        ...(body.data.phiAllowed !== undefined && {
          phiAllowed: body.data.phiAllowed,
        }),
        ...(body.data.description !== undefined && { description: body.data.description }),
        ...(body.data.summary !== undefined && { summary: body.data.summary }),
        ...(body.data.liveUrl !== undefined && {
          liveUrl: body.data.liveUrl?.trim() ? body.data.liveUrl.trim() : null,
        }),
        ...(body.data.coverImageUrl !== undefined && {
          coverImageUrl: body.data.coverImageUrl?.trim() ? body.data.coverImageUrl.trim() : null,
        }),
        ...(body.data.status !== undefined && { status: body.data.status }),
        ...(body.data.productionUrl !== undefined && {
          productionUrl: body.data.productionUrl?.trim() ? body.data.productionUrl.trim() : null,
        }),
        ...(body.data.operatorEmail !== undefined && {
          operatorEmail: body.data.operatorEmail?.trim() ? body.data.operatorEmail.trim() : null,
        }),
        ...(body.data.githubOwner !== undefined && {
          githubOwner: body.data.githubOwner?.trim() ? body.data.githubOwner.trim() : null,
        }),
        ...(body.data.githubRepo !== undefined && {
          githubRepo: body.data.githubRepo?.trim() ? body.data.githubRepo.trim() : null,
        }),
        ...(body.data.githubDefaultBranch !== undefined && body.data.githubDefaultBranch?.trim() && {
          githubDefaultBranch: body.data.githubDefaultBranch.trim(),
        }),
        ...(body.data.previewUrlTemplate !== undefined && {
          previewUrlTemplate: body.data.previewUrlTemplate?.trim()
            ? body.data.previewUrlTemplate.trim()
            : null,
        }),
        ...(body.data.hostingProvider !== undefined && {
          hostingProvider: body.data.hostingProvider,
        }),
        ...(body.data.hostingProjectId !== undefined && {
          hostingProjectId: body.data.hostingProjectId?.trim()
            ? body.data.hostingProjectId.trim()
            : null,
        }),
        ...(body.data.hostingCredentialsRef !== undefined && {
          hostingCredentialsRef: body.data.hostingCredentialsRef?.trim()
            ? body.data.hostingCredentialsRef.trim()
            : null,
        }),
      })
      .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.organizationId, req.dbClient!.id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const archived = body.data.status === "archived";
    recordAuditEventAsync({
      organizationId: row.organizationId,
      projectId: row.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "project",
      action: archived ? "project_archived" : "project_updated",
      targetType: "project",
      targetId: String(row.id),
      metadata: { fields: Object.keys(body.data) },
      ...reqAuditMeta(req),
    });
    // Phase 8 — emit a dedicated audit row when PHI mode flips so the
    // compliance dashboard can surface the transition without scanning
    // every project_updated event's metadata.
    if (
      body.data.phiAllowed !== undefined &&
      priorPhiAllowed !== null &&
      body.data.phiAllowed !== priorPhiAllowed
    ) {
      recordAuditEventAsync({
        organizationId: row.organizationId,
        projectId: row.id,
        actorOrganizationId: req.dbClient!.id,
        actorEmail: req.dbClient!.email,
        category: "compliance",
        action: body.data.phiAllowed ? "phi_mode_enabled" : "phi_mode_disabled",
        targetType: "project",
        targetId: String(row.id),
        metadata: { from: priorPhiAllowed, to: body.data.phiAllowed },
        ...reqAuditMeta(req),
      });
    }
    if (
      (body.data.githubOwner !== undefined || body.data.githubRepo !== undefined) &&
      row.githubOwner &&
      row.githubRepo
    ) {
      recordAuditEventAsync({
        organizationId: row.organizationId,
        projectId: row.id,
        actorOrganizationId: req.dbClient!.id,
        actorEmail: req.dbClient!.email,
        category: "github",
        action: "github_connected",
        targetType: "project",
        targetId: String(row.id),
        metadata: {
          owner: row.githubOwner,
          repo: row.githubRepo,
          defaultBranch: row.githubDefaultBranch,
        },
        ...reqAuditMeta(req),
      });
    }
    res.json(UpdateProjectResponse.parse(withOwnerRole(row)));
  },
);

async function ensureOwner(projectId: number, clientId: number): Promise<Project | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.organizationId, clientId)));
  return project ?? null;
}

// Admins can act on every project; owners only on theirs. Used by mutations
// where we want admins to manage collaboration on any project.
async function ensureOwnerOrAdmin(
  projectId: number,
  client: { id: number; isAdmin: boolean },
): Promise<Project | null> {
  if (client.isAdmin) {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    return project ?? null;
  }
  return ensureOwner(projectId, client.id);
}

router.get(
  "/projects/:id/members",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = ListProjectMembersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Admins can audit collaboration on any project; otherwise only the owner.
    const project = await ensureOwnerOrAdmin(params.data.id, {
      id: req.dbClient!.id,
      isAdmin: req.dbClient!.isAdmin,
    });
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, project.id),
          ne(projectMembersTable.status, "removed"),
        ),
      )
      .orderBy(desc(projectMembersTable.invitedAt));
    res.json(ListProjectMembersResponse.parse({ data: rows }));
  },
);

router.post(
  "/projects/:id/members",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = InviteProjectMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = InviteProjectMemberBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    // Admins can attach collaborators to any project; otherwise only the
    // project owner may invite.
    const project = await ensureOwnerOrAdmin(params.data.id, {
      id: req.dbClient!.id,
      isAdmin: req.dbClient!.isAdmin,
    });
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const email = body.data.email.trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: "Email required" });
      return;
    }

    const [existingClient] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.primaryEmail, email));

    const [existingMember] = await db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, project.id),
          eq(projectMembersTable.email, email),
        ),
      );

    if (existingClient?.status === "suspended") {
      res
        .status(409)
        .json({ error: "This account is suspended and cannot be invited." });
      return;
    }
    const isClientActive = existingClient?.status === "active";
    let row;
    recordAuditEventAsync({
      organizationId: project.organizationId,
      projectId: project.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "project",
      action: "member_invited",
      targetType: "project_member",
      targetId: email,
      metadata: { email, isExistingClient: Boolean(existingClient) },
      ...reqAuditMeta(req),
    });
    if (existingMember) {
      [row] = await db
        .update(projectMembersTable)
        .set({
          status: isClientActive ? "active" : "pending",
          organizationId: isClientActive
            ? existingClient!.id
            : (existingMember.organizationId ?? null),
          acceptedAt: isClientActive ? new Date() : existingMember.acceptedAt,
        })
        .where(eq(projectMembersTable.id, existingMember.id))
        .returning();
    } else {
      [row] = await db
        .insert(projectMembersTable)
        .values({
          projectId: project.id,
          email,
          organizationId: isClientActive ? existingClient!.id : null,
          role: "collaborator",
          status: isClientActive ? "active" : "pending",
          acceptedAt: isClientActive ? new Date() : undefined,
        })
        .returning();
    }

    // With Clerk, account creation/invitation is handled by Clerk itself.
    // We just notify the invitee — when they sign in via Clerk, the
    // membership row gets linked by email match in activatePendingMemberships.
    try {
      await sendProjectInviteEmail({
        to: email,
        projectTitle: project.title,
        invitedByEmail: req.dbClient!.email,
        alreadyHasAccount: Boolean(existingClient && existingClient.status === "active"),
        inviteToken: null,
      });
    } catch (err) {
      logger.warn({ err }, "Failed to send project invite email");
    }

    res.status(201).json(row);
  },
);

router.delete(
  "/projects/:id/members/:memberId",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = RemoveProjectMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Admins can remove collaborators on any project for incident response.
    const project = await ensureOwnerOrAdmin(params.data.id, {
      id: req.dbClient!.id,
      isAdmin: req.dbClient!.isAdmin,
    });
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const result = await db
      .update(projectMembersTable)
      .set({ status: "removed" })
      .where(
        and(
          eq(projectMembersTable.id, params.data.memberId),
          eq(projectMembersTable.projectId, project.id),
        ),
      )
      .returning({ id: projectMembersTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    recordAuditEventAsync({
      organizationId: project.organizationId,
      projectId: project.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "project",
      action: "member_removed",
      targetType: "project_member",
      targetId: String(params.data.memberId),
      ...reqAuditMeta(req),
    });
    res.status(204).end();
  },
);

// ─── Comments ──────────────────────────────────────────────────────────────

router.get(
  "/projects/:id/comments",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = ListProjectCommentsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select({
        id: projectCommentsTable.id,
        projectId: projectCommentsTable.projectId,
        clientId: projectCommentsTable.organizationId,
        clientEmail: organizationsTable.primaryEmail,
        body: projectCommentsTable.body,
        createdAt: projectCommentsTable.createdAt,
      })
      .from(projectCommentsTable)
      .leftJoin(organizationsTable, eq(organizationsTable.id, projectCommentsTable.organizationId))
      .where(eq(projectCommentsTable.projectId, project.id))
      .orderBy(asc(projectCommentsTable.createdAt));
    res.json(
      ListProjectCommentsResponse.parse({
        data: rows.map((r) => ({ ...r, clientEmail: r.clientEmail ?? "" })),
      }),
    );
  },
);

router.post(
  "/projects/:id/comments",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = AddProjectCommentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = AddProjectCommentBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const trimmed = body.data.body.trim();
    if (!trimmed) {
      res.status(400).json({ error: "Comment cannot be empty" });
      return;
    }
    const [row] = await db
      .insert(projectCommentsTable)
      .values({
        projectId: project.id,
        organizationId: req.dbClient!.id,
        body: trimmed,
      })
      .returning();
    res.status(201).json({
      id: row.id,
      projectId: row.projectId,
      clientId: row.organizationId,
      clientEmail: req.dbClient!.email,
      body: row.body,
      createdAt: row.createdAt,
    });
  },
);

router.delete(
  "/projects/:id/comments/:commentId",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = DeleteProjectCommentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [comment] = await db
      .select()
      .from(projectCommentsTable)
      .where(
        and(
          eq(projectCommentsTable.id, params.data.commentId),
          eq(projectCommentsTable.projectId, project.id),
        ),
      );
    if (!comment) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const isAuthor = comment.organizationId === req.dbClient!.id;
    const isOwner = project.viewerRole === "owner";
    if (!isAuthor && !isOwner) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(projectCommentsTable).where(eq(projectCommentsTable.id, comment.id));
    res.status(204).end();
  },
);

// ─── Project-scoped prompt console ─────────────────────────────────────────

router.get(
  "/projects/:id/prompts",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = ListProjectPromptsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select()
      .from(promptSessionsTable)
      .where(eq(promptSessionsTable.projectId, project.id))
      .orderBy(desc(promptSessionsTable.createdAt))
      .limit(100);
    res.json(ListProjectPromptsResponse.parse({ data: rows, total: rows.length }));
  },
);

router.post(
  "/projects/:id/prompts",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = SubmitProjectPromptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SubmitProjectPromptBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const client = req.dbClient!;
    if (client.tokenBalance <= 0) {
      res.status(402).json({
        error: "Insufficient tokens. Please purchase a bundle.",
        tokenBalance: client.tokenBalance,
      });
      return;
    }

    let result;
    try {
      result = await runClaudePrompt(body.data.prompt);
    } catch (err) {
      req.log.error({ err }, "Claude prompt failed");
      res.status(502).json({ error: "AI request failed. No tokens were charged." });
      return;
    }

    const tokensUsed = computeChargedTokens(result.totalTokens, client.tokenBalance);
    await db
      .update(organizationsTable)
      .set({
        tokenBalance: sql`GREATEST(${organizationsTable.tokenBalance} - ${tokensUsed}, 0)`,
        totalTokensUsed: sql`${organizationsTable.totalTokensUsed} + ${tokensUsed}`,
      })
      .where(eq(organizationsTable.id, client.id));

    const [session] = await db
      .insert(promptSessionsTable)
      .values({
        organizationId: client.id,
        projectId: project.id,
        prompt: body.data.prompt,
        output: result.output,
        tokensUsed,
        model: result.model,
      })
      .returning();

    recordAuditEventAsync({
      organizationId: project.organizationId,
      projectId: project.id,
      actorOrganizationId: client.id,
      actorEmail: client.email,
      category: "ai",
      action: "ai_prompt_submitted",
      targetType: "prompt_session",
      targetId: String(session.id),
      metadata: { tokensUsed, model: result.model },
      ...reqAuditMeta(req),
    });
    res.json(SubmitProjectPromptResponse.parse(session));
  },
);

// ─── Project files ─────────────────────────────────────────────────────────

router.get(
  "/projects/:id/files",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = ListProjectFilesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select({
        id: projectFilesTable.id,
        projectId: projectFilesTable.projectId,
        uploadedByOrganizationId: projectFilesTable.uploadedByOrganizationId,
        uploadedByEmail: organizationsTable.primaryEmail,
        name: projectFilesTable.name,
        contentType: projectFilesTable.contentType,
        sizeBytes: projectFilesTable.sizeBytes,
        objectPath: projectFilesTable.objectPath,
        createdAt: projectFilesTable.createdAt,
      })
      .from(projectFilesTable)
      .leftJoin(organizationsTable, eq(organizationsTable.id, projectFilesTable.uploadedByOrganizationId))
      .where(eq(projectFilesTable.projectId, project.id))
      .orderBy(desc(projectFilesTable.createdAt));
    res.json(
      ListProjectFilesResponse.parse({
        data: rows.map((r) => ({ ...r, uploadedByEmail: r.uploadedByEmail ?? "" })),
      }),
    );
  },
);

router.post(
  "/projects/:id/files",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = AddProjectFileParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = AddProjectFileBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!body.data.objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "Invalid object path" });
      return;
    }
    const [row] = await db
      .insert(projectFilesTable)
      .values({
        projectId: project.id,
        uploadedByOrganizationId: req.dbClient!.id,
        name: body.data.name,
        contentType: body.data.contentType,
        sizeBytes: body.data.sizeBytes,
        objectPath: body.data.objectPath,
      })
      .returning();
    recordAuditEventAsync({
      organizationId: project.organizationId,
      projectId: project.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "file",
      action: "file_created",
      targetType: "project_file",
      targetId: String(row.id),
      metadata: { name: row.name, sizeBytes: row.sizeBytes },
      ...reqAuditMeta(req),
    });
    res.status(201).json({
      id: row.id,
      projectId: row.projectId,
      uploadedByOrganizationId: row.uploadedByOrganizationId,
      uploadedByEmail: req.dbClient!.email,
      name: row.name,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      objectPath: row.objectPath,
      createdAt: row.createdAt,
    });
  },
);

router.delete(
  "/projects/:id/files/:fileId",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = DeleteProjectFileParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [file] = await db
      .select()
      .from(projectFilesTable)
      .where(
        and(
          eq(projectFilesTable.id, params.data.fileId),
          eq(projectFilesTable.projectId, project.id),
        ),
      );
    if (!file) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const isUploader = file.uploadedByOrganizationId === req.dbClient!.id;
    const isOwner = project.viewerRole === "owner";
    if (!isUploader && !isOwner) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(projectFilesTable).where(eq(projectFilesTable.id, file.id));
    recordAuditEventAsync({
      organizationId: project.organizationId,
      projectId: project.id,
      actorOrganizationId: req.dbClient!.id,
      actorEmail: req.dbClient!.email,
      category: "file",
      action: "file_deleted",
      targetType: "project_file",
      targetId: String(file.id),
      metadata: { name: file.name },
      ...reqAuditMeta(req),
    });
    res.status(204).end();
  },
);

// ─── Workspace (Phase 3): file content read/write/rename + GitHub commit ──
//
// These endpoints back the in-browser workspace at
// /projects/:id/workspace. They reuse the existing project_files table —
// `name` doubles as the relative path (e.g. "src/foo.tsx"), `objectPath`
// points at the GCS object holding the bytes. Tenancy is enforced via
// getViewableProject on every call.

// Workspace edits live on a per-project workspace branch (NOT the default
// branch). On first push we branch off the default; subsequent pushes
// fast-forward the workspace branch with conflict detection. Change-request
// flows continue to use their own feature branches via the existing pipeline.
function activeBranchFor(project: {
  id: number;
  githubDefaultBranch: string;
}): string {
  return `machinedog/workspace-${project.id}`;
}

// Resolve the base sha to push from: prefer the current tip of the workspace
// branch (so we fast-forward); fall back to the default branch tip on first
// push (when the workspace branch does not yet exist).
async function resolveWorkspaceBaseSha(
  projectCfg: {
    githubOwner: string;
    githubRepo: string;
    githubDefaultBranch: string;
  },
  workspaceBranch: string,
): Promise<{ baseSha: string; branchExists: boolean }> {
  try {
    const sha = await resolveBranchSha(projectCfg, workspaceBranch);
    return { baseSha: sha, branchExists: true };
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) {
      const sha = await resolveBranchSha(projectCfg);
      return { baseSha: sha, branchExists: false };
    }
    throw err;
  }
}

async function readFileText(objectPath: string): Promise<string> {
  const storage = new ObjectStorageService();
  const file = await storage.getObjectEntityFile(objectPath);
  const [buf] = await file.download();
  return buf.toString("utf8");
}

// GET /projects/:id/files/:fileId/content — returns the raw text body for
// the given file. JSON envelope to keep error handling consistent with the
// rest of the API.
router.get(
  "/projects/:id/files/:fileId/content",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const fileId = Number(req.params.fileId);
    if (!Number.isFinite(projectId) || !Number.isFinite(fileId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [file] = await db
      .select()
      .from(projectFilesTable)
      .where(
        and(
          eq(projectFilesTable.id, fileId),
          eq(projectFilesTable.projectId, projectId),
        ),
      );
    if (!file) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    try {
      const content = await readFileText(file.objectPath);
      res.json({
        id: file.id,
        name: file.name,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        content,
      });
    } catch (err) {
      logger.error({ err, fileId }, "Failed to read file content");
      res.status(500).json({ error: "Failed to read file" });
    }
  },
);

// PUT /projects/:id/files/:fileId/content — overwrite a file's text body.
// Per Phase 3 spec: writes to project_files AND best-effort commits the
// single file to the project's active branch on GitHub via
// pushBranchWithFiles. The HTTP response always reports both: the DB
// write is authoritative; GitHub status is conveyed via `commit` /
// `commitWarning`.
router.put(
  "/projects/:id/files/:fileId/content",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const fileId = Number(req.params.fileId);
    const content = typeof req.body?.content === "string" ? req.body.content : null;
    const message =
      typeof req.body?.message === "string" && req.body.message.trim()
        ? req.body.message.trim()
        : "Workspace save";
    if (!Number.isFinite(projectId) || !Number.isFinite(fileId) || content == null) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [file] = await db
      .select()
      .from(projectFilesTable)
      .where(
        and(
          eq(projectFilesTable.id, fileId),
          eq(projectFilesTable.projectId, projectId),
        ),
      );
    if (!file) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Phase 8 — PHI guard on workspace file saves. Projects without
    // phiAllowed get scanned; on hit we never persist the offending body
    // and write a `phi_blocked` audit row whose metadata only contains
    // the matched rule labels.
    if (!project.phiAllowed) {
      const phi = scanForPhi(content);
      if (phi.blocked) {
        recordAuditEventAsync({
          organizationId: project.organizationId,
          projectId: project.id,
          actorOrganizationId: req.dbClient!.id,
          actorEmail: req.dbClient!.email,
          category: "phi",
          action: "phi_blocked",
          targetType: "project_file",
          targetId: String(file.id),
          metadata: {
            stage: "file_put",
            rules: phi.hits.map((h) => h.rule),
            contentLength: content.length,
          },
          ...reqAuditMeta(req),
        });
        res.status(400).json({
          error:
            "This file body looks like protected health information (PHI). Do not enter real patient data in this MVP. Saving is blocked unless your project has BAA-backed PHI handling enabled.",
          code: "phi_blocked",
          rules: phi.hits.map((h) => h.rule),
          labels: phi.hits.map((h) => h.label),
        });
        return;
      }
    }
    try {
      const storage = new ObjectStorageService();
      const objectPath = await storage.uploadInlineObject({
        contents: content,
        contentType: file.contentType || "text/plain",
      });
      const sizeBytes = Buffer.byteLength(content, "utf8");
      const [updated] = await db
        .update(projectFilesTable)
        .set({ objectPath, sizeBytes })
        .where(eq(projectFilesTable.id, file.id))
        .returning();

      // Best-effort GitHub commit. We never fail the save if GitHub is
      // unconfigured or temporarily unreachable — the response surfaces
      // the warning so the UI can prompt the user to retry / configure.
      let commit: { branch: string; commitSha: string } | null = null;
      let commitWarning: string | null = null;
      // Callers that intend to follow up with /files/commit (e.g. the
      // workspace's Commit/Push action saving dirty buffers first) can
      // pass ?commit=false to skip the per-file GitHub push and avoid
      // the noisy double-commit pattern.
      const skipCommit = req.query.commit === "false";
      if (!skipCommit && project.githubOwner && project.githubRepo) {
        try {
          const projectCfg = {
            githubOwner: project.githubOwner,
            githubRepo: project.githubRepo,
            githubDefaultBranch: project.githubDefaultBranch,
          };
          const branch = activeBranchFor(project);
          const { baseSha, branchExists } = await resolveWorkspaceBaseSha(
            projectCfg,
            branch,
          );
          const pushed = await pushBranchWithFiles(
            projectCfg,
            branch,
            baseSha,
            [{ path: updated.name, contents: content }],
            `[Machinedog workspace] ${message}: ${updated.name}`,
            { force: branchExists ? false : true },
          );
          commit = { branch: pushed.branch, commitSha: pushed.commitSha };
        } catch (err) {
          if (err instanceof GitHubConflictError) {
            commitWarning = `${err.message} (expected ${err.expectedSha.slice(0, 7)}, remote ${err.actualSha.slice(0, 7)})`;
          } else {
            commitWarning =
              err instanceof Error ? err.message : "GitHub commit failed";
          }
          logger.warn(
            { err, fileId, projectId },
            "Workspace save: GitHub commit skipped",
          );
        }
      } else {
        commitWarning = "GitHub repo not configured on this project.";
      }

      recordAuditEventAsync({
        organizationId: project.organizationId,
        projectId: project.id,
        actorOrganizationId: req.dbClient!.id,
        actorEmail: req.dbClient!.email,
        category: "file",
        action: "file_updated",
        targetType: "project_file",
        targetId: String(updated.id),
        metadata: {
          name: updated.name,
          sizeBytes: updated.sizeBytes,
          committed: !!commit,
        },
        ...reqAuditMeta(req),
      });
      res.json({
        id: updated.id,
        name: updated.name,
        sizeBytes: updated.sizeBytes,
        objectPath: updated.objectPath,
        commit,
        commitWarning,
      });
    } catch (err) {
      logger.error({ err, fileId }, "Failed to write file content");
      res.status(500).json({ error: "Failed to write file" });
    }
  },
);

// POST /projects/:id/files/inline — create a new file (or folder marker)
// with inline content. Body: { name, content?, contentType? }. Folders are
// represented as a `.gitkeep` row (path = "<folder>/.gitkeep"). 409 if a
// row at that path already exists for this project.
router.post(
  "/projects/:id/files/inline",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    const contentType =
      typeof req.body?.contentType === "string" && req.body.contentType.trim()
        ? req.body.contentType.trim()
        : "text/plain";
    if (!Number.isFinite(projectId) || !name || name.length > 500) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    if (name.includes("..") || name.startsWith("/")) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [existing] = await db
      .select()
      .from(projectFilesTable)
      .where(
        and(
          eq(projectFilesTable.projectId, projectId),
          eq(projectFilesTable.name, name),
        ),
      );
    if (existing) {
      res.status(409).json({ error: "A file at that path already exists." });
      return;
    }
    if (!project.phiAllowed && content) {
      const phi = scanForPhi(content);
      if (phi.blocked) {
        recordAuditEventAsync({
          organizationId: project.organizationId,
          projectId: project.id,
          actorOrganizationId: req.dbClient!.id,
          actorEmail: req.dbClient!.email,
          category: "phi",
          action: "phi_blocked",
          targetType: "project_file",
          targetId: name,
          metadata: {
            stage: "file_inline_create",
            rules: phi.hits.map((h) => h.rule),
            contentLength: content.length,
          },
          ...reqAuditMeta(req),
        });
        res.status(400).json({
          error:
            "This file body looks like protected health information (PHI). Do not enter real patient data in this MVP. Saving is blocked unless your project has BAA-backed PHI handling enabled.",
          code: "phi_blocked",
          rules: phi.hits.map((h) => h.rule),
          labels: phi.hits.map((h) => h.label),
        });
        return;
      }
    }
    try {
      const storage = new ObjectStorageService();
      const objectPath = await storage.uploadInlineObject({ contents: content, contentType });
      const [row] = await db
        .insert(projectFilesTable)
        .values({
          projectId,
          uploadedByOrganizationId: req.dbClient!.id,
          name,
          contentType,
          sizeBytes: Buffer.byteLength(content, "utf8"),
          objectPath,
        })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      logger.error({ err }, "Failed to create inline file");
      res.status(500).json({ error: "Failed to create file" });
    }
  },
);

// POST /projects/:id/files/folder — folder operations (delete | rename).
// Body: { op: "delete", path } | { op: "rename", path, newPath }.
// Acts on every file whose name starts with `${path}/` (DB only — the
// next /files/commit will push the resulting tree to GitHub, including
// deletions).
router.post(
  "/projects/:id/files/folder",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const op = String(req.body?.op || "");
    const path = String(req.body?.path || "").replace(/\/+$/, "");
    if (
      !Number.isFinite(projectId) ||
      !path ||
      path.includes("..") ||
      path.startsWith("/")
    ) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const prefix = `${path}/`;
    const rows = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));
    const inFolder = rows.filter(
      (r) => r.name === `${path}/.gitkeep` || r.name.startsWith(prefix),
    );
    if (op === "delete") {
      if (!inFolder.length) {
        res.status(404).json({ error: "Folder is empty or does not exist" });
        return;
      }
      await db
        .delete(projectFilesTable)
        .where(
          and(
            eq(projectFilesTable.projectId, projectId),
            inArray(
              projectFilesTable.id,
              inFolder.map((r) => r.id),
            ),
          ),
        );
      res.json({ ok: true, deleted: inFolder.length });
      return;
    }
    if (op === "rename") {
      const newPath = String(req.body?.newPath || "").replace(/\/+$/, "");
      if (!newPath || newPath.includes("..") || newPath.startsWith("/")) {
        res.status(400).json({ error: "Invalid newPath" });
        return;
      }
      if (!inFolder.length) {
        res.status(404).json({ error: "Folder is empty or does not exist" });
        return;
      }
      const renames = inFolder.map((r) => ({
        id: r.id,
        newName: r.name === `${path}/.gitkeep`
          ? `${newPath}/.gitkeep`
          : `${newPath}/${r.name.slice(prefix.length)}`,
      }));
      // Conflict check: ensure none of the new paths already exist.
      const taken = new Set(
        rows.filter((r) => !inFolder.find((f) => f.id === r.id)).map((r) => r.name),
      );
      const collision = renames.find((r) => taken.has(r.newName));
      if (collision) {
        res.status(409).json({
          error: `A file already exists at ${collision.newName}`,
        });
        return;
      }
      for (const r of renames) {
        await db
          .update(projectFilesTable)
          .set({ name: r.newName })
          .where(eq(projectFilesTable.id, r.id));
      }
      res.json({ ok: true, renamed: renames.length });
      return;
    }
    res.status(400).json({ error: "Unknown op" });
  },
);

// PATCH /projects/:id/files/:fileId — rename (update `name`).
router.patch(
  "/projects/:id/files/:fileId",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const fileId = Number(req.params.fileId);
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!Number.isFinite(projectId) || !Number.isFinite(fileId) || !name) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    if (name.includes("..") || name.startsWith("/") || name.length > 500) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [file] = await db
      .select()
      .from(projectFilesTable)
      .where(
        and(
          eq(projectFilesTable.id, fileId),
          eq(projectFilesTable.projectId, projectId),
        ),
      );
    if (!file) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (name === file.name) {
      res.json(file);
      return;
    }
    const [collide] = await db
      .select({ id: projectFilesTable.id })
      .from(projectFilesTable)
      .where(
        and(
          eq(projectFilesTable.projectId, projectId),
          eq(projectFilesTable.name, name),
        ),
      );
    if (collide) {
      res.status(409).json({ error: "A file at that path already exists." });
      return;
    }
    const [updated] = await db
      .update(projectFilesTable)
      .set({ name })
      .where(eq(projectFilesTable.id, file.id))
      .returning();
    res.json(updated);
  },
);

// POST /projects/:id/files/commit — push the project's current file tree
// (or a subset of fileIds) to a workspace branch on GitHub via the
// existing pushBranchWithFiles helper. Returns the branch + commit sha,
// or a structured error if the project is not GitHub-configured.
router.post(
  "/projects/:id/files/commit",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const message =
      typeof req.body?.message === "string" && req.body.message.trim()
        ? req.body.message.trim()
        : "Workspace edit";
    const fileIds: number[] = Array.isArray(req.body?.fileIds)
      ? req.body.fileIds.filter((n: unknown) => Number.isFinite(n)).map(Number)
      : [];
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!project.githubOwner || !project.githubRepo) {
      res.status(400).json({
        error:
          "GitHub repo not configured on this project. Configure githubOwner/githubRepo to commit.",
        code: "github_not_configured",
      });
      return;
    }

    const allRows = await db
      .select()
      .from(projectFilesTable)
      .where(eq(projectFilesTable.projectId, projectId));
    const selected = fileIds.length
      ? allRows.filter((r) => fileIds.includes(r.id))
      : allRows;
    // Skip .gitkeep markers from being pushed as content; they only
    // exist to keep empty folders visible in the workspace UI.
    const pushable = selected.filter((r) => !r.name.endsWith("/.gitkeep"));

    let pushFiles;
    try {
      pushFiles = await Promise.all(
        pushable.map(async (row) => ({
          path: row.name,
          contents: await readFileText(row.objectPath),
        })),
      );
    } catch (err) {
      logger.error({ err, projectId }, "Failed to assemble files for commit");
      res.status(500).json({ error: "Failed to read files for commit" });
      return;
    }

    const projectCfg = {
      githubOwner: project.githubOwner,
      githubRepo: project.githubRepo,
      githubDefaultBranch: project.githubDefaultBranch,
    };
    const branch = activeBranchFor(project);
    try {
      const { baseSha, branchExists } = await resolveWorkspaceBaseSha(
        projectCfg,
        branch,
      );

      // Compute deletions: any path on the workspace branch that no longer
      // exists in project_files. Only run when committing the full tree
      // (no fileIds filter); partial commits explicitly never delete.
      let deletions: string[] = [];
      if (branchExists && fileIds.length === 0) {
        try {
          const remote = await listBranchTreePaths(projectCfg, branch);
          const dbPaths = new Set(allRows.map((r) => r.name));
          deletions = remote.paths.filter((p) => !dbPaths.has(p));
        } catch (err) {
          logger.warn(
            { err, projectId, branch },
            "Workspace commit: failed to compute deletions, skipping",
          );
        }
      }

      if (pushFiles.length === 0 && deletions.length === 0) {
        res.status(400).json({ error: "No files to commit" });
        return;
      }

      const commit = await pushBranchWithFiles(
        projectCfg,
        branch,
        baseSha,
        pushFiles,
        `[Machinedog workspace] ${message}`,
        { force: branchExists ? false : true, deletions },
      );
      recordAuditEventAsync({
        organizationId: project.organizationId,
        projectId: project.id,
        actorOrganizationId: req.dbClient!.id,
        actorEmail: req.dbClient!.email,
        category: "github",
        action: "repo_pushed",
        targetType: "project",
        targetId: String(project.id),
        metadata: {
          branch: commit.branch,
          commitSha: commit.commitSha,
          fileCount: pushFiles.length,
          deletionCount: deletions.length,
        },
        ...reqAuditMeta(req),
      });
      res.json({
        ok: true,
        branch: commit.branch,
        commitSha: commit.commitSha,
        fileCount: pushFiles.length,
        deletionCount: deletions.length,
      });
    } catch (err) {
      if (err instanceof GitHubNotConfiguredError) {
        res.status(400).json({
          error: err.message,
          code: "github_not_authorized",
        });
        return;
      }
      if (err instanceof GitHubConflictError) {
        res.status(409).json({
          error: err.message,
          code: "github_branch_conflict",
          branch: err.branch,
          expectedSha: err.expectedSha,
          actualSha: err.actualSha,
        });
        return;
      }
      const status =
        err instanceof GitHubApiError ? err.status : 500;
      const message =
        err instanceof Error ? err.message : "GitHub commit failed";
      logger.error({ err, projectId }, "Workspace commit failed");
      res
        .status(status >= 400 && status < 600 ? status : 500)
        .json({ error: message, code: "github_commit_failed" });
    }
  },
);

// GET /projects/:id/events — recent change_request_events across all of
// the project's change requests, newest first. Powers the workspace logs
// pane (Phase 3).
router.get(
  "/projects/:id/events",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 100, 1),
      500,
    );
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const crIds = (
      await db
        .select({ id: changeRequestsTable.id })
        .from(changeRequestsTable)
        .where(eq(changeRequestsTable.projectId, projectId))
    ).map((r) => r.id);
    if (crIds.length === 0) {
      res.json({ data: [] });
      return;
    }
    const rows = await db
      .select({
        id: changeRequestEventsTable.id,
        changeRequestId: changeRequestEventsTable.changeRequestId,
        changeRequestTitle: changeRequestsTable.title,
        kind: changeRequestEventsTable.kind,
        message: changeRequestEventsTable.message,
        metadata: changeRequestEventsTable.metadata,
        createdAt: changeRequestEventsTable.createdAt,
      })
      .from(changeRequestEventsTable)
      .leftJoin(
        changeRequestsTable,
        eq(changeRequestsTable.id, changeRequestEventsTable.changeRequestId),
      )
      .where(inArray(changeRequestEventsTable.changeRequestId, crIds))
      .orderBy(desc(changeRequestEventsTable.createdAt))
      .limit(limit);
    // Aliased shape consumed by the workspace logs panel:
    //   eventType  ← kind
    //   payload    ← { message, ...metadata }
    const data = rows.map((r) => ({
      id: r.id,
      changeRequestId: r.changeRequestId,
      changeRequestTitle: r.changeRequestTitle ?? null,
      eventType: r.kind,
      kind: r.kind,
      message: r.message,
      payload: {
        message: r.message,
        ...(r.metadata && typeof r.metadata === "object" ? r.metadata : {}),
      },
      createdAt: r.createdAt,
    }));
    res.json({ data });
  },
);

// GET /projects/:id/preview-url — returns the most recent non-null
// previewUrl from the project's change_requests, falling back to the
// project's liveUrl. Used by the workspace preview pane.
router.get(
  "/projects/:id/preview-url",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [latestCr] = await db
      .select({
        id: changeRequestsTable.id,
        previewUrl: changeRequestsTable.previewUrl,
      })
      .from(changeRequestsTable)
      .where(
        and(
          eq(changeRequestsTable.projectId, projectId),
          isNotNull(changeRequestsTable.previewUrl),
        ),
      )
      .orderBy(desc(changeRequestsTable.updatedAt))
      .limit(1);
    res.json({
      previewUrl: latestCr?.previewUrl ?? null,
      liveUrl: project.liveUrl ?? null,
      changeRequestId: latestCr?.id ?? null,
    });
  },
);

// GET /projects/:id/files/pull — fetch latest HEAD sha of the default
// branch. Read-only "Pull" indicator for the workspace top bar so the
// user knows the workspace branch is behind.
router.get(
  "/projects/:id/files/pull-status",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!project.githubOwner || !project.githubRepo) {
      res.json({ configured: false });
      return;
    }
    try {
      const sha = await resolveBranchSha({
        githubOwner: project.githubOwner,
        githubRepo: project.githubRepo,
        githubDefaultBranch: project.githubDefaultBranch,
      });
      res.json({
        configured: true,
        defaultBranch: project.githubDefaultBranch,
        sha,
      });
    } catch (err) {
      const status = err instanceof GitHubApiError ? err.status : 500;
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: err instanceof Error ? err.message : "GitHub pull failed",
      });
    }
  },
);

// POST /projects/:id/files/pull — fetch the default branch tree from
// GitHub and sync it into project_files: upserts text blobs (≤ 1 MiB)
// by name. Existing rows whose contents match are left alone; missing
// rows are created. Files removed from the branch are NOT deleted from
// project_files (preserves uploads + lets the user keep workspace-only
// drafts) — Phase 4 will surface a deletions-detected diff banner.
router.post(
  "/projects/:id/files/pull",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const project = await getViewableProject(
      projectId,
      req.dbClient!.id,
      req.dbClient!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!project.githubOwner || !project.githubRepo) {
      res.status(400).json({
        error:
          "GitHub repo not configured on this project. Configure githubOwner/githubRepo to pull.",
        code: "github_not_configured",
      });
      return;
    }
    try {
      const projectCfg = {
        githubOwner: project.githubOwner,
        githubRepo: project.githubRepo,
        githubDefaultBranch: project.githubDefaultBranch,
      };
      const result = await fetchBranchTreeFiles(projectCfg);
      const existing = await db
        .select()
        .from(projectFilesTable)
        .where(eq(projectFilesTable.projectId, projectId));
      const byName = new Map<string, typeof existing[number]>(
        existing.map((f) => [f.name, f]),
      );
      const storage = new ObjectStorageService();
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      for (const f of result.files) {
        const prior = byName.get(f.path);
        if (prior) {
          let priorContent = "";
          try {
            priorContent = await readFileText(prior.objectPath);
          } catch {
            priorContent = "";
          }
          if (priorContent === f.contents) {
            unchanged += 1;
            continue;
          }
          const objectPath = await storage.uploadInlineObject({
            contents: f.contents,
            contentType: prior.contentType || "text/plain",
          });
          await db
            .update(projectFilesTable)
            .set({
              objectPath,
              sizeBytes: Buffer.byteLength(f.contents, "utf8"),
            })
            .where(eq(projectFilesTable.id, prior.id));
          updated += 1;
        } else {
          const objectPath = await storage.uploadInlineObject({
            contents: f.contents,
            contentType: "text/plain",
          });
          await db.insert(projectFilesTable).values({
            projectId,
            uploadedByOrganizationId: req.dbClient!.id,
            name: f.path,
            contentType: "text/plain",
            sizeBytes: Buffer.byteLength(f.contents, "utf8"),
            objectPath,
          });
          created += 1;
        }
      }
      recordAuditEventAsync({
        organizationId: project.organizationId,
        projectId: project.id,
        actorOrganizationId: req.dbClient!.id,
        actorEmail: req.dbClient!.email,
        category: "github",
        action: "repo_pulled",
        targetType: "project",
        targetId: String(project.id),
        metadata: {
          branch: result.branch,
          sha: result.commitSha,
          fetched: result.files.length,
          created,
          updated,
          unchanged,
        },
        ...reqAuditMeta(req),
      });
      res.json({
        ok: true,
        branch: result.branch,
        sha: result.commitSha,
        files: { fetched: result.files.length, created, updated, unchanged },
      });
    } catch (err) {
      if (err instanceof GitHubNotConfiguredError) {
        res.status(400).json({
          error: err.message,
          code: "github_not_configured",
        });
        return;
      }
      const status = err instanceof GitHubApiError ? err.status : 500;
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: err instanceof Error ? err.message : "GitHub pull failed",
      });
    }
  },
);

// Used by auth middleware to mark all pending project invites for this email as active.
export async function activatePendingMemberships(
  clientId: number,
  email: string,
): Promise<void> {
  const lowered = email.toLowerCase();
  await db
    .update(projectMembersTable)
    .set({ organizationId: clientId, status: "active", acceptedAt: new Date() })
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "pending"),
      ),
    );

  // Also link any rows that were created before organizationId was known
  await db
    .update(projectMembersTable)
    .set({ organizationId: clientId })
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "active"),
        isNotNull(projectMembersTable.email),
      ),
    );
}

export default router;
