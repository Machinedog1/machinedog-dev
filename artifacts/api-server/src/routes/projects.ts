import { Router, type IRouter } from "express";
import { eq, desc, asc, and, inArray, or, ne, isNotNull, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectMembersTable,
  projectCommentsTable,
  projectFilesTable,
  promptSessionsTable,
  clientsTable,
  changeRequestsTable,
  changeRequestEventsTable,
  templatesTable,
  type Project,
} from "@workspace/db";
import { resolveOrganizationForClient } from "@workspace/db";
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
import { generateSecureToken } from "../lib/passwords";
import { ObjectStorageService } from "../lib/objectStorage";

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

  if (project.clientId === clientId) {
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
          eq(projectMembersTable.clientId, clientId),
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
      .where(eq(projectsTable.clientId, client.id))
      .orderBy(desc(projectsTable.updatedAt));

    const memberships = await db
      .select({ projectId: projectMembersTable.projectId })
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.status, "active"),
          or(
            eq(projectMembersTable.clientId, client.id),
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
                ne(projectsTable.clientId, client.id),
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
      const resolved = await resolveOrganizationForClient(req.dbClient!.id);
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
        clientId: req.dbClient!.id,
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
          clientId: req.dbClient!.id,
          title: data.title,
          description: data.description,
          summary: data.summary ?? "",
          liveUrl: data.liveUrl?.trim() || null,
          coverImageUrl: data.coverImageUrl?.trim() || null,
          status: "draft",
          projectType: template?.projectType ?? "web_app",
          framework: template?.framework ?? "react",
          templateSlug: template?.slug ?? null,
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
              uploadedByClientId: req.dbClient!.id,
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
        const resolved = await resolveOrganizationForClient(req.dbClient!.id);
        if (resolved) {
          await deductTokens(
            resolved.organization.id,
            template.tokenCost,
            "template",
            {
              userId: req.dbClient!.id,
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
            actorClientId: null,
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
    const [row] = await db
      .update(projectsTable)
      .set({
        ...(body.data.title !== undefined && { title: body.data.title }),
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
      })
      .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.clientId, req.dbClient!.id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(UpdateProjectResponse.parse(withOwnerRole(row)));
  },
);

async function ensureOwner(projectId: number, clientId: number): Promise<Project | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.clientId, clientId)));
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
      .from(clientsTable)
      .where(eq(clientsTable.email, email));

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
    const isClientActive =
      existingClient?.status === "active" && !!existingClient.passwordHash;
    let row;
    if (existingMember) {
      [row] = await db
        .update(projectMembersTable)
        .set({
          status: isClientActive ? "active" : "pending",
          clientId: isClientActive
            ? existingClient!.id
            : (existingMember.clientId ?? null),
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
          clientId: isClientActive ? existingClient!.id : null,
          role: "collaborator",
          status: isClientActive ? "active" : "pending",
          invitedByClientId: req.dbClient!.id,
          acceptedAt: isClientActive ? new Date() : undefined,
        })
        .returning();
    }

    // Make sure a client row exists for this email and, when the invitee
    // can't sign in yet, mint a fresh invite token so the email can take
    // them straight to /accept-invite. Active accounts already have a
    // password and don't need a token.
    let inviteToken: string | null = null;
    const needsToken =
      !existingClient || existingClient.status !== "active" || !existingClient.passwordHash;

    if (!existingClient) {
      const newToken = generateSecureToken(32);
      const expiresAt = new Date(Date.now() + PROJECT_INVITE_TTL_MS);
      await db
        .insert(clientsTable)
        .values({
          userId: `pending:${email}`,
          email,
          status: "invited",
          inviteToken: newToken,
          inviteTokenExpiresAt: expiresAt,
        })
        .onConflictDoUpdate({
          target: clientsTable.email,
          set: { inviteToken: newToken, inviteTokenExpiresAt: expiresAt },
        });
      inviteToken = newToken;
    } else if (needsToken) {
      const newToken = generateSecureToken(32);
      const expiresAt = new Date(Date.now() + PROJECT_INVITE_TTL_MS);
      await db
        .update(clientsTable)
        .set({ inviteToken: newToken, inviteTokenExpiresAt: expiresAt })
        .where(eq(clientsTable.id, existingClient.id));
      inviteToken = newToken;
    }

    try {
      await sendProjectInviteEmail({
        to: email,
        projectTitle: project.title,
        invitedByEmail: req.dbClient!.email,
        alreadyHasAccount: Boolean(existingClient && existingClient.status === "active"),
        inviteToken,
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
        clientId: projectCommentsTable.clientId,
        clientEmail: clientsTable.email,
        body: projectCommentsTable.body,
        createdAt: projectCommentsTable.createdAt,
      })
      .from(projectCommentsTable)
      .leftJoin(clientsTable, eq(clientsTable.id, projectCommentsTable.clientId))
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
        clientId: req.dbClient!.id,
        body: trimmed,
      })
      .returning();
    res.status(201).json({
      id: row.id,
      projectId: row.projectId,
      clientId: row.clientId,
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
    const isAuthor = comment.clientId === req.dbClient!.id;
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
      .update(clientsTable)
      .set({
        tokenBalance: sql`GREATEST(${clientsTable.tokenBalance} - ${tokensUsed}, 0)`,
        totalTokensUsed: sql`${clientsTable.totalTokensUsed} + ${tokensUsed}`,
      })
      .where(eq(clientsTable.id, client.id));

    const [session] = await db
      .insert(promptSessionsTable)
      .values({
        clientId: client.id,
        projectId: project.id,
        prompt: body.data.prompt,
        output: result.output,
        tokensUsed,
        model: result.model,
      })
      .returning();

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
        uploadedByClientId: projectFilesTable.uploadedByClientId,
        uploadedByEmail: clientsTable.email,
        name: projectFilesTable.name,
        contentType: projectFilesTable.contentType,
        sizeBytes: projectFilesTable.sizeBytes,
        objectPath: projectFilesTable.objectPath,
        createdAt: projectFilesTable.createdAt,
      })
      .from(projectFilesTable)
      .leftJoin(clientsTable, eq(clientsTable.id, projectFilesTable.uploadedByClientId))
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
        uploadedByClientId: req.dbClient!.id,
        name: body.data.name,
        contentType: body.data.contentType,
        sizeBytes: body.data.sizeBytes,
        objectPath: body.data.objectPath,
      })
      .returning();
    res.status(201).json({
      id: row.id,
      projectId: row.projectId,
      uploadedByClientId: row.uploadedByClientId,
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
    const isUploader = file.uploadedByClientId === req.dbClient!.id;
    const isOwner = project.viewerRole === "owner";
    if (!isUploader && !isOwner) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db.delete(projectFilesTable).where(eq(projectFilesTable.id, file.id));
    res.status(204).end();
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
    .set({ clientId, status: "active", acceptedAt: new Date() })
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "pending"),
      ),
    );

  // Also link any rows that were created before clientId was known
  await db
    .update(projectMembersTable)
    .set({ clientId })
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "active"),
        isNotNull(projectMembersTable.email),
      ),
    );
}

export default router;
