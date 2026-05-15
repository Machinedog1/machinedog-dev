/**
 * Phase 7 admin endpoints — operator command center.
 *
 * These routes layer on top of the legacy /admin/* surface in admin.ts and
 * expose the metrics, organization controls, users, token ledger and
 * compliance views that the new admin dashboard needs. The legacy
 * /admin/clients endpoints are kept intact (their rename to organizations
 * is its own task) so the admin UI can adopt these incrementally.
 */
import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, organizationsTable, organizationMembersTable, projectsTable, buildJobsTable, deploymentsTable, buildOrdersTable, subscriptionsTable, tokenLedgerTable, tokenPurchasesTable, auditEventsTable, type Organization } from "@workspace/db";
import { GetAdminMetricsResponse, ListAdminOrganizationsQueryParams, ListAdminOrganizationsResponse, SetAdminOrganizationStatusBody, SetAdminOrganizationStatusResponse, SetAdminOrganizationPlanBody, SetAdminOrganizationPlanResponse, SetAdminOrganizationComplianceBody, SetAdminOrganizationComplianceResponse, ListAdminUsersQueryParams, ListAdminUsersResponse, ListAdminTokensQueryParams, ListAdminTokensResponse, ListAdminComplianceQueryParams, ListAdminComplianceResponse } from "@workspace/api-zod";
import { requireAuth, requirePlatformAdmin } from "../lib/auth";
import { recordAuditEventAsync, reqAuditMeta } from "../lib/audit";

const router: IRouter = Router();

router.use("/admin", requireAuth, requirePlatformAdmin);

// ---------- Helpers ----------------------------------------------------------

function serializeOrg(
  o: Organization,
  extras: { memberCount: number; projectCount: number },
) {
  return {
    id: o.id,
    name: o.name,
    primaryEmail: o.primaryEmail,
    clerkOrgId: o.clerkOrgId,
    clerkOrgSlug: o.clerkOrgSlug,
    planType: o.planType,
    planStatus: o.planStatus,
    status: o.status,
    baaStatus: o.baaStatus,
    hipaaDeploymentStatus: o.hipaaDeploymentStatus,
    mfaRequired: Number(o.mfaRequired) > 0,
    tokenBalance: o.tokenBalance,
    totalTokensUsed: o.totalTokensUsed,
    buildMinutesUsed: o.buildMinutesUsed,
    memberCount: extras.memberCount,
    projectCount: extras.projectCount,
    stripeCustomerId: o.stripeCustomerId,
    portalSubscriptionStatus: o.portalSubscriptionStatus,
    portalCurrentPeriodEnd: o.portalCurrentPeriodEnd,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function loadOrgWithCounts(id: number) {
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
  if (!org) return null;
  const [{ memberCount }] = await db
    .select({ memberCount: sql<number>`count(*)::int` })
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.organizationId, id));
  const [{ projectCount }] = await db
    .select({ projectCount: sql<number>`count(*)::int` })
    .from(projectsTable)
    .where(eq(projectsTable.organizationId, id));
  return serializeOrg(org, {
    memberCount: Number(memberCount),
    projectCount: Number(projectCount),
  });
}

// ---------- /admin/metrics (60s in-memory cache) -----------------------------

interface CachedMetrics {
  payload: unknown;
  cachedAt: number;
}
let metricsCache: CachedMetrics | null = null;
const METRICS_TTL_MS = 60_000;

async function buildMetrics(): Promise<unknown> {
  const [
    [{ totalUsers }],
    [{ totalOrganizations }],
    [{ activeSubscriptions }],
    [{ totalProjects }],
    [{ activeProjects }],
    [{ publishedProjects }],
    [{ githubImportsCount }],
    [{ buildJobsCount }],
    [{ deploymentsCount }],
    [{ healthcareProjectsCount }],
    [{ baaPendingCount }],
    [{ phiModeEnabledCount }],
    [tokenAgg],
    [purchaseAgg],
    [orderAgg],
    recentAuditRows,
    recentOrderRows,
  ] = await Promise.all([
    db
      .select({ totalUsers: sql<number>`count(*)::int` })
      .from(organizationMembersTable),
    db
      .select({ totalOrganizations: sql<number>`count(*)::int` })
      .from(organizationsTable),
    db
      .select({ activeSubscriptions: sql<number>`count(*)::int` })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.status, "active")),
    db
      .select({ totalProjects: sql<number>`count(*)::int` })
      .from(projectsTable),
    db
      .select({ activeProjects: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(eq(projectsTable.status, "active")),
    db
      .select({ publishedProjects: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(sql`${projectsTable.liveUrl} is not null and ${projectsTable.liveUrl} <> ''`),
    db
      .select({ githubImportsCount: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(sql`${projectsTable.githubOwner} is not null and ${projectsTable.githubRepo} is not null`),
    db
      .select({ buildJobsCount: sql<number>`count(*)::int` })
      .from(buildJobsTable),
    db
      .select({ deploymentsCount: sql<number>`count(*)::int` })
      .from(deploymentsTable),
    db
      .select({ healthcareProjectsCount: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(eq(projectsTable.healthcareMode, true)),
    db
      .select({ baaPendingCount: sql<number>`count(*)::int` })
      .from(organizationsTable)
      .where(eq(organizationsTable.baaStatus, "pending")),
    db
      .select({ phiModeEnabledCount: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(eq(projectsTable.phiAllowed, true)),
    db
      .select({
        totalTokensUsed: sql<number>`COALESCE(sum(${organizationsTable.totalTokensUsed}),0)::bigint`,
      })
      .from(organizationsTable),
    db
      .select({
        // Real USD revenue from completed token-pack checkouts. The token ledger
        // stores token units (not cents) so we cannot derive cents from it.
        tokenRevenueCents: sql<number>`COALESCE(sum(${tokenPurchasesTable.amountCents}) FILTER (WHERE ${tokenPurchasesTable.status} = 'completed'),0)::bigint`,
      })
      .from(tokenPurchasesTable),
    db
      .select({
        mrrCents: sql<number>`COALESCE(sum(case when ${buildOrdersTable.kind} = 'retainer' and ${buildOrdersTable.status} = 'active' then ${buildOrdersTable.amountCents} else 0 end),0)::bigint`,
      })
      .from(buildOrdersTable),
    db
      .select()
      .from(auditEventsTable)
      .orderBy(desc(auditEventsTable.createdAt))
      .limit(20),
    db
      .select()
      .from(buildOrdersTable)
      .orderBy(desc(buildOrdersTable.createdAt))
      .limit(10),
  ]);

  const payload = {
    totalUsers: Number(totalUsers),
    totalOrganizations: Number(totalOrganizations),
    activeSubscriptions: Number(activeSubscriptions),
    mrrCents: Number(orderAgg.mrrCents),
    tokenRevenueCents: Number(purchaseAgg.tokenRevenueCents),
    totalTokensUsed: Number(tokenAgg.totalTokensUsed),
    totalProjects: Number(totalProjects),
    activeProjects: Number(activeProjects),
    publishedProjects: Number(publishedProjects),
    githubImportsCount: Number(githubImportsCount),
    buildJobsCount: Number(buildJobsCount),
    deploymentsCount: Number(deploymentsCount),
    healthcareProjectsCount: Number(healthcareProjectsCount),
    baaPendingCount: Number(baaPendingCount),
    phiModeEnabledCount: Number(phiModeEnabledCount),
    recentAuditEvents: recentAuditRows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      projectId: r.projectId,
      actorOrganizationId: r.actorOrganizationId,
      actorEmail: r.actorEmail,
      actorUserId: r.actorUserId,
      category: r.category,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
    recentOrders: recentOrderRows,
    cachedAt: new Date().toISOString(),
  };
  return GetAdminMetricsResponse.parse(payload);
}

router.get("/admin/metrics", async (_req, res): Promise<void> => {
  const now = Date.now();
  if (metricsCache && now - metricsCache.cachedAt < METRICS_TTL_MS) {
    res.json(metricsCache.payload);
    return;
  }
  const payload = await buildMetrics();
  metricsCache = { payload, cachedAt: now };
  res.json(payload);
});

function invalidateMetricsCache() {
  metricsCache = null;
}

// ---------- /admin/organizations --------------------------------------------

router.get("/admin/organizations", async (req, res): Promise<void> => {
  const params = ListAdminOrganizationsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset, search, status, planType } = params.data;
  const filters: SQL[] = [];
  if (status) filters.push(eq(organizationsTable.status, status));
  if (planType) filters.push(eq(organizationsTable.planType, planType));
  if (search && search.trim()) {
    const like = `%${search.trim()}%`;
    filters.push(
      or(
        ilike(organizationsTable.name, like),
        ilike(organizationsTable.primaryEmail, like),
      )!,
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      org: organizationsTable,
      memberCount: sql<number>`(select count(*)::int from organization_members where organization_id = ${organizationsTable.id})`,
      projectCount: sql<number>`(select count(*)::int from projects where organization_id = ${organizationsTable.id})`,
    })
    .from(organizationsTable)
    .where(where)
    .orderBy(desc(organizationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationsTable)
    .where(where);

  res.json(
    ListAdminOrganizationsResponse.parse({
      data: rows.map((r) =>
        serializeOrg(r.org, {
          memberCount: Number(r.memberCount),
          projectCount: Number(r.projectCount),
        }),
      ),
      total: Number(count),
    }),
  );
});

router.patch("/admin/organizations/:id/status", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = SetAdminOrganizationStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (req.organization && req.organization!.id === id && body.data.status === "suspended") {
    res.status(400).json({ error: "Cannot suspend your own organization." });
    return;
  }
  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db
    .update(organizationsTable)
    .set({ status: body.data.status })
    .where(eq(organizationsTable.id, id));

  recordAuditEventAsync({
    organizationId: id,
    actorOrganizationId: req.organization?.id ?? null,
    actorEmail: req.organizationMember?.email ?? null,
    category: "organization",
    action: body.data.status === "suspended" ? "organization_suspended" : "organization_reactivated",
    targetType: "organization",
    targetId: String(id),
    metadata: {
      from: existing.status,
      to: body.data.status,
      reason: body.data.reason ?? null,
    },
    ...reqAuditMeta(req),
  });
  invalidateMetricsCache();

  const out = await loadOrgWithCounts(id);
  res.json(SetAdminOrganizationStatusResponse.parse(out));
});

router.patch("/admin/organizations/:id/plan", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = SetAdminOrganizationPlanBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db
    .update(organizationsTable)
    .set({ planType: body.data.planType })
    .where(eq(organizationsTable.id, id));

  // Look at the org's most recent active subscription (if any) to flag plan
  // drift relative to Stripe state. We never mutate Stripe here — admins use
  // this control for trial extensions, manual upgrades, or fixing onboarding
  // bugs; real billing changes still flow through the checkout/webhook path.
  const [activeSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.organizationId, id),
        eq(subscriptionsTable.status, "active"),
      ),
    )
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);
  const subPlan = activeSub?.planType ?? null;
  const warning =
    subPlan && subPlan !== body.data.planType
      ? `Stripe subscription is on '${subPlan}'. This change does not update Stripe; cancel/upgrade the subscription separately if billing should follow.`
      : null;

  recordAuditEventAsync({
    organizationId: id,
    actorOrganizationId: req.organization?.id ?? null,
    actorEmail: req.organizationMember?.email ?? null,
    category: "organization",
    action: "plan_changed",
    targetType: "organization",
    targetId: String(id),
    metadata: {
      from: existing.planType,
      to: body.data.planType,
      reason: body.data.reason ?? null,
      stripePlan: subPlan,
      warning,
    },
    ...reqAuditMeta(req),
  });
  invalidateMetricsCache();

  const organization = await loadOrgWithCounts(id);
  res.json(SetAdminOrganizationPlanResponse.parse({ organization, warning }));
});

router.patch("/admin/organizations/:id/compliance", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = SetAdminOrganizationComplianceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const update: Partial<Organization> = {};
  if (body.data.baaStatus !== undefined) update.baaStatus = body.data.baaStatus;
  if (body.data.hipaaDeploymentStatus !== undefined)
    update.hipaaDeploymentStatus = body.data.hipaaDeploymentStatus;
  if (body.data.mfaRequired !== undefined)
    update.mfaRequired = body.data.mfaRequired ? 1 : 0;
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No compliance fields to update." });
    return;
  }
  await db
    .update(organizationsTable)
    .set(update)
    .where(eq(organizationsTable.id, id));

  recordAuditEventAsync({
    organizationId: id,
    actorOrganizationId: req.organization?.id ?? null,
    actorEmail: req.organizationMember?.email ?? null,
    category: "organization",
    action: "compliance_updated",
    targetType: "organization",
    targetId: String(id),
    metadata: {
      changes: {
        baaStatus:
          body.data.baaStatus !== undefined
            ? { from: existing.baaStatus, to: body.data.baaStatus }
            : undefined,
        hipaaDeploymentStatus:
          body.data.hipaaDeploymentStatus !== undefined
            ? {
                from: existing.hipaaDeploymentStatus,
                to: body.data.hipaaDeploymentStatus,
              }
            : undefined,
        mfaRequired:
          body.data.mfaRequired !== undefined
            ? { from: Number(existing.mfaRequired) > 0, to: body.data.mfaRequired }
            : undefined,
      },
    },
    ...reqAuditMeta(req),
  });
  // BAA-specific audit action stays for compatibility with Phase 8 reports.
  if (body.data.baaStatus !== undefined && body.data.baaStatus !== existing.baaStatus) {
    recordAuditEventAsync({
      organizationId: id,
      actorOrganizationId: req.organization?.id ?? null,
      actorEmail: req.organizationMember?.email ?? null,
      category: "compliance",
      action: "baa_status_updated",
      targetType: "organization",
      targetId: String(id),
      metadata: { from: existing.baaStatus, to: body.data.baaStatus },
      ...reqAuditMeta(req),
    });
  }
  invalidateMetricsCache();

  const out = await loadOrgWithCounts(id);
  res.json(SetAdminOrganizationComplianceResponse.parse(out));
});

// Phase 8 — one-click HIPAA-deployment approval. Sets the org's
// hipaaDeploymentStatus=approved and emits a dedicated audit event so the
// per-org compliance page can confirm the precondition independently of
// the more general compliance_updated stream.
router.post(
  "/admin/organizations/:id/compliance/approve-hipaa",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : null;
    const [existing] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(organizationsTable)
      .set({ hipaaDeploymentStatus: "approved" })
      .where(eq(organizationsTable.id, id));
    recordAuditEventAsync({
      organizationId: id,
      actorOrganizationId: req.organization?.id ?? null,
      actorEmail: req.organizationMember?.email ?? null,
      category: "compliance",
      action: "hipaa_deployment_approved",
      targetType: "organization",
      targetId: String(id),
      metadata: {
        from: existing.hipaaDeploymentStatus,
        to: "approved",
        reason,
      },
      ...reqAuditMeta(req),
    });
    invalidateMetricsCache();
    const out = await loadOrgWithCounts(id);
    res.json(SetAdminOrganizationComplianceResponse.parse(out));
  },
);

// Phase 8 — operator override that flips a project's PHI mode after a manual
// compliance review. Records a phi_mode_enabled audit event attributed to
// the platform admin (separate from the org-side toggle handler in projects.ts).
router.post(
  "/admin/projects/:id/phi-mode/approve",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : null;
    const [existing] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(projectsTable)
      .set({ healthcareMode: true, phiAllowed: true })
      .where(eq(projectsTable.id, id));
    recordAuditEventAsync({
      organizationId: existing.organizationId,
      actorOrganizationId: req.organization?.id ?? null,
      actorEmail: req.organizationMember?.email ?? null,
      category: "compliance",
      action: "phi_mode_enabled",
      targetType: "project",
      targetId: String(id),
      metadata: {
        from: { healthcareMode: existing.healthcareMode, phiAllowed: existing.phiAllowed },
        to: { healthcareMode: true, phiAllowed: true },
        reason,
        approvedByPlatformAdmin: true,
      },
      ...reqAuditMeta(req),
    });
    invalidateMetricsCache();
    res.json({ projectId: id, healthcareMode: true, phiAllowed: true });
  },
);

// ---------- /admin/users -----------------------------------------------------

router.get("/admin/users", async (req, res): Promise<void> => {
  const params = ListAdminUsersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset, organizationId, search, role } = params.data;
  const filters: SQL[] = [];
  if (organizationId)
    filters.push(eq(organizationMembersTable.organizationId, organizationId));
  if (role) filters.push(eq(organizationMembersTable.role, role));
  if (search && search.trim()) {
    filters.push(ilike(organizationMembersTable.email, `%${search.trim()}%`));
  }
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      m: organizationMembersTable,
      orgName: organizationsTable.name,
    })
    .from(organizationMembersTable)
    .leftJoin(
      organizationsTable,
      eq(organizationsTable.id, organizationMembersTable.organizationId),
    )
    .where(where)
    .orderBy(desc(organizationMembersTable.invitedAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationMembersTable)
    .where(where);

  res.json(
    ListAdminUsersResponse.parse({
      data: rows.map((r) => ({
        id: r.m.id,
        organizationId: r.m.organizationId,
        organizationName: r.orgName,
        email: r.m.email,
        clerkUserId: r.m.clerkUserId,
        role: r.m.role,
        status: r.m.status,
        invitedAt: r.m.invitedAt,
        acceptedAt: r.m.acceptedAt,
      })),
      total: Number(count),
    }),
  );
});

// ---------- /admin/tokens ----------------------------------------------------

router.get("/admin/tokens", async (req, res): Promise<void> => {
  const params = ListAdminTokensQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset, organizationId, type } = params.data;
  const filters: SQL[] = [];
  if (organizationId) filters.push(eq(tokenLedgerTable.organizationId, organizationId));
  if (type) filters.push(eq(tokenLedgerTable.type, type));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      l: tokenLedgerTable,
      orgName: organizationsTable.name,
    })
    .from(tokenLedgerTable)
    .leftJoin(organizationsTable, eq(organizationsTable.id, tokenLedgerTable.organizationId))
    .where(where)
    .orderBy(desc(tokenLedgerTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tokenLedgerTable)
    .where(where);

  res.json(
    ListAdminTokensResponse.parse({
      data: rows.map((r) => ({
        id: r.l.id,
        organizationId: r.l.organizationId,
        organizationName: r.orgName,
        projectId: r.l.projectId,
        type: r.l.type,
        amount: r.l.amount,
        balanceAfter: r.l.balanceAfter,
        description: r.l.description,
        source: r.l.source,
        createdAt: r.l.createdAt,
      })),
      total: Number(count),
    }),
  );
});

// ---------- /admin/compliance ------------------------------------------------

router.get("/admin/compliance", async (req, res): Promise<void> => {
  const params = ListAdminComplianceQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { limit, offset, baaStatus, hipaaDeploymentStatus } = params.data;
  const filters: SQL[] = [];
  if (baaStatus) filters.push(eq(organizationsTable.baaStatus, baaStatus));
  if (hipaaDeploymentStatus)
    filters.push(eq(organizationsTable.hipaaDeploymentStatus, hipaaDeploymentStatus));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      org: organizationsTable,
      memberCount: sql<number>`(select count(*)::int from organization_members where organization_id = ${organizationsTable.id})`,
      projectCount: sql<number>`(select count(*)::int from projects where organization_id = ${organizationsTable.id})`,
    })
    .from(organizationsTable)
    .where(where)
    .orderBy(desc(organizationsTable.updatedAt))
    .limit(limit)
    .offset(offset);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationsTable)
    .where(where);

  res.json(
    ListAdminComplianceResponse.parse({
      data: rows.map((r) =>
        serializeOrg(r.org, {
          memberCount: Number(r.memberCount),
          projectCount: Number(r.projectCount),
        }),
      ),
      total: Number(count),
    }),
  );
});

// Re-exported so admin balance route can flush stale dashboard data after a
// manual token adjustment.
export { invalidateMetricsCache };

export default router;
