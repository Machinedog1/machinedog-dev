/**
 * Auth guards for routes. After the clients-table cutover, all auth flows
 * through `loadClerkAndOrganization` which populates `req.organization`,
 * `req.organizationMember`, and a `req.dbClient` compat shim. The legacy
 * cookie-session path (loadSessionAndClient + lib/sessions.ts) is gone.
 *
 * The exported guards keep their pre-cutover names so route code does not
 * need to change. They all check the compat shim populated by the Clerk
 * middleware in app.ts.
 */

import { type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db, projectMembersTable, organizationMembersTable } from "@workspace/db";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.dbClient) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** No-op kept for backward compatibility. Org resolution happens in app.ts. */
export function loadOrCreateClient(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

export function requireActiveClient(req: Request, res: Response, next: NextFunction): void {
  if (!req.dbClient) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.dbClient.status !== "active") {
    res.status(403).json({ error: "Account not active", status: req.dbClient.status });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.dbClient) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.dbClient.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/**
 * When a project member invite has been pending for an email that now matches
 * the signed-in member, attach their organization to the membership row.
 * Called from project routes after a successful sign-in flow.
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
  // Same for org-level pending memberships invited under this email.
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
