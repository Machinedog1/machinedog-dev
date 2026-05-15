import { pgTable, pgEnum, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";

// Canonical list of audit actions. Must stay in sync with
// `AUDIT_ACTIONS` in artifacts/api-server/src/lib/audit.ts and the
// `action` enum in lib/api-spec/openapi.yaml. Adding a new action
// requires touching all three locations and running drizzle push +
// orval codegen.
export const AUDIT_ACTION_VALUES = [
  "signin",
  "signin_failed",
  "organization_created",
  "member_invited",
  "member_removed",
  "project_created",
  "project_updated",
  "project_archived",
  "file_created",
  "file_updated",
  "file_deleted",
  "ai_prompt_submitted",
  "ai_change_accepted",
  "ai_change_rejected",
  "phi_blocked",
  "secret_created",
  "secret_updated",
  "secret_deleted",
  "secret_rotated",
  "github_connected",
  "repo_imported",
  "repo_pulled",
  "repo_pushed",
  "build_started",
  "build_failed",
  "build_succeeded",
  "deployment_started",
  "deployment_live",
  "deployment_failed",
  "tokens_purchased",
  "tokens_used",
  "tokens_granted",
  "tokens_adjusted",
  "checkout_created",
  "subscription_changed",
  "payment_failed",
  "healthcare_mode_requested",
  "healthcare_gating_blocked",
  "insufficient_tokens",
  "baa_status_updated",
  "ai_provider_updated",
  "ai_model_updated",
  "organization_suspended",
  "organization_reactivated",
  "plan_changed",
  "compliance_updated",
  "lead_updated",
  "phi_mode_enabled",
  "phi_mode_disabled",
  "hipaa_deployment_approved",
] as const;
export type AuditActionValue = (typeof AUDIT_ACTION_VALUES)[number];
export const auditActionEnum = pgEnum("audit_action", AUDIT_ACTION_VALUES);

export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id").references(() => organizationsTable.id),
    projectId: integer("project_id").references(() => projectsTable.id),
    actorOrganizationId: integer("actor_organization_id").references(() => organizationsTable.id),
    actorUserId: text("actor_user_id"),
    actorEmail: text("actor_email"),
    category: text("category").notNull(),
    action: auditActionEnum("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("audit_events_org_idx").on(t.organizationId),
    projectIdx: index("audit_events_project_idx").on(t.projectId),
    categoryIdx: index("audit_events_category_idx").on(t.category),
    actionIdx: index("audit_events_action_idx").on(t.action),
    createdAtIdx: index("audit_events_created_at_idx").on(t.createdAt),
  }),
);

export const insertAuditEventSchema = createInsertSchema(auditEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
