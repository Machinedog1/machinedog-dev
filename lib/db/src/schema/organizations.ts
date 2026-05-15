import { pgTable, serial, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const organizationsTable = pgTable(
  "organizations",
  {
    id: serial("id").primaryKey(),
    clerkOrgId: text("clerk_org_id").unique(),
    clerkOrgSlug: text("clerk_org_slug").unique(),
    name: text("name").notNull(),
    primaryEmail: text("primary_email").notNull(),
    planType: text("plan_type", {
      enum: ["free", "starter", "pro", "business", "team", "enterprise", "healthcare"],
    })
      .notNull()
      .default("free"),
    planStatus: text("plan_status", {
      enum: ["none", "trialing", "active", "past_due", "canceled", "incomplete"],
    })
      .notNull()
      .default("none"),
    baaStatus: text("baa_status", {
      enum: ["not_required", "required", "pending", "active", "expired"],
    })
      .notNull()
      .default("not_required"),
    // HIPAA deployment posture: tracks whether this org's infrastructure has
    // been operator-approved for HIPAA workloads. Independent from the BAA
    // (which is paperwork) — both must be in place to unlock healthcare-safe
    // AI lanes.
    hipaaDeploymentStatus: text("hipaa_deployment_status", {
      enum: ["not_required", "required", "pending", "approved", "revoked"],
    })
      .notNull()
      .default("not_required"),
    // Phase 7: admin-controlled MFA requirement input. Real enforcement
    // (forcing every member's session to satisfy MFA) lands in Phase 8 with
    // the rest of the healthcare gating; this field is simply the toggle the
    // admin flips ahead of that work.
    mfaRequired: integer("mfa_required").notNull().default(0),
    stripeCustomerId: text("stripe_customer_id"),
    // Token wallet — moved from legacy clients table.
    tokenBalance: integer("token_balance").notNull().default(0),
    totalTokensUsed: integer("total_tokens_used").notNull().default(0),
    // Phase 6: per-org build-minute accounting for future per-minute pricing.
    // Bumped atomically when a build_job reaches a terminal state with
    // both startedAt + finishedAt populated; never decremented.
    buildMinutesUsed: integer("build_minutes_used").notNull().default(0),
    // Account status — moved from legacy clients.status.
    status: text("status", { enum: ["active", "suspended", "invited"] })
      .notNull()
      .default("active"),
    // Portal subscription metadata — moved from legacy clients.portal_*.
    portalSubscriptionId: text("portal_subscription_id"),
    portalSubscriptionStatus: text("portal_subscription_status", {
      enum: ["none", "trialing", "active", "past_due", "canceled", "incomplete"],
    })
      .notNull()
      .default("none"),
    portalCurrentPeriodEnd: timestamp("portal_current_period_end", { withTimezone: true }),
    // Phase 9: organization profile fields collected by the onboarding wizard.
    // Updates to these are restricted to owner/admin members on the api side;
    // per-step wizard progress lives on `organization_members` (per user).
    website: text("website"),
    industry: text("industry"),
    clientType: text("client_type", {
      enum: ["agency", "startup", "enterprise", "healthcare", "consultancy", "other"],
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    clerkOrgIdx: index("organizations_clerk_org_idx").on(t.clerkOrgId),
    primaryEmailIdx: index("organizations_primary_email_idx").on(t.primaryEmail),
  }),
);

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
