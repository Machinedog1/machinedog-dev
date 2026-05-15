/**
 * Clerk-backed auth + org resolution. Clerk is REQUIRED — there is no
 * cookie-session fallback. The middleware:
 *
 *   1. Validates the Clerk session token (Authorization Bearer or `__session`
 *      cookie) via @clerk/express.
 *   2. Resolves the active organization via the `organization_members` join
 *      on Clerk user id and attaches `req.organization` + `req.organizationMember`.
 *
 * If CLERK_SECRET_KEY is unset the api-server still boots but every protected
 * request will be unauthenticated (no org resolved) — calls to
 * `requireAuth` / `requireOrganization` will return 401.
 */

import type { Request, Response, NextFunction } from "express";
import {
  db,
  organizationsTable,
  organizationMembersTable,
  resolveOrganizationForClerkUser,
} from "@workspace/db";
import type { Organization, OrganizationMember } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { recordAuditEventAsync, reqAuditMeta } from "./audit";

// Per-process in-memory de-dup so we don't write a `signin` audit row on
// every authenticated API request.
const signinDedup = new Map<string, number>();
const SIGNIN_DEDUP_TTL_MS = 30 * 60 * 1000;
function shouldRecordSignin(key: string): boolean {
  const now = Date.now();
  const last = signinDedup.get(key);
  if (last && now - last < SIGNIN_DEDUP_TTL_MS) return false;
  signinDedup.set(key, now);
  if (signinDedup.size > 5000) {
    for (const [k, t] of signinDedup) {
      if (now - t >= SIGNIN_DEDUP_TTL_MS) signinDedup.delete(k);
    }
  }
  return true;
}

declare global {
  namespace Express {
    interface Request {
      clerkAuth?: { userId: string; sessionId: string | null };
      organization?: Organization;
      organizationMember?: OrganizationMember | null;
    }
  }
}

export function isClerkConfigured(): boolean {
  return !!process.env.CLERK_SECRET_KEY;
}

let cachedClerkMiddleware: ((req: Request, res: Response, next: NextFunction) => void) | null =
  null;

async function getClerkMiddleware() {
  if (cachedClerkMiddleware) return cachedClerkMiddleware;
  try {
    const mod = await import("@clerk/express");
    cachedClerkMiddleware = mod.clerkMiddleware();
    return cachedClerkMiddleware;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "Clerk SDK not installed — Clerk middleware disabled",
    );
    return null;
  }
}

export async function loadClerkAndOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isClerkConfigured()) {
    next();
    return;
  }
  const mw = await getClerkMiddleware();
  if (mw) {
    await new Promise<void>((resolve) => {
      mw(req, res, () => resolve());
    });
    const auth = (req as unknown as { auth?: Record<string, unknown> }).auth;
    const userId = (auth?.userId as string | undefined) ?? undefined;
    const sessionId = (auth?.sessionId as string | null | undefined) ?? null;
    if (userId) {
      req.clerkAuth = { userId, sessionId };
    }
  }

  if (req.clerkAuth?.userId) {
    try {
      let tenant = await resolveOrganizationForClerkUser(req.clerkAuth.userId);
      if (!tenant) {
        tenant = await autoProvisionTenant(req.clerkAuth.userId);
      }
      if (tenant) {
        req.organization = tenant.organization;
        req.organizationMember = tenant.member;
        const dedupKey = `${req.clerkAuth.userId}:${tenant.organization.id}`;
        if (shouldRecordSignin(dedupKey)) {
          recordAuditEventAsync({
            organizationId: tenant.organization.id,
            actorOrganizationId: tenant.organization.id,
            actorEmail: tenant.member.email,
            category: "auth",
            action: "signin",
            targetType: "organization_member",
            targetId: String(tenant.member.id),
            metadata: { clerkUserId: req.clerkAuth.userId },
            ...reqAuditMeta(req),
          });
        }
      }
    } catch (err) {
      logger.warn(
        { err: (err as Error).message },
        "Failed to resolve organization for Clerk user",
      );
    }
  }
  next();
}

export function requireOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.organization) {
    res
      .status(401)
      .json({ error: { code: "no_organization", message: "Organization context required" } });
    return;
  }
  next();
}

/**
 * First-time sign-in: create a personal organization and owner membership
 * for the Clerk user so they can use the app immediately. Removes the old
 * invite-only restriction. Idempotent — if a member row was created by a
 * concurrent request, the unique index will reject the second insert and
 * we simply re-resolve.
 */
async function autoProvisionTenant(
  clerkUserId: string,
): Promise<{ organization: Organization; member: OrganizationMember; source: "clerk_user" } | null> {
  let email = "";
  let displayName = "";
  try {
    const mod = await import("@clerk/express");
    const user = await mod.clerkClient.users.getUser(clerkUserId);
    email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      "";
    displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.username ||
      email ||
      "New workspace";
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, clerkUserId },
      "Failed to fetch Clerk user for auto-provision",
    );
    return null;
  }
  if (!email) {
    logger.warn({ clerkUserId }, "Clerk user has no email — cannot auto-provision tenant");
    return null;
  }

  // Email-attach fallback: existing memberships (e.g. legacy users migrated
  // from the cookie-session era, or members invited by email before they
  // ever signed in) have `clerk_user_id = NULL`. Before minting a fresh
  // workspace, look for any membership matching this email and adopt the
  // first one — backfilling its clerk_user_id so future sign-ins resolve
  // directly. We pick the highest-privilege match (owner > admin > others)
  // and prefer active over pending.
  const lowered = email.toLowerCase();
  const existing = await db
    .select()
    .from(organizationMembersTable)
    .where(eq(organizationMembersTable.email, lowered));
  const adoptable = existing
    .filter((m) => !m.clerkUserId)
    .sort((a, b) => {
      const rolePriority = (r: string) =>
        r === "owner" ? 0 : r === "admin" ? 1 : r === "billing_admin" ? 2 : r === "developer" ? 3 : 4;
      const statusPriority = (s: string) => (s === "active" ? 0 : s === "pending" ? 1 : 2);
      const sa = statusPriority(a.status) - statusPriority(b.status);
      if (sa !== 0) return sa;
      return rolePriority(a.role) - rolePriority(b.role);
    })[0];
  if (adoptable) {
    const [member] = await db
      .update(organizationMembersTable)
      .set({ clerkUserId, status: "active", acceptedAt: adoptable.acceptedAt ?? new Date() })
      .where(eq(organizationMembersTable.id, adoptable.id))
      .returning();
    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, member.organizationId));
    if (org) {
      logger.info(
        { clerkUserId, organizationId: org.id, memberId: member.id, email },
        "Adopted existing email-matched membership for Clerk user",
      );
      return { organization: org, member, source: "clerk_user" };
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizationsTable)
        .values({
          name: `${displayName}'s workspace`,
          primaryEmail: email,
        })
        .returning();
      const [member] = await tx
        .insert(organizationMembersTable)
        .values({
          organizationId: org.id,
          clerkUserId,
          email,
          role: "owner",
          status: "active",
          acceptedAt: new Date(),
        })
        .returning();
      return { organization: org, member };
    });
    logger.info(
      { clerkUserId, organizationId: result.organization.id, email },
      "Auto-provisioned organization for new Clerk user",
    );
    return { organization: result.organization, member: result.member, source: "clerk_user" };
  } catch (err) {
    // Likely a race with a concurrent first request — try resolving again.
    logger.warn(
      { err: (err as Error).message, clerkUserId },
      "Auto-provision insert failed, attempting re-resolve",
    );
    return resolveOrganizationForClerkUser(clerkUserId);
  }
}

// Backfill a clerk_user_id onto an existing email-matched member when the
// user signs in for the first time after being invited by email. Returns the
// resolved tenant or null if no matching email was found. Currently unused —
// reserved for the invite flow once we wire it back up.
export async function _attachClerkUserToInvitedMember(
  clerkUserId: string,
  email: string,
): Promise<void> {
  await db
    .update(organizationMembersTable)
    .set({ clerkUserId, status: "active", acceptedAt: new Date() })
    .where(eq(organizationMembersTable.email, email.toLowerCase()));
}

export function requireOrgRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.organization || !req.organizationMember) {
      res.status(401).json({ error: { code: "no_organization", message: "Sign in required" } });
      return;
    }
    if (!roles.includes(req.organizationMember.role)) {
      res
        .status(403)
        .json({ error: { code: "forbidden", message: `Role required: ${roles.join(", ")}` } });
      return;
    }
    next();
  };
}
