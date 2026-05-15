import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, auditEventsTable, projectsTable, projectMembersTable, AUDIT_ACTION_VALUES } from "@workspace/db";
import { requireAuth, requireActiveClient, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

function serializeRow(r: typeof auditEventsTable.$inferSelect) {
  return {
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
  };
}

// Per-project history — owners and active project members can view.
router.get(
  "/projects/:id/audit",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const isOwner = project.organizationId === req.organization!.id;
    if (!isOwner) {
      const [member] = await db
        .select()
        .from(projectMembersTable)
        .where(
          and(
            eq(projectMembersTable.projectId, projectId),
            eq(projectMembersTable.status, "active"),
            eq(projectMembersTable.email, req.organizationMember!.email.toLowerCase()),
          ),
        );
      if (!member) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    }

    const rows = await db
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.projectId, projectId))
      .orderBy(desc(auditEventsTable.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEventsTable)
      .where(eq(auditEventsTable.projectId, projectId));
    res.json({ data: rows.map(serializeRow), total: Number(count) });
  },
);

// Admin audit feed — supports filters: organizationId, projectId, actor
// (email substring), action, since, until, limit, offset.
router.get(
  "/admin/audit",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const filters: SQL[] = [];
    if (req.query.organizationId) {
      const v = Number(req.query.organizationId);
      if (Number.isFinite(v)) filters.push(eq(auditEventsTable.organizationId, v));
    }
    if (req.query.projectId) {
      const v = Number(req.query.projectId);
      if (Number.isFinite(v)) filters.push(eq(auditEventsTable.projectId, v));
    }
    if (typeof req.query.action === "string" && req.query.action) {
      const candidate = req.query.action;
      if ((AUDIT_ACTION_VALUES as readonly string[]).includes(candidate)) {
        filters.push(
          eq(auditEventsTable.action, candidate as (typeof AUDIT_ACTION_VALUES)[number]),
        );
      }
    }
    if (typeof req.query.actor === "string" && req.query.actor) {
      filters.push(sql`lower(${auditEventsTable.actorEmail}) like ${`%${req.query.actor.toLowerCase()}%`}`);
    }
    if (typeof req.query.since === "string" && req.query.since) {
      const d = new Date(req.query.since);
      if (!Number.isNaN(d.getTime())) filters.push(gte(auditEventsTable.createdAt, d));
    }
    if (typeof req.query.until === "string" && req.query.until) {
      const d = new Date(req.query.until);
      if (!Number.isNaN(d.getTime())) filters.push(lte(auditEventsTable.createdAt, d));
    }

    const whereClause = filters.length ? and(...filters) : undefined;
    const rows = await db
      .select()
      .from(auditEventsTable)
      .where(whereClause)
      .orderBy(desc(auditEventsTable.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEventsTable)
      .where(whereClause);
    res.json({ data: rows.map(serializeRow), total: Number(count) });
  },
);

export default router;
