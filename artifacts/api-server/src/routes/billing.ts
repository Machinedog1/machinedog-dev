import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { requireAuth, requireActiveClient } from "../lib/auth";
import { requireOrganization } from "../lib/clerk";
import type { Organization } from "@workspace/db";

// The clerk middleware augments req with `organization` at runtime, but the
// global type augmentation in lib/clerk.ts is currently broken (pre-existing
// missing-module issue). Local alias keeps the route handlers fully typed.
type OrgRequest = Request & { organization: Organization };
import { publicOrigin } from "../lib/stripe";
import {
  PLANS,
  TOKEN_PACKS,
  findPlan,
  findTokenPack,
  planPriceId,
  tokenPackPriceId,
  type BillingInterval,
} from "../lib/plans";
import {
  isStripeConfigured,
  fetchCurrentSubscription,
  createPlanCheckoutSession,
  createTokenPackCheckoutSession,
  BillingNotConfiguredError,
  customerPortalLink,
  listInvoices,
} from "../lib/billing-service";
import { getBalance, listLedger, usageByCategory } from "../lib/token-service";

const router: IRouter = Router();

const PlanCheckoutBody = z.object({
  planType: z.enum(["starter", "pro", "business", "healthcare", "enterprise"]),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
});

const PackCheckoutBody = z.object({
  packKey: z.enum(["small", "medium", "large"]),
});

router.get("/billing/plans", async (_req, res): Promise<void> => {
  const data = PLANS.map((p) => ({
    key: p.key,
    name: p.name,
    tagline: p.tagline,
    priceMonthlyUsd: p.priceMonthlyUsd,
    priceAnnualUsd: p.priceAnnualUsd,
    monthlyTokenGrant: p.monthlyTokenGrant,
    popular: p.popular,
    features: p.features,
    requiresBaa: p.requiresBaa,
    stripePriceMonthlyId: planPriceId(p, "monthly"),
    stripePriceAnnualId: planPriceId(p, "annual"),
  }));
  res.json({ data, stripeConfigured: isStripeConfigured() });
});

router.get("/billing/token-packs", async (_req, res): Promise<void> => {
  const data = TOKEN_PACKS.map((p) => ({
    key: p.key,
    name: p.name,
    tokens: p.tokens,
    priceUsd: p.priceUsd,
    popular: p.popular,
    stripePriceId: tokenPackPriceId(p),
  }));
  res.json({ data, stripeConfigured: isStripeConfigured() });
});

router.get(
  "/billing/subscription",
  requireAuth,
  requireActiveClient,
  requireOrganization,
  async (req, res): Promise<void> => {
    const sub = await fetchCurrentSubscription((req as OrgRequest).organization.id);
    res.json({
      subscription: sub
        ? {
            id: sub.id,
            planType: sub.planType,
            billingInterval: sub.billingInterval,
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd === "true",
            source: sub.source,
          }
        : null,
      organization: {
        id: (req as OrgRequest).organization.id,
        name: (req as OrgRequest).organization.name,
        planType: (req as OrgRequest).organization.planType,
        planStatus: (req as OrgRequest).organization.planStatus,
        baaStatus: (req as OrgRequest).organization.baaStatus,
      },
      stripeConfigured: isStripeConfigured(),
    });
  },
);

router.post(
  "/billing/checkout",
  requireAuth,
  requireActiveClient,
  requireOrganization,
  async (req, res): Promise<void> => {
    const parsed = PlanCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const plan = findPlan(parsed.data.planType);
    if (!plan) {
      res.status(404).json({ error: "Unknown plan" });
      return;
    }
    // Guard: if the org already has an active/trialing/past_due subscription,
    // reject new-checkout starts so users cannot accidentally create a
    // parallel subscription (and get double-billed). Plan changes must go
    // through the customer portal.
    const existing = await fetchCurrentSubscription(
      (req as OrgRequest).organization.id,
    );
    if (
      existing &&
      (existing.status === "active" ||
        existing.status === "trialing" ||
        existing.status === "past_due")
    ) {
      res.status(409).json({
        error:
          "Organization already has an active subscription. Use the customer portal to change plans.",
        code: "subscription_already_active",
      });
      return;
    }
    const origin = publicOrigin(req);
    try {
      const result = await createPlanCheckoutSession({
        organizationId: (req as OrgRequest).organization.id,
        email: req.dbClient!.email,
        planType: parsed.data.planType,
        interval: parsed.data.interval as BillingInterval,
        successUrl: `${origin}/billing?status=success&plan=${plan.key}`,
        cancelUrl: `${origin}/billing?status=cancelled`,
        actorOrganizationId: req.dbClient!.id,
      });
      res.json({ url: result.url, mock: result.mock });
    } catch (err) {
      if (err instanceof BillingNotConfiguredError) {
        req.log.warn("Plan checkout rejected: billing not configured");
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      req.log.error({ err }, "Plan checkout failed");
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/billing/buy-tokens",
  requireAuth,
  requireActiveClient,
  requireOrganization,
  async (req, res): Promise<void> => {
    const parsed = PackCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const pack = findTokenPack(parsed.data.packKey);
    if (!pack) {
      res.status(404).json({ error: "Unknown token pack" });
      return;
    }
    const origin = publicOrigin(req);
    try {
      const result = await createTokenPackCheckoutSession({
        organizationId: (req as OrgRequest).organization.id,
        email: req.dbClient!.email,
        packKey: parsed.data.packKey,
        successUrl: `${origin}/tokens?status=success&pack=${pack.key}`,
        cancelUrl: `${origin}/tokens?status=cancelled`,
        actorOrganizationId: req.dbClient!.id,
      });
      res.json({ url: result.url, mock: result.mock });
    } catch (err) {
      if (err instanceof BillingNotConfiguredError) {
        req.log.warn("Token pack checkout rejected: billing not configured");
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      req.log.error({ err }, "Token pack checkout failed");
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/billing/portal",
  requireAuth,
  requireActiveClient,
  requireOrganization,
  async (req, res): Promise<void> => {
    const origin = publicOrigin(req);
    try {
      const url = await customerPortalLink({
        organizationId: (req as OrgRequest).organization.id,
        returnUrl: `${origin}/billing`,
      });
      if (!url) {
        res
          .status(503)
          .json({ error: "Stripe billing portal not available — sign up for a plan first." });
        return;
      }
      res.json({ url });
    } catch (err) {
      req.log.error({ err }, "Customer portal link failed");
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get(
  "/billing/invoices",
  requireAuth,
  requireActiveClient,
  requireOrganization,
  async (req, res): Promise<void> => {
    try {
      const invoices = await listInvoices((req as OrgRequest).organization.id);
      res.json({ data: invoices });
    } catch (err) {
      req.log.error({ err }, "List invoices failed");
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get(
  "/tokens/balance",
  requireAuth,
  requireActiveClient,
  requireOrganization,
  async (req, res): Promise<void> => {
    const balance = await getBalance((req as OrgRequest).organization.id);
    res.json({ balance });
  },
);

router.get(
  "/tokens/ledger",
  requireAuth,
  requireActiveClient,
  requireOrganization,
  async (req, res): Promise<void> => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    const rows = await listLedger((req as OrgRequest).organization.id, limit);
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount,
        balanceAfter: r.balanceAfter,
        description: r.description,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  },
);

router.get(
  "/tokens/usage",
  requireAuth,
  requireActiveClient,
  requireOrganization,
  async (req, res): Promise<void> => {
    const data = await usageByCategory((req as OrgRequest).organization.id);
    res.json({ data });
  },
);

export default router;
