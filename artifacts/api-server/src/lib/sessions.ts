import type { Request, Response } from "express";
import { eq, lt } from "drizzle-orm";
import { db, sessionsTable, type Session } from "@workspace/db";
import { generateSecureToken } from "./passwords";

export const SESSION_COOKIE_NAME = "md_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // renew if <7 days remaining

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function createSession(
  clientId: number,
  meta?: { userAgent?: string; ipAddress?: string },
): Promise<Session> {
  const id = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [row] = await db
    .insert(sessionsTable)
    .values({
      id,
      clientId,
      expiresAt,
      userAgent: meta?.userAgent ?? null,
      ipAddress: meta?.ipAddress ?? null,
    })
    .returning();
  return row;
}

export async function getSessionById(id: string): Promise<Session | null> {
  if (!id || id.length < 16) return null;
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
    return null;
  }
  return row;
}

export async function touchSession(session: Session): Promise<Session> {
  const now = Date.now();
  const remaining = session.expiresAt.getTime() - now;
  const updates: Partial<Session> = { lastSeenAt: new Date(now) };
  if (remaining < SESSION_RENEW_THRESHOLD_MS) {
    updates.expiresAt = new Date(now + SESSION_TTL_MS);
  }
  const [row] = await db
    .update(sessionsTable)
    .set(updates)
    .where(eq(sessionsTable.id, session.id))
    .returning();
  return row;
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
}

export async function deleteAllSessionsForClient(clientId: number): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.clientId, clientId));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
}

export function setSessionCookie(res: Response, sessionId: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
  });
}

export function readSessionIdFromRequest(req: Request): string | null {
  // Prefer cookie (web)
  const cookieVal = (req as unknown as { cookies?: Record<string, string> }).cookies?.[
    SESSION_COOKIE_NAME
  ];
  if (cookieVal) return cookieVal;
  // Fall back to bearer token (mobile)
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  return null;
}
