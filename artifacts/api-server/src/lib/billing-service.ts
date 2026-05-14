import type Stripe from "stripe";
import { eq, desc } from "drizzle-orm";
import {
  db,
  organizationsTable,
  subscriptionsTable,
  type Subscription,
} from "@workspace/db";
import { getStripe } from "./stripe";
import {
  PLANS,
  TOKEN_PACKS,
  findPlan,
  findTokenPack,
  planFromPriceId,
  planPriceId,
  tokenPackPriceId,
  type BillingInterval,
  type PlanType,
} from "./plans";
import { recordAuditEvent } from "./audit";
import { grantMonthly, recordPurchase } from "./token-service";
import { logger } from "./logger";

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Demo / mock checkout is intentionally locked to non-production environments
 * AND requires an explicit opt-in flag. This prevents an unconfigured
 * production deployment from silently letting authenticated users self-grant
 * paid plans or token packs without payment.
 */
export function isDemoBillingAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.BILLING_DEMO_MODE === "true"
  );
}

export class BillingNotConfiguredError extends Error {
  status = 503;
  code = "billing_not_configured";
  constructor(message = "Billing is not configured. Set STRIPE_SECRET_KEY to enable checkout.") {
    super(message);
    this.name = "BillingNotConfiguredError";
  }
}

export async function fetchCurrentSubscription(
  organizationId: number,
): Promise<Subscription | null> {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.organizationId, organizationId))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);
  return row ?? null;
}

interface EnsureCustomerOpts {
  organizationId: number;
  email: string;
  name?: string | null;
}

async function ensureStripeCustomer(opts: EnsureCustomerOpts): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, opts.organizationId));
  if (!org) throw new Error(`Organization ${opts.organizationId} not found`);

  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: opts.email,
    name: opts.name ?? org.name,
    metadata: {
      organizationId: String(opts.organizationId),
    },
  });
  await db
    .update(organizationsTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizationsTable.id, opts.organizationId));
  return customer.id;
}

export interface CreatePlanCheckoutOpts {
  organizationId: number;
  email: string;
  planType: PlanType;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  actorOrganizationId?: number | null;
}

export async function createPlanCheckoutSession(
  opts: CreatePlanCheckoutOpts,
): Promise<{ url: string | null; mock: boolean }> {
  const plan = findPlan(opts.planType);
  if (!plan) throw new Error(`Unknown plan: ${opts.planType}`);

  // Demo mode: no Stripe configured → grant tokens + record a fake sub.
  // Locked behind NODE_ENV !== "production" + BILLING_DEMO_MODE=true so a
  // misconfigured production deployment cannot let users self-grant plans.
  if (!isStripeConfigured()) {
    if (!isDemoBillingAllowed()) {
      throw new BillingNotConfiguredError();
    }
    return await mockPlanCheckout({ ...opts, plan });
  }

  const stripe = getStripe()!;
  const priceId = planPriceId(plan, opts.interval);
  if (!priceId) {
    throw new Error(`Stripe price not configured for ${plan.key} (${opts.interval})`);
  }

  const customerId = await ensureStripeCustomer({
    organizationId: opts.organizationId,
    email: opts.email,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      kind: "plan_subscription",
      organizationId: String(opts.organizationId),
      planType: plan.key,
      billingInterval: opts.interval,
    },
    subscription_data: {
      metadata: {
        kind: "plan_subscription",
        organizationId: String(opts.organizationId),
        planType: plan.key,
        billingInterval: opts.interval,
      },
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });

  await recordAuditEvent({
    organizationId: opts.organizationId,
    actorOrganizationId: opts.actorOrganizationId ?? null,
    category: "billing",
    action: "checkout.created",
    targetType: "stripe_checkout_session",
    targetId: session.id,
    metadata: { planType: plan.key, interval: opts.interval },
  });

  return { url: session.url, mock: false };
}

export interface CreateTokenPackCheckoutOpts {
  organizationId: number;
  email: string;
  packKey: string;
  successUrl: string;
  cancelUrl: string;
  actorOrganizationId?: number | null;
}

export async function createTokenPackCheckoutSession(
  opts: CreateTokenPackCheckoutOpts,
): Promise<{ url: string | null; mock: boolean }> {
  const pack = findTokenPack(opts.packKey);
  if (!pack) throw new Error(`Unknown token pack: ${opts.packKey}`);

  if (!isStripeConfigured()) {
    if (!isDemoBillingAllowed()) {
      throw new BillingNotConfiguredError();
    }
    return await mockTokenPackCheckout({ ...opts, pack });
  }

  const stripe = getStripe()!;
  const customerId = await ensureStripeCustomer({
    organizationId: opts.organizationId,
    email: opts.email,
  });

  const priceId = tokenPackPriceId(pack);
  const lineItem = (priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(pack.priceUsd * 100),
          product_data: {
            name: `Machinedog · ${pack.name}`,
            description: `${pack.tokens.toLocaleString()} tokens`,
          },
        },
      });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [lineItem],
    metadata: {
      kind: "token_pack",
      organizationId: String(opts.organizationId),
      packKey: pack.key,
      tokens: String(pack.tokens),
    },
    payment_intent_data: {
      metadata: {
        kind: "token_pack",
        organizationId: String(opts.organizationId),
        packKey: pack.key,
        tokens: String(pack.tokens),
      },
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });

  await recordAuditEvent({
    organizationId: opts.organizationId,
    actorOrganizationId: opts.actorOrganizationId ?? null,
    category: "billing",
    action: "token_pack.checkout.created",
    targetType: "stripe_checkout_session",
    targetId: session.id,
    metadata: { packKey: pack.key, tokens: pack.tokens },
  });

  return { url: session.url, mock: false };
}

export async function customerPortalLink(opts: {
  organizationId: number;
  returnUrl: string;
}): Promise<string | null> {
  if (!isStripeConfigured()) return null;
  const stripe = getStripe()!;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, opts.organizationId));
  if (!org?.stripeCustomerId) return null;
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: opts.returnUrl,
  });
  return session.url;
}

export async function listInvoices(
  organizationId: number,
): Promise<Array<{
  id: string;
  number: string | null;
  amountPaid: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
}>> {
  if (!isStripeConfigured()) return [];
  const stripe = getStripe()!;
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));
  if (!org?.stripeCustomerId) return [];
  const invoices = await stripe.invoices.list({ customer: org.stripeCustomerId, limit: 24 });
  return invoices.data.map((inv) => ({
    id: inv.id ?? "",
    number: inv.number ?? null,
    amountPaid: inv.amount_paid ?? 0,
    currency: (inv.currency ?? "usd").toUpperCase(),
    status: inv.status ?? null,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    pdfUrl: inv.invoice_pdf ?? null,
    createdAt: new Date((inv.created ?? Date.now() / 1000) * 1000).toISOString(),
  }));
}

/**
 * Apply Stripe subscription state to our `subscriptions` table.
 * Called from the webhook on customer.subscription.* events. Idempotent.
 */
export async function syncSubscriptionFromStripe(
  sub: Stripe.Subscription,
): Promise<void> {
  const orgIdRaw = sub.metadata?.organizationId;
  const orgId = orgIdRaw ? Number(orgIdRaw) : NaN;
  if (!orgId || Number.isNaN(orgId)) {
    logger.warn({ subId: sub.id }, "Stripe subscription has no organizationId metadata — skipping");
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  // Prefer the live Stripe price as source of truth — customer-portal plan
  // changes update the subscription's price but typically do NOT rewrite our
  // custom metadata, so reading metadata first would leave the org on a stale
  // tier. Fall back to metadata only when we cannot resolve the price.
  const resolved = priceId ? planFromPriceId(priceId) : null;
  const planType: PlanType =
    resolved?.plan.key ?? (sub.metadata?.planType as PlanType) ?? "starter";
  const interval: BillingInterval =
    resolved?.interval ?? (sub.metadata?.billingInterval as BillingInterval) ?? "monthly";

  const periodEndUnix =
    typeof (sub as unknown as { current_period_end?: number }).current_period_end === "number"
      ? (sub as unknown as { current_period_end: number }).current_period_end
      : item?.current_period_end ?? null;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  const customerId = typeof sub.customer === "string" ? sub.customer : null;

  const status = sub.status;
  const allowed = [
    "trialing",
    "active",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ] as const;
  const safeStatus: (typeof allowed)[number] = (allowed as readonly string[]).includes(status)
    ? (status as (typeof allowed)[number])
    : "incomplete";

  const cancelAtPeriodEnd = sub.cancel_at_period_end ? "true" : "false";

  // Upsert by stripeSubscriptionId.
  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.stripeSubscriptionId, sub.id))
    .limit(1);

  if (existing) {
    await db
      .update(subscriptionsTable)
      .set({
        planType,
        billingInterval: interval,
        status: safeStatus,
        stripeCustomerId: customerId,
        stripePriceId: priceId,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd,
      })
      .where(eq(subscriptionsTable.id, existing.id));
  } else {
    await db.insert(subscriptionsTable).values({
      organizationId: orgId,
      planType,
      billingInterval: interval,
      status: safeStatus,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      currentPeriodEnd: periodEnd,
      source: "stripe",
    });
  }

  // Mirror plan/status onto the organization for fast reads in the rest of the app.
  // BAA is explicitly cleared back to `not_required` when the org downgrades
  // off the healthcare plan so stale "required" state cannot linger.
  const baaStatus =
    planType === "healthcare"
      ? ("required" as const)
      : ("not_required" as const);
  await db
    .update(organizationsTable)
    .set({
      planType,
      planStatus:
        safeStatus === "trialing" ||
        safeStatus === "active" ||
        safeStatus === "past_due" ||
        safeStatus === "canceled" ||
        safeStatus === "incomplete"
          ? safeStatus
          : "incomplete",
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      baaStatus,
    })
    .where(eq(organizationsTable.id, orgId));

  await recordAuditEvent({
    organizationId: orgId,
    category: "billing",
    action: "subscription.synced",
    targetType: "stripe_subscription",
    targetId: sub.id,
    metadata: { planType, interval, status: safeStatus, cancelAtPeriodEnd },
  });
}

/**
 * Grant the plan's monthly token allotment on invoice.paid. Idempotent on
 * the invoice id (passed as stripeEventId so the ledger guards duplicates).
 */
export async function grantPlanRenewalTokens(opts: {
  organizationId: number;
  planType: PlanType;
  invoiceId: string;
  /**
   * Billing interval for THIS invoice cycle. Annual invoices fire once per
   * year, so they must credit 12× the monthly allotment to deliver the full
   * annual grant per cycle. Defaults to "monthly" for backward compatibility.
   */
  interval?: BillingInterval;
}): Promise<void> {
  const plan = findPlan(opts.planType);
  if (!plan) return;
  const interval: BillingInterval = opts.interval ?? "monthly";
  const multiplier = interval === "annual" ? 12 : 1;
  const amount = plan.monthlyTokenGrant * multiplier;
  await grantMonthly(opts.organizationId, amount, {
    stripeEventId: `invoice:${opts.invoiceId}`,
    source: "stripe",
    description:
      interval === "annual"
        ? `${plan.name} annual plan renewal grant (12 × monthly allotment)`
        : `${plan.name} plan renewal grant`,
    metadata: {
      invoiceId: opts.invoiceId,
      planType: plan.key,
      interval,
      months: multiplier,
    },
  });
}

/**
 * Apply a token pack purchase from a completed checkout session.
 * Idempotent on the checkout session id.
 */
export async function applyTokenPackPurchase(opts: {
  organizationId: number;
  packKey: string;
  sessionId: string;
}): Promise<void> {
  const pack = findTokenPack(opts.packKey);
  if (!pack) return;
  await recordPurchase(opts.organizationId, pack.tokens, {
    stripeEventId: `checkout:${opts.sessionId}`,
    source: "stripe",
    description: `${pack.name} purchase`,
    metadata: { sessionId: opts.sessionId, packKey: pack.key },
  });
}

// ─── Demo mock checkout (no Stripe configured) ────────────────────────────────

interface MockPlanArgs extends CreatePlanCheckoutOpts {
  plan: (typeof PLANS)[number];
}
async function mockPlanCheckout(opts: MockPlanArgs): Promise<{ url: string | null; mock: boolean }> {
  const fakeSubId = `dev_mock_sub_${opts.organizationId}_${Date.now()}`;
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(subscriptionsTable).values({
    organizationId: opts.organizationId,
    planType: opts.planType,
    billingInterval: opts.interval,
    status: "active",
    stripeSubscriptionId: fakeSubId,
    currentPeriodEnd: periodEnd,
    source: "dev_mock",
  });
  await db
    .update(organizationsTable)
    .set({
      planType: opts.planType,
      planStatus: "active",
      // Mirror live-sync semantics: explicitly clear BAA on non-healthcare
      // so a downgrade in demo mode doesn't leave stale "required" state.
      baaStatus: opts.plan.requiresBaa
        ? ("required" as const)
        : ("not_required" as const),
    })
    .where(eq(organizationsTable.id, opts.organizationId));
  // Annual demo subscription should mint the full annual allotment, matching
  // the real Stripe-backed renewal grant for annual cycles.
  const months = opts.interval === "annual" ? 12 : 1;
  await grantMonthly(opts.organizationId, opts.plan.monthlyTokenGrant * months, {
    stripeEventId: `mock:${fakeSubId}`,
    source: "dev_mock",
    description: `[demo] ${opts.plan.name} ${opts.interval} plan grant`,
    actorOrganizationId: opts.actorOrganizationId ?? null,
    metadata: { interval: opts.interval, months },
  });
  await recordAuditEvent({
    organizationId: opts.organizationId,
    actorOrganizationId: opts.actorOrganizationId ?? null,
    category: "billing",
    action: "subscription.dev_mock",
    targetType: "subscription",
    targetId: fakeSubId,
    metadata: { planType: opts.planType, interval: opts.interval },
  });
  return { url: `${opts.successUrl}&dev_mock=1`, mock: true };
}

interface MockPackArgs extends CreateTokenPackCheckoutOpts {
  pack: (typeof TOKEN_PACKS)[number];
}
async function mockTokenPackCheckout(opts: MockPackArgs): Promise<{ url: string | null; mock: boolean }> {
  const fakeSessionId = `dev_mock_pack_${opts.organizationId}_${Date.now()}`;
  await recordPurchase(opts.organizationId, opts.pack.tokens, {
    stripeEventId: `mock:${fakeSessionId}`,
    source: "dev_mock",
    description: `[demo] ${opts.pack.name} purchase`,
    actorOrganizationId: opts.actorOrganizationId ?? null,
  });
  await recordAuditEvent({
    organizationId: opts.organizationId,
    actorOrganizationId: opts.actorOrganizationId ?? null,
    category: "billing",
    action: "token_pack.dev_mock",
    targetType: "checkout",
    targetId: fakeSessionId,
    metadata: { packKey: opts.pack.key, tokens: opts.pack.tokens },
  });
  return { url: `${opts.successUrl}&dev_mock=1`, mock: true };
}
