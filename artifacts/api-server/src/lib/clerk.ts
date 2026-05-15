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
import { resolveOrganizationForClerkUser } from "@workspace/db";
import type { Organization, OrganizationMember } from "@workspace/db";
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
      const tenant = await resolveOrganizationForClerkUser(req.clerkAuth.userId);
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
