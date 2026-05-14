/**
 * Auth surface — Clerk-only after the cutover.
 *
 * Clerk owns sign-in / sign-up / password / invite flows in the portal. This
 * router only exposes `/auth/me` so the React app can resolve the active
 * organization + member tied to the current Clerk session.
 */

import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, (req, res): void => {
  // req.organization + req.organizationMember + req.dbClient are populated
  // by loadClerkAndOrganization in app.ts.
  const org = req.organization!;
  const member = req.organizationMember!;
  res.json({
    organization: {
      id: org.id,
      name: org.name,
      primaryEmail: org.primaryEmail,
      planType: org.planType,
      planStatus: org.planStatus,
      status: org.status,
      tokenBalance: org.tokenBalance,
      totalTokensUsed: org.totalTokensUsed,
      stripeCustomerId: org.stripeCustomerId,
      portalSubscriptionStatus: org.portalSubscriptionStatus,
      portalCurrentPeriodEnd: org.portalCurrentPeriodEnd,
      clerkOrgId: org.clerkOrgId,
    },
    member: {
      id: member.id,
      email: member.email,
      role: member.role,
      isAdmin: member.role === "admin" || member.role === "owner",
      status: member.status,
    },
    // Legacy "client" alias for compatibility with not-yet-migrated portal
    // pages; remove once frontend cutover lands.
    client: {
      id: org.id,
      email: member.email,
      isAdmin: member.role === "admin" || member.role === "owner",
      status: org.status,
      tokenBalance: org.tokenBalance,
      totalTokensUsed: org.totalTokensUsed,
      stripeCustomerId: org.stripeCustomerId,
      portalSubscriptionStatus: org.portalSubscriptionStatus,
      portalCurrentPeriodEnd: org.portalCurrentPeriodEnd,
    },
  });
});

export default router;
