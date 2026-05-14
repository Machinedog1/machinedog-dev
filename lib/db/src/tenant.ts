/**
 * Tenant-context helpers for the Phase 0 foundation slice.
 *
 * The codebase is in a transitional state: the legacy `clients` table is
 * still the primary tenant entity for every existing route, but a new
 * `organizations` + `organization_members` pair has been added to support
 * Clerk-managed multi-tenant SaaS going forward.
 *
 * These helpers bridge the two worlds:
 *
 *   - `resolveOrganizationForClient(clientId)` — given a legacy clients.id,
 *     return the mirrored organizations row that was backfilled for it.
 *   - `resolveOrganizationForClerkUser(clerkUserId)` — given a Clerk user id,
 *     return the active organization membership.
 *
 * NEW CODE should prefer organizationId everywhere. LEGACY CODE keeps using
 * clientId; the helpers let us migrate route by route without a big-bang
 * rename. See `docs/phase-0-followups.md` for the planned removal path.
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
  member: OrganizationMember | null;
  /** How this tenant was resolved. Useful for audit logs + debugging. */
  source: "legacy_client" | "clerk_user" | "demo";
}

/**
 * Look up the organization mirrored from a legacy clients.id. Returns null if
 * the client hasn't been backfilled yet (shouldn't happen after the Phase 0
 * migration but is handled defensively).
 */
export async function resolveOrganizationForClient(
  clientId: number,
): Promise<ResolvedTenant | null> {
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.legacyClientId, clientId));
  if (!org) return null;
  const [member] = await db
    .select()
    .from(organizationMembersTable)
    .where(
      and(
        eq(organizationMembersTable.organizationId, org.id),
        eq(organizationMembersTable.legacyClientId, clientId),
      ),
    );
  return { organization: org, member: member ?? null, source: "legacy_client" };
}

/**
 * Look up the organization for a Clerk user id. In Phase 0 the UI only allows
 * one membership per user, so we return the first active one. Phase 7+ will
 * support multi-org switching with an explicit "active org" cookie/header.
 */
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
