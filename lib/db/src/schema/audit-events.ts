import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { clientsTable } from "./clients";

/**
 * Phase 1: forward-compatible audit events table. Phase 5 will add the full
 * audit UI on top of this. Every billing/token mutation writes a row here.
 */
export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").references(() => organizationsTable.id),
    actorClientId: integer("actor_client_id").references(() => clientsTable.id),
    actorEmail: text("actor_email"),
    // category groups events for the UI ("billing", "tokens", "auth", "project", "admin", ...)
    category: text("category").notNull(),
    // action describes what happened ("subscription.created", "tokens.deducted", ...)
    action: text("action").notNull(),
    // free-form target reference, e.g. stripe sub id, project id, etc.
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("audit_events_org_idx").on(t.organizationId),
    categoryIdx: index("audit_events_category_idx").on(t.category),
    createdAtIdx: index("audit_events_created_at_idx").on(t.createdAt),
  }),
);

export const insertAuditEventSchema = createInsertSchema(auditEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
