import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

/**
 * Phase 8 — per-organization compliance profile.
 *
 * This is the "single source of truth" record an operator reviews when
 * deciding whether to flip an org into healthcare/PHI mode. It captures the
 * operational checklist (risk analysis, incident response plan, backup &
 * data retention policies, infrastructure approval, BAA paperwork, MFA
 * enforcement) alongside the latest review timestamp + notes.
 *
 * Most fields are derived from / mirror flags on the organizations table
 * (planType, baaStatus, hipaaDeploymentStatus, mfaRequired). They live here
 * separately so the compliance UI can present a stable, additive checklist
 * without expanding the organizations table further, and so we keep an audit
 * trail of when each posture item was last attested.
 */
export const STATUS_VALUES = [
  "not_started",
  "in_progress",
  "approved",
  "needs_attention",
] as const;
export type ComplianceItemStatus = (typeof STATUS_VALUES)[number];

export const complianceProfilesTable = pgTable(
  "compliance_profiles",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    // Live posture (mirrors org-level fields for the compliance UI; kept
    // in sync by /admin/organizations/:id/compliance and the Phase 8 admin
    // approval endpoints).
    planType: text("plan_type"),
    baaStatus: text("baa_status"),
    hipaaDeploymentStatus: text("hipaa_deployment_status"),
    mfaRequired: boolean("mfa_required"),
    auditRequired: boolean("audit_required").notNull().default(true),
    hipaaDeploymentRequired: boolean("hipaa_deployment_required")
      .notNull()
      .default(true),
    // Cloud-hosted HIPAA environment posture (e.g. AWS BAA-backed account).
    awsHipaaEnvironmentStatus: text("aws_hipaa_environment_status")
      .notNull()
      .default("not_configured"),
    healthcareEnabled: boolean("healthcare_enabled").notNull().default(false),
    phiAllowed: boolean("phi_allowed").notNull().default(false),
    auditLoggingEnabled: boolean("audit_logging_enabled").notNull().default(true),
    // Snapshots of the org-level compliance flags at the time of last
    // review (kept alongside the live mirrors so we have an audit trail of
    // what an operator attested to vs. the values today).
    planTypeSnapshot: text("plan_type_snapshot"),
    baaStatusSnapshot: text("baa_status_snapshot"),
    hipaaDeploymentStatusSnapshot: text("hipaa_deployment_status_snapshot"),
    mfaRequiredSnapshot: boolean("mfa_required_snapshot"),
    riskAnalysisStatus: text("risk_analysis_status", {
      enum: STATUS_VALUES,
    })
      .notNull()
      .default("not_started"),
    incidentResponseStatus: text("incident_response_status", {
      enum: STATUS_VALUES,
    })
      .notNull()
      .default("not_started"),
    backupPolicyStatus: text("backup_policy_status", {
      enum: STATUS_VALUES,
    })
      .notNull()
      .default("not_started"),
    dataRetentionPolicyStatus: text("data_retention_policy_status", {
      enum: STATUS_VALUES,
    })
      .notNull()
      .default("not_started"),
    notes: text("notes"),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    lastReviewedByEmail: text("last_reviewed_by_email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgIdx: uniqueIndex("compliance_profiles_org_idx").on(t.organizationId),
    reviewedIdx: index("compliance_profiles_reviewed_idx").on(t.lastReviewedAt),
  }),
);

export const insertComplianceProfileSchema = createInsertSchema(
  complianceProfilesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertComplianceProfile = z.infer<
  typeof insertComplianceProfileSchema
>;
export type ComplianceProfile = typeof complianceProfilesTable.$inferSelect;
