/**
 * Clerk-backed auth + org resolution. Clerk is REQUIRED — there is no
 * cookie-session fallback. The middleware:
 *
 *   1. Validates the Clerk session token (Authorization Bearer or `__session`
 *      cookie) via @clerk/express.
 *   2. Resolves the active organization via the `organization_members` join
 *      on Clerk user id and attaches `req.organization` + `req.organizationMember`.
 *   3. Populates a `req.dbClient` compatibility shim (`{ id: org.id, email,
 *      isAdmin, tokenBalance, status, stripeCustomerId, portal* }`) so legacy
 *      route code continues to work after the clients-table cutover.
 *
 * If CLERK_SECRET_KEY is unset the api-server still boots but every protected
 * request will be unauthenticated (no org resolved) — calls to
 * `requireAuth` / `requireOrganization` will return 401.
 */

import type { Request, Response, NextFunction } from "express";
import { resolveOrganizationForClerkUser } from "@workspace/db";
import type { Organization, OrganizationMember } from "@workspace/db";
import { logger } from "./logger";
import { recordAuditEventAsync, reqAuditMeta } from "./audit";

// Per-process in-memory de-dup so we don't write a `signin` audit row on
// every authenticated API request — only on the first resolved request for
// a (clerk userId, organizationId) pair within the TTL window.
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

// Compat shape kept on `req.dbClient` so existing route code that reads
// `req.dbClient.id` / `.email` / `.isAdmin` / `.tokenBalance` etc. keeps
// working. `id` here IS the organization id (one-tenant-per-request).
export interface DbClientCompat {
  id: number;
  email: string;
  isAdmin: boolean;
  status: "active" | "suspended" | "invited";
  tokenBalance: number;
  totalTokensUsed: number;
  stripeCustomerId: string | null;
  portalSubscriptionId: string | null;
  portalSubscriptionStatus:
    | "none"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "incomplete";
  portalCurrentPeriodEnd: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      clerkAuth?: { userId: string; sessionId: string | null };
      organization?: Organization;
      organizationMember?: OrganizationMember | null;
      /** Compat shim built from organization+member. */
      dbClient?: DbClientCompat;
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

function buildDbClientCompat(
  org: Organization,
  member: OrganizationMember,
): DbClientCompat {
  return {
    id: org.id,
    email: member.email,
    isAdmin: member.role === "admin" || member.role === "owner",
    status: org.status,
    tokenBalance: org.tokenBalance,
    totalTokensUsed: org.totalTokensUsed,
    stripeCustomerId: org.stripeCustomerId,
    portalSubscriptionId: org.portalSubscriptionId,
    portalSubscriptionStatus: org.portalSubscriptionStatus,
    portalCurrentPeriodEnd: org.portalCurrentPeriodEnd,
  };
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
    const auth = (req as unknown as { auth?: { userId?: string; sessionId?: string | null } })
      .auth;
    if (auth?.userId) {
      req.clerkAuth = { userId: auth.userId, sessionId: auth.sessionId ?? null };
    }
    // TEMP DIAGNOSTIC: log what Clerk middleware actually saw on /auth/me so we
    // can debug the prod 401 flood. Remove once cutover is verified.
    if (req.originalUrl.startsWith("/api/auth/me") || req.url.startsWith("/api/auth/me")) {
      const cookieHeader = req.headers.cookie ?? "";
      const cookieNames = cookieHeader
        .split(";")
        .map((c) => c.trim().split("=")[0])
        .filter(Boolean);
      const authHeader = req.headers.authorization ?? "";
      logger.info(
        {
          authHeaderPresent: !!authHeader,
          authHeaderPrefix: authHeader.slice(0, 12),
          cookieNames,
          clerkUserId: req.clerkAuth?.userId ?? null,
          clerkAuthStatusHeader: res.getHeader("x-clerk-auth-status") ?? null,
          clerkAuthReasonHeader: res.getHeader("x-clerk-auth-reason") ?? null,
          clerkAuthMessageHeader: res.getHeader("x-clerk-auth-message") ?? null,
          host: req.headers.host,
          origin: req.headers.origin ?? null,
        },
        "DIAG /auth/me clerk middleware result",
      );
    }
  }

  if (req.clerkAuth?.userId) {
    try {
      const tenant = await resolveOrganizationForClerkUser(req.clerkAuth.userId);
      if (tenant) {
        req.organization = tenant.organization;
        req.organizationMember = tenant.member;
        req.dbClient = buildDbClientCompat(tenant.organization, tenant.member);
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
