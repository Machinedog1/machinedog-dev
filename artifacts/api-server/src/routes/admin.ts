import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq, desc, sql, and, or, ilike, isNull, isNotNull } from "drizzle-orm";
import { db, organizationsTable, promptSessionsTable, tokenPurchasesTable, projectsTable, consultingBookingsTable, buildOrdersTable, leadsTable } from "@workspace/db";
import { GetAdminStatsResponse, ListClientsQueryParams, ListClientsResponse, InviteClientBody, InviteClientResponse, GetClientByIdParams, GetClientByIdResponse, AdjustClientBalanceParams, AdjustClientBalanceBody, AdjustClientBalanceResponse, DeleteClientParams, DeleteClientResponse, ResendClientInviteParams, ResendClientInviteResponse, ListAllProjectsResponse, ReassignProjectOwnerBody, ListAllBuildOrdersQueryParams, ListAllBuildOrdersResponse, ListAdminGithubReposResponse, ImportGithubProjectBody, ListAdminLeadsQueryParams, ListAdminLeadsResponse, UpdateAdminLeadParams, UpdateAdminLeadBody, UpdateAdminLeadResponse } from "@workspace/api-zod";
import { requireAuth, requirePlatformAdmin } from "../lib/auth";
import { generateSecureToken } from "../lib/passwords";
import { sendInviteEmail } from "../lib/mailer";
import { recordAuditEventAsync, reqAuditMeta } from "../lib/audit";
import { importGithubAsProject } from "../lib/github-import";
import * as tokenService from "../lib/token-service";
import { invalidateMetricsCache } from "./admin-platform";
import { getConnectedGithubUser, listConnectedUserRepos, GitHubNotConfiguredError, GitHubApiError } from "../lib/github";

const router: IRouter = Router();

router.use("/admin", requireAuth, requirePlatformAdmin);

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [{ totalClients }] = await db
    .select({ totalClients: sql<number>`count(*)::int` })
    .from(organizationsTable);
  const [{ activeClients }] = await db
    .select({ activeClients: sql<number>`count(*)::int` })
    .from(organizationsTable)
    .where(eq(organizationsTable.status, "active"));
  const [tokenAgg] = await db
    .select({
      totalTokensUsed: sql<number>`COALESCE(sum(${organizationsTable.totalTokensUsed}),0)::bigint`,
    })
    .from(organizationsTable);
  const [purchaseAgg] = await db
    .select({
      totalTokensPurchased: sql<number>`COALESCE(sum(${tokenPurchasesTable.tokensAdded}),0)::bigint`,
      totalRevenueTokens: sql<number>`COALESCE(sum(${tokenPurchasesTable.amountCents}),0)::bigint`,
    })
    .from(tokenPurchasesTable)
    .where(eq(tokenPurchasesTable.status, "completed"));
  const [bookingAgg] = await db
    .select({
      totalRevenueConsulting: sql<number>`COALESCE(sum(${consultingBookingsTable.amountCents}),0)::bigint`,
      totalConsultingHoursBooked: sql<number>`COALESCE(sum(${consultingBookingsTable.hoursTotal}),0)::int`,
    })
    .from(consultingBookingsTable)
    .where(eq(consultingBookingsTable.status, "active"));
  const [orderAgg] = await db
    .select({
      totalPaidBuilds: sql<number>`COALESCE(sum(case when ${buildOrdersTable.kind} = 'build' and ${buildOrdersTable.status} = 'completed' then 1 else 0 end),0)::int`,
      activeRetainers: sql<number>`COALESCE(sum(case when ${buildOrdersTable.kind} = 'retainer' and ${buildOrdersTable.status} = 'active' then 1 else 0 end),0)::int`,
      totalRevenueOrders: sql<number>`COALESCE(sum(case when ${buildOrdersTable.status} in ('completed','active') then ${buildOrdersTable.amountCents} else 0 end),0)::bigint`,
    })
    .from(buildOrdersTable);
  const [{ totalPrompts }] = await db
    .select({ totalPrompts: sql<number>`count(*)::int` })
    .from(promptSessionsTable);
  const [{ totalProjects }] = await db
    .select({ totalProjects: sql<number>`count(*)::int` })
    .from(projectsTable);

  // Recent activity: combine prompts + purchases + bookings + invites, last 25
  const recentPrompts = await db
    .select({
      type: sql<string>`'prompt'`,
      description: sql<string>`'Prompt: ' || left(${promptSessionsTable.prompt}, 80)`,
      clientEmail: organizationsTable.primaryEmail,
      createdAt: promptSessionsTable.createdAt,
    })
    .from(promptSessionsTable)
    .leftJoin(organizationsTable, eq(organizationsTable.id, promptSessionsTable.organizationId))
    .orderBy(desc(promptSessionsTable.createdAt))
    .limit(15);

  const recentPurchases = await db
    .select({
      type: sql<string>`'token_purchase'`,
      description: sql<string>`'Purchased ' || ${tokenPurchasesTable.bundleKey} || ' bundle (' || ${tokenPurchasesTable.tokensAdded} || ' tokens)'`,
      clientEmail: organizationsTable.primaryEmail,
      createdAt: tokenPurchasesTable.createdAt,
    })
    .from(tokenPurchasesTable)
    .leftJoin(organizationsTable, eq(organizationsTable.id, tokenPurchasesTable.organizationId))
    .orderBy(desc(tokenPurchasesTable.createdAt))
    .limit(10);

  const recentBookings = await db
    .select({
      type: sql<string>`'consulting_booking'`,
      description: sql<string>`'Booked ' || ${consultingBookingsTable.packageKey} || ' (' || ${consultingBookingsTable.hoursTotal} || ' hrs)'`,
      clientEmail: organizationsTable.primaryEmail,
      createdAt: consultingBookingsTable.createdAt,
    })
    .from(consultingBookingsTable)
    .leftJoin(organizationsTable, eq(organizationsTable.id, consultingBookingsTable.organizationId))
    .orderBy(desc(consultingBookingsTable.createdAt))
    .limit(10);

  const recentOrders = await db
    .select({
      type: sql<string>`case when ${buildOrdersTable.kind} = 'retainer' then 'retainer_order' else 'build_order' end`,
      description: sql<string>`(case when ${buildOrdersTable.kind} = 'retainer' then 'Retainer ' else 'Build ' end) || ${buildOrdersTable.status} || ' ($' || (${buildOrdersTable.amountCents} / 100)::text || ')'`,
      clientEmail: buildOrdersTable.email,
      createdAt: buildOrdersTable.createdAt,
    })
    .from(buildOrdersTable)
    .orderBy(desc(buildOrdersTable.createdAt))
    .limit(10);

  const recentActivity = [
    ...recentPrompts,
    ...recentPurchases,
    ...recentBookings,
    ...recentOrders,
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 25);

  res.json(
    GetAdminStatsResponse.parse({
      totalClients: Number(totalClients),
      activeClients: Number(activeClients),
      totalTokensUsed: Number(tokenAgg.totalTokensUsed),
      totalTokensPurchased: Number(purchaseAgg.totalTokensPurchased),
      totalRevenueCents:
        Number(purchaseAgg.totalRevenueTokens) +
        Number(bookingAgg.totalRevenueConsulting) +
        Number(orderAgg.totalRevenueOrders),
      totalPrompts: Number(totalPrompts),
      totalProjects: Number(totalProjects),
      totalConsultingHoursBooked: Number(bookingAgg.totalConsultingHoursBooked),
      totalPaidBuilds: Number(orderAgg.totalPaidBuilds),
      activeRetainers: Number(orderAgg.activeRetainers),
      recentActivity,
    }),
  );
});

router.get("/admin/clients", async (req, res): Promise<void> => {
  const params = ListClientsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset } = params.data;
  const rows = await db
    .select()
    .from(organizationsTable)
    .orderBy(desc(organizationsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationsTable);
  res.json(ListClientsResponse.parse({ data: rows, total: Number(count) }));
});

router.post("/admin/clients/invite", async (req, res): Promise<void> => {
  const parsed = InviteClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.toLowerCase();

  // Check if a client already exists with this email
  const existing = await db.select().from(organizationsTable).where(eq(organizationsTable.primaryEmail, email));
  if (existing[0]) {
    res.json(
      InviteClientResponse.parse({
        success: true,
        message: `Already on the list (status: ${existing[0].status}).`,
      }),
    );
    return;
  }

  // With Clerk handling auth, we just create an invited org record.
  // Actual user invitation happens via Clerk's invitation API.
  const [createdOrg] = await db
    .insert(organizationsTable)
    .values({
      name: email,
      primaryEmail: email,
      status: "invited",
      tokenBalance: 50_000, // welcome credit
    })
    .returning();
  recordAuditEventAsync({
    organizationId: createdOrg?.id ?? null,
    actorOrganizationId: req.organization?.id ?? null,
    actorEmail: req.organizationMember?.email ?? null,
    category: "organization",
    action: "organization_created",
    targetType: "organization",
    targetId: String(createdOrg?.id ?? email),
    metadata: { email, source: "admin_invite" },
    ...reqAuditMeta(req),
  });

  await sendInviteEmail({
    to: email,
    token: "",
    invitedByEmail: req.organizationMember?.email,
    log: req.log,
  });

  recordAuditEventAsync({
    actorOrganizationId: req.organization?.id ?? null,
    actorEmail: req.organizationMember?.email ?? null,
    category: "organization",
    action: "member_invited",
    targetType: "organization",
    targetId: email,
    metadata: { email },
    ...reqAuditMeta(req),
  });

  res.json(
    InviteClientResponse.parse({
      success: true,
      message: `Invite sent to ${email}. They'll get 50,000 starter tokens after setting their password.`,
    }),
  );
});

router.get("/admin/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientByIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(GetClientByIdResponse.parse(row));
});

router.delete("/admin/clients/:id", async (req, res): Promise<void> => {
  const params = DeleteClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const [target] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (req.organization && req.organization!.id === id) {
    res.status(400).json({ error: "Cannot delete your own account." });
    return;
  }

  // Probe for related history that would block a hard delete.
  const [{ projectCount }] = await db
    .select({ projectCount: sql<number>`count(*)::int` })
    .from(projectsTable)
    .where(eq(projectsTable.organizationId, id));
  const [{ promptCount }] = await db
    .select({ promptCount: sql<number>`count(*)::int` })
    .from(promptSessionsTable)
    .where(eq(promptSessionsTable.organizationId, id));
  const [{ purchaseCount }] = await db
    .select({ purchaseCount: sql<number>`count(*)::int` })
    .from(tokenPurchasesTable)
    .where(eq(tokenPurchasesTable.organizationId, id));
  const [{ bookingCount }] = await db
    .select({ bookingCount: sql<number>`count(*)::int` })
    .from(consultingBookingsTable)
    .where(eq(consultingBookingsTable.organizationId, id));
  const [{ orderCount }] = await db
    .select({ orderCount: sql<number>`count(*)::int` })
    .from(buildOrdersTable)
    .where(eq(buildOrdersTable.email, target.primaryEmail));

  const hasHistory =
    projectCount + promptCount + purchaseCount + bookingCount + orderCount > 0;

  if (hasHistory) {
    // Soft-delete: suspend access, clear invite token. History remains for audit.
    await db
      .update(organizationsTable)
      .set({ status: "suspended" })
      .where(eq(organizationsTable.id, id));
    req.log.info({ clientId: id, email: target.primaryEmail }, "Client soft-deleted (suspended)");
    res.json(
      DeleteClientResponse.parse({
        success: true,
        mode: "soft",
        message: `${target.primaryEmail} has been suspended. History preserved for audit.`,
      }),
    );
    return;
  }

  // Hard-delete: clean up sessions and project_members first (no FK cascade
  // on those, but project_members is set-null), then delete the row.
  try {
    await db.execute(sql`delete from project_members where organization_id = ${id}`);
    await db.delete(organizationsTable).where(eq(organizationsTable.id, id));
    req.log.info({ clientId: id, email: target.primaryEmail }, "Client hard-deleted");
    res.json(
      DeleteClientResponse.parse({
        success: true,
        mode: "hard",
        message: `${target.primaryEmail} removed.`,
      }),
    );
  } catch (err) {
    req.log.error({ err, clientId: id }, "Hard delete failed; falling back to soft");
    await db
      .update(organizationsTable)
      .set({ status: "suspended" })
      .where(eq(organizationsTable.id, id));
    res.json(
      DeleteClientResponse.parse({
        success: true,
        mode: "soft",
        message: `${target.primaryEmail} suspended (could not hard-delete due to existing references).`,
      }),
    );
  }
});

router.post("/admin/clients/:id/resend-invite", async (req, res): Promise<void> => {
  const params = ResendClientInviteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const id = params.data.id;
  const [target] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Clerk owns invitations now; just flip status back to invited and notify.
  await db
    .update(organizationsTable)
    .set({ status: "invited" })
    .where(eq(organizationsTable.id, id));

  await sendInviteEmail({
    to: target.primaryEmail,
    token: "",
    invitedByEmail: req.organizationMember?.email,
    log: req.log,
  });

  req.log.info({ clientId: id, email: target.primaryEmail }, "Invite resent");
  res.json(
    ResendClientInviteResponse.parse({
      success: true,
      message: `New invite sent to ${target.primaryEmail}. Previous invite link is no longer valid.`,
    }),
  );
});

router.patch("/admin/clients/:id/balance", async (req, res): Promise<void> => {
  const params = AdjustClientBalanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AdjustClientBalanceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Route through the canonical token service so we get a ledger row,
  // a `tokens_adjusted` audit event, and the same balance-floor handling
  // (no negative balances) as everywhere else.
  const safeDelta =
    body.data.delta < 0
      ? -Math.min(Math.abs(body.data.delta), existing.tokenBalance)
      : body.data.delta;
  const result = await tokenService.adminAdjust(existing.id, safeDelta, {
    description: body.data.reason
      ? `Admin adjustment: ${body.data.reason}`
      : undefined,
    actorOrganizationId: req.organization?.id ?? null,
  });
  // Token-balance changes affect totalTokensUsed/grants surfaced in
  // /admin/metrics; flush the 60s cache so the dashboard reflects the
  // adjustment immediately.
  invalidateMetricsCache();
  const [row] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, existing.id));
  req.log.info(
    {
      clientId: existing.id,
      delta: safeDelta,
      reason: body.data.reason,
      balanceAfter: result.balanceAfter,
    },
    "Admin balance adjustment",
  );
  res.json(AdjustClientBalanceResponse.parse(row));
});

router.get("/admin/projects", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.updatedAt));
  // Admins can see and act on every project; surface "owner" as viewerRole
  // so the response satisfies the Project schema (which requires viewerRole).
  const data = rows.map((r) => ({ ...r, viewerRole: "owner" as const }));
  res.json(ListAllProjectsResponse.parse({ data }));
});

router.patch("/admin/projects/:id/owner", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId)) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const body = ReassignProjectOwnerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const newOwnerId = body.data.clientId;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (project.organizationId === newOwnerId) {
    res.json({ ...project, viewerRole: "owner" });
    return;
  }

  const [newOwner] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, newOwnerId));
  if (!newOwner) {
    res.status(404).json({ error: "Target client not found" });
    return;
  }
  if (newOwner.status === "suspended") {
    res.status(400).json({ error: "Cannot assign to a suspended client." });
    return;
  }

  const [updated] = await db
    .update(projectsTable)
    .set({ organizationId: newOwnerId })
    .where(eq(projectsTable.id, projectId))
    .returning();

  req.log.info(
    {
      projectId,
      previousOwnerId: project.organizationId,
      newOwnerId,
      newOwnerEmail: newOwner.primaryEmail,
    },
    "Admin reassigned project owner",
  );

  res.json({ ...updated, viewerRole: "owner" });
});

// Surfaces every GitHub repo the connected GH account can manage, plus
// whether each one already has a Machinedog project. Powers the "Import from
// GitHub" panel on the admin All Projects page so admins can pull every
// repo Tom owns into Machinedog and then reassign clients with the existing
// per-card controls.
router.get("/admin/github/repos", async (req, res): Promise<void> => {
  const limitRaw = Number(req.query.limit ?? 50);
  const offsetRaw = Number(req.query.offset ?? 0);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const importedFilter =
    req.query.imported === "true"
      ? "imported"
      : req.query.imported === "false"
        ? "available"
        : "all";

  // Treat both "not connected" and "auth expired/revoked" (401/403 from GH)
  // as the same disconnected state so the UI can prompt re-authorization
  // instead of showing a 500.
  function asDisconnected() {
    res.json(
      ListAdminGithubReposResponse.parse({
        connected: false,
        login: null,
        repos: [],
        total: 0,
      }),
    );
  }

  let login: string | null = null;
  try {
    const me = await getConnectedGithubUser();
    login = me.login;
  } catch (err) {
    if (err instanceof GitHubNotConfiguredError) {
      asDisconnected();
      return;
    }
    if (err instanceof GitHubApiError && (err.status === 401 || err.status === 403)) {
      asDisconnected();
      return;
    }
    throw err;
  }

  let repos;
  try {
    repos = await listConnectedUserRepos();
  } catch (err) {
    if (err instanceof GitHubNotConfiguredError) {
      asDisconnected();
      return;
    }
    if (err instanceof GitHubApiError && (err.status === 401 || err.status === 403)) {
      asDisconnected();
      return;
    }
    throw err;
  }

  // Build a lookup of already-imported repos so the UI can render an
  // "Already imported" badge instead of an Import button.
  const existing = await db
    .select({
      id: projectsTable.id,
      githubOwner: projectsTable.githubOwner,
      githubRepo: projectsTable.githubRepo,
    })
    .from(projectsTable);
  const importedKey = new Map<string, number>();
  for (const r of existing) {
    if (r.githubOwner && r.githubRepo) {
      importedKey.set(`${r.githubOwner.toLowerCase()}/${r.githubRepo.toLowerCase()}`, r.id);
    }
  }

  const enriched = repos.map((r) => ({
    ...r,
    importedProjectId:
      importedKey.get(`${r.owner.toLowerCase()}/${r.repo.toLowerCase()}`) ?? null,
  }));
  const term = search.toLowerCase();
  const filtered = enriched.filter((r) => {
    if (importedFilter === "imported" && r.importedProjectId == null) return false;
    if (importedFilter === "available" && r.importedProjectId != null) return false;
    if (term && !r.fullName.toLowerCase().includes(term)) return false;
    return true;
  });
  const page = filtered.slice(offset, offset + limit);

  res.json(
    ListAdminGithubReposResponse.parse({
      connected: true,
      login,
      repos: page,
      total: filtered.length,
    }),
  );
});

// Creates a Machinedog project from a GitHub repo, owned by the calling
// admin's client record. Admin then uses the existing reassign / invite
// controls to attach a real client. 409 on duplicate so re-imports are safe.
router.post("/admin/projects/import-github", async (req, res): Promise<void> => {
  const body = ImportGithubProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  // Reuse the shared github-import service so admin and the user-facing
  // wizard create-from-github path share identical dedupe semantics and
  // normalization.
  const outcome = await importGithubAsProject({
    organizationId: req.organization!.id,
    owner: body.data.owner,
    repo: body.data.repo,
    defaultBranch: body.data.defaultBranch,
    title: body.data.title ?? undefined,
  });
  if (!outcome.ok) {
    res.status(409).json({ error: outcome.message });
    return;
  }
  req.log.info(
    {
      projectId: outcome.project.id,
      owner: outcome.project.githubOwner,
      repo: outcome.project.githubRepo,
      defaultBranch: outcome.project.githubDefaultBranch,
      adminClientId: req.organization!.id,
    },
    "Admin imported GitHub repo as project",
  );
  recordAuditEventAsync({
    organizationId: outcome.project.organizationId,
    projectId: outcome.project.id,
    actorOrganizationId: req.organization!.id,
    actorEmail: req.organizationMember!.email,
    category: "project",
    action: "repo_imported",
    targetType: "project",
    targetId: String(outcome.project.id),
    metadata: {
      owner: outcome.project.githubOwner,
      repo: outcome.project.githubRepo,
    },
    ...reqAuditMeta(req),
  });
  res.status(201).json({ ...outcome.project, viewerRole: "owner" });
});

router.get("/admin/orders", async (req, res): Promise<void> => {
  const params = ListAllBuildOrdersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset, kind, status, search } = params.data;
  const conds = [];
  if (kind) conds.push(eq(buildOrdersTable.kind, kind));
  if (status) conds.push(eq(buildOrdersTable.status, status));
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conds.push(
      or(
        ilike(buildOrdersTable.email, term),
        ilike(buildOrdersTable.name, term),
        ilike(buildOrdersTable.company, term),
        ilike(buildOrdersTable.stripeSessionId, term),
      )!,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select()
    .from(buildOrdersTable)
    .where(where)
    .orderBy(desc(buildOrdersTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(buildOrdersTable)
    .where(where);
  res.json(ListAllBuildOrdersResponse.parse({ data: rows, total: Number(count) }));
});

router.get("/admin/leads", async (req, res): Promise<void> => {
  const params = ListAdminLeadsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset, search, status } = params.data;
  const conds = [];
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conds.push(
      or(
        ilike(leadsTable.email, term),
        ilike(leadsTable.name, term),
        ilike(leadsTable.company, term),
      )!,
    );
  }
  if (status === "notified") conds.push(isNotNull(leadsTable.notifiedAt));
  else if (status === "pending")
    conds.push(and(isNull(leadsTable.notifiedAt), isNull(leadsTable.notifyError))!);
  else if (status === "error") conds.push(isNotNull(leadsTable.notifyError));
  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select()
    .from(leadsTable)
    .where(where)
    .orderBy(desc(leadsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(where);
  res.json(ListAdminLeadsResponse.parse({ data: rows, total: Number(count) }));
});

router.patch("/admin/leads/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminLeadParams.safeParse(req.params);
  const body = UpdateAdminLeadBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const leadId = params.data.id;
  const [existing] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const patch: Record<string, unknown> = {};
  if (body.data.operatorNotes !== undefined) patch.operatorNotes = body.data.operatorNotes;
  if (body.data.contacted === true) {
    patch.contactedAt = new Date();
    patch.contactedByEmail = req.organizationMember?.email ?? null;
  } else if (body.data.contacted === false) {
    patch.contactedAt = null;
    patch.contactedByEmail = null;
  }

  const [updated] = await db
    .update(leadsTable)
    .set(patch)
    .where(eq(leadsTable.id, leadId))
    .returning();

  recordAuditEventAsync({
    category: "admin",
    action: "lead_updated",
    targetType: "lead",
    targetId: String(leadId),
    metadata: {
      operatorNotesChanged: body.data.operatorNotes !== undefined,
      contacted: body.data.contacted ?? null,
    },
    actorUserId: null,
    actorEmail: req.organizationMember?.email ?? null,
    organizationId: null,
    projectId: null,
    ...reqAuditMeta(req),
  });

  res.json(UpdateAdminLeadResponse.parse(updated));
});

export default router;
