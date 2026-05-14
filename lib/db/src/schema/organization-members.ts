import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { clientsTable } from "./clients";

/**
 * Membership join table — schema is multi-org-per-user-ready (no unique on
 * clerkUserId alone), but the Phase 0 UI only ever creates one membership
 * per user. Phase 7+ will add a membership-switching UI.
 *
 * `legacyClientId` lets us look up a member by the existing clients.id
 * during the parallel-auth window so old code paths still resolve a tenant.
 */
export const ORGANIZATION_MEMBER_ROLES = [
  "owner",
  "admin",
  "developer",
  "viewer",
  "billing_admin",
] as const;
export type OrganizationMemberRole = (typeof ORGANIZATION_MEMBER_ROLES)[number];

export const organizationMembersTable = pgTable(
  "organization_members",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    // Clerk user id (user_xxx). Null only during Phase 0 backfill rows that
    // haven't yet been linked to a Clerk identity.
    clerkUserId: text("clerk_user_id"),
    // Bridge to legacy auth: every backfilled member points at the legacy
    // clients.id so existing session-based requests can still resolve their
    // active organization.
    legacyClientId: integer("legacy_client_id").references(() => clientsTable.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    role: text("role", { enum: ORGANIZATION_MEMBER_ROLES })
      .notNull()
      .default("owner"),
    status: text("status", { enum: ["pending", "active", "removed"] })
      .notNull()
      .default("active"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => ({
    // Same Clerk user can only appear once per organization.
    orgClerkUserUnique: uniqueIndex("organization_members_org_clerk_user_uniq").on(
      t.organizationId,
      t.clerkUserId,
    ),
    // Same email can only appear once per organization (email-based invites).
    orgEmailUnique: uniqueIndex("organization_members_org_email_uniq").on(
      t.organizationId,
      t.email,
    ),
    // Bridge lookup: find an org by the legacy clients.id during parallel auth.
    legacyClientIdx: index("organization_members_legacy_client_idx").on(t.legacyClientId),
    clerkUserIdx: index("organization_members_clerk_user_idx").on(t.clerkUserId),
  }),
);

export const insertOrganizationMemberSchema = createInsertSchema(organizationMembersTable).omit({
  id: true,
  invitedAt: true,
  acceptedAt: true,
});
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type OrganizationMember = typeof organizationMembersTable.$inferSelect;
