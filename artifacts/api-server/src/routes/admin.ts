import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
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
  ListAllProjectsResponse,
  ListAllBuildOrdersQueryParams,
  ListAllBuildOrdersResponse,
} from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient, requireAdmin } from "../lib/auth";

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

  // Create an invited record. The client will be linked to a Clerk userId on first sign-in.
  await db.insert(clientsTable).values({
    userId: `invited:${email}`,
    email,
    status: "invited",
    tokenBalance: 50_000, // welcome credit
  });

  // Optionally send a Clerk invitation (best-effort; ignore failure)
  try {
    await clerkClient.invitations.createInvitation({ emailAddress: email });
    res.json(
      InviteClientResponse.parse({
        success: true,
        message: `Invite sent to ${email}. They'll get 50,000 starter tokens on first sign-in.`,
      }),
    );
    return;
  } catch (err) {
    req.log.warn({ err }, "Clerk invitation failed (record still created)");
    res.json(
      InviteClientResponse.parse({
        success: true,
        message: `Reserved a spot for ${email}. Email invite could not be auto-sent — share the sign-up link manually.`,
      }),
    );
    return;
  }
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
  res.json(ListAllProjectsResponse.parse({ data: rows }));
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
