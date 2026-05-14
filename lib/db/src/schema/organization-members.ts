import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

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
    clerkUserId: text("clerk_user_id"),
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
    orgClerkUserUnique: uniqueIndex("organization_members_org_clerk_user_uniq").on(
      t.organizationId,
      t.clerkUserId,
    ),
    orgEmailUnique: uniqueIndex("organization_members_org_email_uniq").on(
      t.organizationId,
      t.email,
    ),
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
