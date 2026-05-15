/**
 * Auth guards + helpers for routes after the Clerk cutover.
 *
 * `loadClerkAndOrganization` (lib/clerk.ts) populates `req.organization` and
 * `req.organizationMember` from the validated Clerk session. The legacy
 * cookie-session path and the `req.dbClient` compat shim are gone.
 *
 * Two helpers exist for the routes that previously read flat `client.*`
 * fields:
 *
 *   - `isOrgAdmin(member)`  — owner/admin role check
 *   - `reqClient(req)`      — flat snapshot { id, email, isAdmin, status,
 *                             tokenBalance, totalTokensUsed, stripeCustomerId,
 *                             portalSubscriptionId, portalSubscriptionStatus,
 *                             portalCurrentPeriodEnd } built on demand
 */

import { type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  projectMembersTable,
  organizationMembersTable,
  type Organization,
  type OrganizationMember,
} from "@workspace/db";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isOrgAdmin(member: OrganizationMember | null | undefined): boolean {
  if (!member) return false;
  return member.role === "owner" || member.role === "admin";
}

export interface ReqClientShape {
  id: number;
  email: string;
  isAdmin: boolean;
  status: Organization["status"];
  tokenBalance: number;
  totalTokensUsed: number;
  stripeCustomerId: string | null;
  portalSubscriptionId: string | null;
  portalSubscriptionStatus: Organization["portalSubscriptionStatus"];
  portalCurrentPeriodEnd: Date | null;
}

/**
 * Build the flat `client`-shaped snapshot route handlers historically used
 * (`client.id`, `client.email`, `client.isAdmin`, …). Throws if called on a
 * request that has not been authenticated — guard with `requireAuth` first.
 */
export function reqClient(req: Request): ReqClientShape {
  const org = req.organization;
  const member = req.organizationMember;
  if (!org || !member) {
    throw new Error("reqClient called without an authenticated organization");
  }
  return {
    id: org.id,
    email: member.email,
    isAdmin: isOrgAdmin(member),
    status: org.status,
    tokenBalance: org.tokenBalance,
    totalTokensUsed: org.totalTokensUsed,
    stripeCustomerId: org.stripeCustomerId,
    portalSubscriptionId: org.portalSubscriptionId,
    portalSubscriptionStatus: org.portalSubscriptionStatus,
    portalCurrentPeriodEnd: org.portalCurrentPeriodEnd,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.organization || !req.organizationMember) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireActiveClient(req: Request, res: Response, next: NextFunction): void {
  if (!req.organization || !req.organizationMember) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.organization.status !== "active") {
    res.status(403).json({ error: "Account not active", status: req.organization.status });
    return;
  }
  next();
}

/**
 * Org-level admin gate (owner/admin role on the active organization).
 * NOT platform staff — see `requirePlatformAdmin` for that.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.organization || !req.organizationMember) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isOrgAdmin(req.organizationMember)) {
    res.status(403).json({ error: "Org owner or admin role required" });
    return;
  }
  next();
}

// Phase 8 alias: makes intent explicit at compliance call sites.
export const requireOrgOwnerOrAdmin = requireAdmin;

/**
 * Platform-staff admin gate. Backed by the ADMIN_EMAILS allowlist.
 */
export function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.organization || !req.organizationMember) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const email = req.organizationMember.email ?? "";
  if (!email || !isAdminEmail(email)) {
    res.status(403).json({ error: "Platform admin access required" });
    return;
  }
  next();
}

/**
 * When a project member invite has been pending for an email that now matches
 * the signed-in member, attach their organization to the membership row.
 */
export async function attachPendingProjectMemberships(
  organizationId: number,
  email: string,
): Promise<void> {
  const lowered = email.toLowerCase();
  await db
    .update(projectMembersTable)
    .set({ organizationId, status: "active", acceptedAt: new Date() })
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "pending"),
      ),
    );
  await db
    .update(organizationMembersTable)
    .set({ status: "active", acceptedAt: new Date() })
    .where(
      and(
        eq(organizationMembersTable.email, lowered),
        eq(organizationMembersTable.status, "pending"),
      ),
    );
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
