/**
 * Tenant-context helpers. Resolves a Clerk user id to its active organization
 * via the `organization_members` join table.
 */

import { eq, and } from "drizzle-orm";
import { db } from "./index";
import { organizationsTable, type Organization } from "./schema/organizations";
import {
  organizationMembersTable,
  type OrganizationMember,
} from "./schema/organization-members";

export interface ResolvedTenant {
  organization: Organization;
  member: OrganizationMember;
  source: "clerk_user";
}

export async function resolveOrganizationForClerkUser(
  clerkUserId: string,
): Promise<ResolvedTenant | null> {
  const [member] = await db
    .select()
    .from(organizationMembersTable)
    .where(
      and(
        eq(organizationMembersTable.clerkUserId, clerkUserId),
        eq(organizationMembersTable.status, "active"),
      ),
    );
  if (!member) return null;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, member.organizationId));
  if (!org) return null;
  return { organization: org, member, source: "clerk_user" };
}
