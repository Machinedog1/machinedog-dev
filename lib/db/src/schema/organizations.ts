import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Phase 0 foundation: `organizations` is the new tenant entity that will
 * eventually replace `clients`. For this slice it lives ALONGSIDE clients —
 * every existing client is mirrored 1:1 into an organizations row, but the
 * old clients table and all `client_id` FKs remain intact so existing routes
 * keep working unchanged.
 *
 * Plan tier / billing fields are placeholders here; Phase 1 fills them in.
 */
export const organizationsTable = pgTable(
  "organizations",
  {
    id: serial("id").primaryKey(),
    // The legacy clients.id this org was backfilled from. Lets us bridge old
    // routes (which still query by client_id) and new routes (which query by
    // organization_id). Nullable so future organizations created via Clerk
    // webhook don't need a clients row.
    legacyClientId: integer("legacy_client_id").unique(),
    // Clerk organization ID (org_xxx). Null until the user/operator promotes
    // this org to a real Clerk organization.
    clerkOrgId: text("clerk_org_id").unique(),
    clerkOrgSlug: text("clerk_org_slug").unique(),
    // Display name — for backfilled rows we use the client's email until the
    // user provides a proper org name via Clerk.
    name: text("name").notNull(),
    // Primary contact email for the org. Backfill = clients.email.
    primaryEmail: text("primary_email").notNull(),
    // Plan tier / billing — placeholders for Phase 1.
    planType: text("plan_type", {
      enum: ["free", "starter", "pro", "team", "enterprise", "healthcare"],
    })
      .notNull()
      .default("free"),
    planStatus: text("plan_status", {
      enum: ["none", "trialing", "active", "past_due", "canceled", "incomplete"],
    })
      .notNull()
      .default("none"),
    // Healthcare / BAA tracking — placeholder until Phase 8.
    baaStatus: text("baa_status", {
      enum: ["not_required", "pending", "active", "expired"],
    })
      .notNull()
      .default("not_required"),
    stripeCustomerId: text("stripe_customer_id"),
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
