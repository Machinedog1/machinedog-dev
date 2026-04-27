import { type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, clientsTable, projectMembersTable, type Client } from "@workspace/db";

declare module "express-serve-static-core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    userId?: string;
    client?: Client;
  }
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId ?? auth?.sessionClaims?.userId;
  if (!userId || typeof userId !== "string") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

async function fetchClerkUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    return (primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null);
  } catch {
    return null;
  }
}

export async function loadOrCreateClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const existing = await db.select().from(clientsTable).where(eq(clientsTable.userId, req.userId));
  if (existing[0]) {
    req.client = existing[0];
    if (existing[0].status === "active") {
      await attachPendingProjectMemberships(existing[0].id, existing[0].email);
    }
    next();
    return;
  }
  const email = await fetchClerkUserEmail(req.userId);
  if (!email) {
    res.status(401).json({ error: "Could not resolve email for current user" });
    return;
  }
  const lowered = email.toLowerCase();

  // Check for an existing pre-invited client record by email (status: 'invited')
  const invited = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.email, lowered));

  if (invited[0] && invited[0].status === "invited") {
    const [updated] = await db
      .update(clientsTable)
      .set({ userId: req.userId, status: "active", isAdmin: invited[0].isAdmin || ADMIN_EMAILS.includes(lowered) })
      .where(eq(clientsTable.id, invited[0].id))
      .returning();
    req.client = updated;
    await attachPendingProjectMemberships(updated.id, lowered);
    next();
    return;
  }

  // Activate via pending project invite even without an admin "client invite" row.
  const pendingMember = await db
    .select()
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "pending"),
      ),
    )
    .limit(1);

  if (pendingMember.length > 0) {
    const [created] = await db
      .insert(clientsTable)
      .values({
        userId: req.userId,
        email: lowered,
        isAdmin: ADMIN_EMAILS.includes(lowered),
        status: "active",
        tokenBalance: 0,
      })
      .returning();
    req.client = created;
    await attachPendingProjectMemberships(created.id, lowered);
    next();
    return;
  }

  // First-ever sign-in with no invite: only allow if email is in ADMIN_EMAILS (bootstrap owner)
  // Otherwise create a 'suspended' record so the UI can render a not-invited screen.
  const isAdmin = ADMIN_EMAILS.includes(lowered);
  const [created] = await db
    .insert(clientsTable)
    .values({
      userId: req.userId,
      email: lowered,
      isAdmin,
      status: isAdmin ? "active" : "suspended",
      tokenBalance: isAdmin ? 1_000_000 : 0,
    })
    .returning();
  req.client = created;
  if (isAdmin) {
    await attachPendingProjectMemberships(created.id, lowered);
  }
  next();
}

async function attachPendingProjectMemberships(clientId: number, lowered: string): Promise<void> {
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

export function requireActiveClient(req: Request, res: Response, next: NextFunction): void {
  if (!req.client) {
    res.status(401).json({ error: "No client record" });
    return;
  }
  if (req.client.status !== "active") {
    res.status(403).json({ error: "Account not active", status: req.client.status });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.client?.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
