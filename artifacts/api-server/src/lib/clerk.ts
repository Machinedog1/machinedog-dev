/**
 * Clerk-aware authentication middleware (Phase 0 foundation, parallel mode).
 *
 * This middleware runs ALONGSIDE the existing `loadSessionAndClient` cookie
 * session middleware. It does not replace it. The contract:
 *
 *   - When `CLERK_SECRET_KEY` is unset, this middleware is a no-op. Existing
 *     session-based auth continues to work unchanged. The portal renders a
 *     "Demo auth mode" banner so it's obvious Clerk isn't active.
 *
 *   - When `CLERK_SECRET_KEY` is set, this middleware validates the Clerk
 *     session token from `Authorization: Bearer <jwt>` (or `__session`
 *     cookie) and attaches `req.clerkAuth = { userId, sessionId }` plus
 *     `req.organization` / `req.organizationMember` resolved through the
 *     `organization_members` join table.
 *
 *   - It NEVER overwrites `req.dbClient` / `req.session` set by the legacy
 *     middleware — both can coexist on the same request during the parallel
 *     window.
 *
 * Routes that have been migrated to organization-scoped tenancy can call
 * `requireOrganization` to require a resolved Clerk-backed org. Routes that
 * still use legacy auth keep using `requireAuth` / `requireActiveClient`.
 *
 * See `docs/phase-0-followups.md` for the cutover plan that eventually
 * deletes the legacy path entirely.
 */

import type { Request, Response, NextFunction } from "express";
import { resolveOrganizationForClerkUser, resolveOrganizationForClient } from "@workspace/db";
import type { Organization, OrganizationMember } from "@workspace/db";
import { logger } from "./logger";

declare module "express-serve-static-core" {
  interface Request {
    clerkAuth?: { userId: string; sessionId: string | null };
    organization?: Organization;
    organizationMember?: OrganizationMember | null;
    /** "clerk" | "legacy_session" | "demo" — how the org was resolved. */
    tenantSource?: "clerk" | "legacy_session" | "demo";
  }
}

export function isClerkConfigured(): boolean {
  return !!process.env.CLERK_SECRET_KEY;
}

/**
 * Lazy import of @clerk/express. The package is loaded only when configured
 * so the api-server can boot in demo/local mode without it installed (and
 * without paying the import cost on every cold start).
 */
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
      "Clerk SDK not installed — skipping Clerk middleware",
    );
    return null;
  }
}

/**
 * Phase 0 parallel-auth resolver. Runs after `loadSessionAndClient`. If a
 * Clerk session is present, resolves and attaches the organization. If only
 * a legacy session is present, ALSO resolves the organization via the
 * legacyClientId bridge so new code paths can read `req.organization`
 * regardless of which auth path the user came in on.
 *
 * Errors are swallowed — auth failures must not 500. Routes that need a
 * resolved org call `requireOrganization` to enforce.
 */
export async function loadClerkAndOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 1. Run Clerk's middleware if configured. It populates `req.auth`.
  if (isClerkConfigured()) {
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
    }
  }

  // 2. Resolve organization. Prefer Clerk identity when present, fall back to
  //    the legacy session's clients.id via the bridge.
  try {
    if (req.clerkAuth?.userId) {
      const tenant = await resolveOrganizationForClerkUser(req.clerkAuth.userId);
      if (tenant) {
        req.organization = tenant.organization;
        req.organizationMember = tenant.member;
        req.tenantSource = "clerk";
      }
    } else if (req.dbClient) {
      const tenant = await resolveOrganizationForClient(req.dbClient.id);
      if (tenant) {
        req.organization = tenant.organization;
        req.organizationMember = tenant.member;
        req.tenantSource = "legacy_session";
      }
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "Failed to resolve organization for request",
    );
  }
  next();
}

export function requireOrganization(req: Request, res: Response, next: NextFunction): void {
  if (!req.organization) {
    res.status(401).json({ error: { code: "no_organization", message: "Organization context required" } });
    return;
  }
  next();
}
