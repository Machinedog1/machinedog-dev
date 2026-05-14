import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq, desc, sql, and } from "drizzle-orm";
import {
  db,
  clientsTable,
  promptSessionsTable,
  tokenPurchasesTable,
  projectsTable,
  consultingBookingsTable,
  buildOrdersTable,
} from "@workspace/db";
import {
  GetAdminStatsResponse,
  ListClientsQueryParams,
  ListClientsResponse,
  InviteClientBody,
  InviteClientResponse,
  GetClientByIdParams,
  GetClientByIdResponse,
  AdjustClientBalanceParams,
  AdjustClientBalanceBody,
  AdjustClientBalanceResponse,
  DeleteClientParams,
  DeleteClientResponse,
  ResendClientInviteParams,
  ResendClientInviteResponse,
  ListAllProjectsResponse,
  ReassignProjectOwnerBody,
  ListAllBuildOrdersQueryParams,
  ListAllBuildOrdersResponse,
  ListAdminGithubReposResponse,
  ImportGithubProjectBody,
} from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient, requireAdmin } from "../lib/auth";
import { generateSecureToken } from "../lib/passwords";
import { sendInviteEmail } from "../lib/mailer";
import { importGithubAsProject } from "../lib/github-import";
import {
  getConnectedGithubUser,
  listConnectedUserRepos,
  GitHubNotConfiguredError,
  GitHubApiError,
} from "../lib/github";

const router: IRouter = Router();

router.use("/admin", requireAuth, loadOrCreateClient, requireAdmin);

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [{ totalClients }] = await db
    .select({ totalClients: sql<number>`count(*)::int` })
    .from(clientsTable);
  const [{ activeClients }] = await db
    .select({ activeClients: sql<number>`count(*)::int` })
    .from(clientsTable)
    .where(eq(clientsTable.status, "active"));
  const [tokenAgg] = await db
    .select({
      totalTokensUsed: sql<number>`COALESCE(sum(${clientsTable.totalTokensUsed}),0)::bigint`,
    })
    .from(clientsTable);
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
      clientEmail: clientsTable.email,
      createdAt: promptSessionsTable.createdAt,
    })
    .from(promptSessionsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, promptSessionsTable.clientId))
    .orderBy(desc(promptSessionsTable.createdAt))
    .limit(15);

  const recentPurchases = await db
    .select({
      type: sql<string>`'token_purchase'`,
      description: sql<string>`'Purchased ' || ${tokenPurchasesTable.bundleKey} || ' bundle (' || ${tokenPurchasesTable.tokensAdded} || ' tokens)'`,
      clientEmail: clientsTable.email,
      createdAt: tokenPurchasesTable.createdAt,
    })
    .from(tokenPurchasesTable)
    .leftJoin(clientsTable, eq(clientsTable.id, tokenPurchasesTable.clientId))
    .orderBy(desc(tokenPurchasesTable.createdAt))
    .limit(10);

  const recentBookings = await db
    .select({
      type: sql<string>`'consulting_booking'`,
      description: sql<string>`'Booked ' || ${consultingBookingsTable.packageKey} || ' (' || ${consultingBookingsTable.hoursTotal} || ' hrs)'`,
      clientEmail: clientsTable.email,
      createdAt: consultingBookingsTable.createdAt,
    })
    .from(consultingBookingsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, consultingBookingsTable.clientId))
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
    .from(clientsTable)
    .orderBy(desc(clientsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clientsTable);
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
  const existing = await db.select().from(clientsTable).where(eq(clientsTable.email, email));
  if (existing[0]) {
    res.json(
      InviteClientResponse.parse({
        success: true,
        message: `Already on the list (status: ${existing[0].status}).`,
      }),
    );
    return;
  }

  // Create an invited record with a one-time invite token.
  const inviteToken = generateSecureToken(32);
  const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(clientsTable).values({
    email,
    status: "invited",
    tokenBalance: 50_000, // welcome credit
    inviteToken,
    inviteTokenExpiresAt,
  });

  await sendInviteEmail({
    to: email,
    token: inviteToken,
    invitedByEmail: req.dbClient?.email,
    log: req.log,
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
  const [row] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
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
  const [target] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (target.isAdmin) {
    res.status(400).json({ error: "Cannot delete an admin account." });
    return;
  }
  if (req.dbClient && req.dbClient.id === id) {
    res.status(400).json({ error: "Cannot delete your own account." });
    return;
  }

  // Probe for related history that would block a hard delete.
  const [{ projectCount }] = await db
    .select({ projectCount: sql<number>`count(*)::int` })
    .from(projectsTable)
    .where(eq(projectsTable.clientId, id));
  const [{ promptCount }] = await db
    .select({ promptCount: sql<number>`count(*)::int` })
    .from(promptSessionsTable)
    .where(eq(promptSessionsTable.clientId, id));
  const [{ purchaseCount }] = await db
    .select({ purchaseCount: sql<number>`count(*)::int` })
    .from(tokenPurchasesTable)
    .where(eq(tokenPurchasesTable.clientId, id));
  const [{ bookingCount }] = await db
    .select({ bookingCount: sql<number>`count(*)::int` })
    .from(consultingBookingsTable)
    .where(eq(consultingBookingsTable.clientId, id));
  const [{ orderCount }] = await db
    .select({ orderCount: sql<number>`count(*)::int` })
    .from(buildOrdersTable)
    .where(eq(buildOrdersTable.clientId, id));

  const hasHistory =
    projectCount + promptCount + purchaseCount + bookingCount + orderCount > 0;

  if (hasHistory) {
    // Soft-delete: suspend access, clear invite token. History remains for audit.
    await db
      .update(clientsTable)
      .set({ status: "suspended", inviteToken: null, inviteTokenExpiresAt: null })
      .where(eq(clientsTable.id, id));
    req.log.info({ clientId: id, email: target.email }, "Client soft-deleted (suspended)");
    res.json(
      DeleteClientResponse.parse({
        success: true,
        mode: "soft",
        message: `${target.email} has been suspended. History preserved for audit.`,
      }),
    );
    return;
  }

  // Hard-delete: clean up sessions and project_members first (no FK cascade
  // on those, but project_members is set-null), then delete the row.
  try {
    await db.execute(sql`delete from sessions where client_id = ${id}`);
    await db.execute(sql`delete from project_members where client_id = ${id}`);
    await db.delete(clientsTable).where(eq(clientsTable.id, id));
    req.log.info({ clientId: id, email: target.email }, "Client hard-deleted");
    res.json(
      DeleteClientResponse.parse({
        success: true,
        mode: "hard",
        message: `${target.email} removed.`,
      }),
    );
  } catch (err) {
    req.log.error({ err, clientId: id }, "Hard delete failed; falling back to soft");
    await db
      .update(clientsTable)
      .set({ status: "suspended", inviteToken: null, inviteTokenExpiresAt: null })
      .where(eq(clientsTable.id, id));
    res.json(
      DeleteClientResponse.parse({
        success: true,
        mode: "soft",
        message: `${target.email} suspended (could not hard-delete due to existing references).`,
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
  const [target] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (target.isAdmin) {
    res.status(400).json({ error: "Cannot resend an invite to an admin account." });
    return;
  }

  const inviteToken = generateSecureToken(32);
  const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db
    .update(clientsTable)
    .set({
      status: "invited",
      passwordHash: null,
      inviteToken,
      inviteTokenExpiresAt,
    })
    .where(eq(clientsTable.id, id));

  await sendInviteEmail({
    to: target.email,
    token: inviteToken,
    invitedByEmail: req.dbClient?.email,
    log: req.log,
  });

  req.log.info({ clientId: id, email: target.email }, "Invite resent");
  res.json(
    ResendClientInviteResponse.parse({
      success: true,
      message: `New invite sent to ${target.email}. Previous invite link is no longer valid.`,
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
  const [row] = await db
    .update(clientsTable)
    .set({
      tokenBalance: sql`GREATEST(${clientsTable.tokenBalance} + ${body.data.delta}, 0)`,
    })
    .where(eq(clientsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  req.log.info({ clientId: row.id, delta: body.data.delta, reason: body.data.reason }, "Admin balance adjustment");
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
  if (project.clientId === newOwnerId) {
    res.json({ ...project, viewerRole: "owner" });
    return;
  }

  const [newOwner] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, newOwnerId));
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
    .set({ clientId: newOwnerId })
    .where(eq(projectsTable.id, projectId))
    .returning();

  req.log.info(
    {
      projectId,
      previousOwnerId: project.clientId,
      newOwnerId,
      newOwnerEmail: newOwner.email,
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
router.get("/admin/github/repos", async (_req, res): Promise<void> => {
  // Treat both "not connected" and "auth expired/revoked" (401/403 from GH)
  // as the same disconnected state so the UI can prompt re-authorization
  // instead of showing a 500.
  function asDisconnected() {
    res.json(
      ListAdminGithubReposResponse.parse({
        connected: false,
        login: null,
        repos: [],
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

  res.json(
    ListAdminGithubReposResponse.parse({
      connected: true,
      login,
      repos: repos.map((r) => ({
        ...r,
        importedProjectId:
          importedKey.get(`${r.owner.toLowerCase()}/${r.repo.toLowerCase()}`) ?? null,
      })),
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
    clientId: req.dbClient!.id,
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
      adminClientId: req.dbClient!.id,
    },
    "Admin imported GitHub repo as project",
  );
  res.status(201).json({ ...outcome.project, viewerRole: "owner" });
});

router.get("/admin/orders", async (req, res): Promise<void> => {
  const params = ListAllBuildOrdersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset } = params.data;
  const rows = await db
    .select()
    .from(buildOrdersTable)
    .orderBy(desc(buildOrdersTable.createdAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(buildOrdersTable);
  res.json(ListAllBuildOrdersResponse.parse({ data: rows, total: Number(count) }));
});

export default router;
