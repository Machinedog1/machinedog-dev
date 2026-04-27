import { type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db, clientsTable, projectMembersTable } from "@workspace/db";
import { getSessionById, readSessionIdFromRequest, touchSession } from "./sessions";
// Side-effect import: registers `req.dbClient` and `req.session` typings on
// express-serve-static-core's Request interface. Do not remove.

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function loadSessionAndClient(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = readSessionIdFromRequest(req);
  if (!sessionId) {
    next();
    return;
  }
  const session = await getSessionById(sessionId);
  if (!session) {
    next();
    return;
  }
  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, session.clientId));
  if (!client) {
    next();
    return;
  }
  req.session = session;
  req.dbClient = client;
  // Touch session asynchronously — don't block the request
  touchSession(session).catch(() => {});
  // Pick up any pending project memberships in case the user accepted invites between requests
  if (client.status === "active") {
    attachPendingProjectMemberships(client.id, client.email).catch(() => {});
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.dbClient) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * Backward-compatibility no-op. The new global middleware
 * `loadSessionAndClient` already loads `req.dbClient` from the session, so
 * existing route guards `requireAuth, loadOrCreateClient, requireActiveClient`
 * continue to work unchanged.
 */
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
 * When a client accepts a project-member invite (or signs in with an email
 * that has pending project invites), automatically attach them to the project.
 */
export async function attachPendingProjectMemberships(
  clientId: number,
  email: string,
): Promise<void> {
  const lowered = email.toLowerCase();
  await db
    .update(projectMembersTable)
    .set({ clientId, status: "active", acceptedAt: new Date() })
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "pending"),
      ),
    );
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
