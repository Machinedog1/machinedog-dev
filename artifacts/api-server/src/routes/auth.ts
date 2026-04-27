import { Router, type IRouter } from "express";
import { eq, gt, and } from "drizzle-orm";
import { z } from "zod";
import { db, clientsTable } from "@workspace/db";
import { hashPassword, verifyPassword, generateSecureToken } from "../lib/passwords";
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  deleteSession,
  deleteAllSessionsForClient,
  readSessionIdFromRequest,
} from "../lib/sessions";
import {
  attachPendingProjectMemberships,
  isAdminEmail,
  requireAuth,
} from "../lib/auth";
import { sendPasswordResetEmail, sendInviteEmail } from "../lib/mailer";

const router: IRouter = Router();

const EmailSchema = z.string().trim().toLowerCase().email().max(320);
const PasswordSchema = z.string().min(8).max(1024);

const SignInBody = z.object({ email: EmailSchema, password: PasswordSchema });
const AcceptInviteBody = z.object({
  token: z.string().min(16).max(128),
  password: PasswordSchema,
});
const ForgotPasswordBody = z.object({ email: EmailSchema });
const ResetPasswordBody = z.object({
  token: z.string().min(16).max(128),
  password: PasswordSchema,
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function reqMeta(req: Parameters<typeof createSession>[1] extends infer X ? unknown : never) {
  // dummy to keep typescript happy
  return req;
}

function getMeta(req: import("express").Request) {
  return {
    userAgent: (req.headers["user-agent"] ?? "").toString().slice(0, 512),
    ipAddress: (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "")
      .toString()
      .split(",")[0]
      .trim()
      .slice(0, 64),
  };
}

/**
 * POST /api/auth/sign-in — email + password → session cookie + bearer token
 */
router.post("/auth/sign-in", async (req, res): Promise<void> => {
  const parsed = SignInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or password format" });
    return;
  }
  const { email, password } = parsed.data;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.email, email));
  if (!client || !client.passwordHash) {
    // Use the same error to avoid revealing whether the email exists
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (client.status === "suspended") {
    res.status(403).json({ error: "Account suspended" });
    return;
  }
  if (client.status === "invited") {
    res.status(403).json({
      error:
        "Your invite has not been accepted yet. Please use the link from your invitation email to set a password.",
    });
    return;
  }

  const ok = await verifyPassword(password, client.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const session = await createSession(client.id, getMeta(req));
  setSessionCookie(res, session.id, session.expiresAt);
  res.json({
    success: true,
    sessionToken: session.id,
    client: { id: client.id, email: client.email, isAdmin: client.isAdmin },
  });
});

/**
 * POST /api/auth/sign-out — invalidates the current session.
 */
router.post("/auth/sign-out", async (req, res): Promise<void> => {
  const sessionId = readSessionIdFromRequest(req);
  if (sessionId) {
    await deleteSession(sessionId);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

/**
 * POST /api/auth/accept-invite — invitee sets a password using the invite token,
 * gets logged in immediately.
 */
router.post("/auth/accept-invite", async (req, res): Promise<void> => {
  const parsed = AcceptInviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid token or password" });
    return;
  }
  const { token, password } = parsed.data;

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.inviteToken, token),
        gt(clientsTable.inviteTokenExpiresAt, new Date()),
      ),
    );
  if (!client) {
    res.status(400).json({ error: "This invite link is invalid or expired." });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(clientsTable)
    .set({
      passwordHash,
      status: "active",
      inviteToken: null,
      inviteTokenExpiresAt: null,
      isAdmin: client.isAdmin || isAdminEmail(client.email),
    })
    .where(eq(clientsTable.id, client.id))
    .returning();

  await attachPendingProjectMemberships(updated.id, updated.email);

  const session = await createSession(updated.id, getMeta(req));
  setSessionCookie(res, session.id, session.expiresAt);
  res.json({
    success: true,
    sessionToken: session.id,
    client: { id: updated.id, email: updated.email, isAdmin: updated.isAdmin },
  });
});

/**
 * POST /api/auth/forgot-password — generate a reset token, email it.
 * Always returns 200 to avoid leaking whether an email is registered.
 */
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.json({ success: true });
    return;
  }
  const { email } = parsed.data;
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.email, email));
  if (!client) {
    res.json({ success: true });
    return;
  }

  const token = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db
    .update(clientsTable)
    .set({ passwordResetToken: token, passwordResetExpiresAt: expiresAt })
    .where(eq(clientsTable.id, client.id));

  await sendPasswordResetEmail({ to: client.email, token, log: req.log });
  res.json({ success: true });
});

/**
 * POST /api/auth/reset-password — set a new password using a reset token.
 */
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid token or password" });
    return;
  }
  const { token, password } = parsed.data;

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.passwordResetToken, token),
        gt(clientsTable.passwordResetExpiresAt, new Date()),
      ),
    );
  if (!client) {
    res.status(400).json({ error: "This reset link is invalid or expired." });
    return;
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(clientsTable)
    .set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      status: client.status === "invited" ? "active" : client.status,
    })
    .where(eq(clientsTable.id, client.id));

  // Invalidate all existing sessions for security, then create a fresh one
  await deleteAllSessionsForClient(client.id);
  const session = await createSession(client.id, getMeta(req));
  setSessionCookie(res, session.id, session.expiresAt);
  res.json({
    success: true,
    sessionToken: session.id,
    client: { id: client.id, email: client.email, isAdmin: client.isAdmin },
  });
});

/**
 * POST /api/auth/change-password — change password while signed in.
 * Requires currentPassword + newPassword. Invalidates other sessions.
 */
router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const c = req.dbClient!;
  const body = req.body as { currentPassword?: unknown; newPassword?: unknown };
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Invalid password" });
    return;
  }

  if (!c.passwordHash) {
    res.status(400).json({
      error: "No password set on this account. Use forgot-password to set one.",
    });
    return;
  }
  const ok = await verifyPassword(currentPassword, c.passwordHash);
  if (!ok) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(clientsTable)
    .set({ passwordHash: newHash })
    .where(eq(clientsTable.id, c.id));

  // Invalidate every other session, mint a fresh one for this client.
  await deleteAllSessionsForClient(c.id);
  const session = await createSession(c.id, getMeta(req));
  setSessionCookie(res, session.id, session.expiresAt);
  res.json({ success: true, sessionToken: session.id });
});

/**
 * GET /api/auth/me — return current session's client (or 401).
 */
router.get("/auth/me", requireAuth, (req, res) => {
  const c = req.dbClient!;
  res.json({
    client: {
      id: c.id,
      email: c.email,
      isAdmin: c.isAdmin,
      status: c.status,
      tokenBalance: c.tokenBalance,
      portalSubscriptionStatus: c.portalSubscriptionStatus,
      portalCurrentPeriodEnd: c.portalCurrentPeriodEnd,
    },
  });
});

export default router;

// Helpers re-exported for admin invite flow
export { INVITE_TTL_MS };

void reqMeta;
