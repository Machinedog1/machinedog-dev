import { Router, type IRouter, raw } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  clientsTable,
  tokenPurchasesTable,
  consultingBookingsTable,
  buildOrdersTable,
} from "@workspace/db";
import { getStripe } from "../lib/stripe";
import { loadMailerConfig, getTransporter } from "../lib/mailer";
import { logger } from "../lib/logger";
import {
  syncSubscriptionFromStripe,
  grantPlanRenewalTokens,
  applyTokenPackPurchase,
} from "../lib/billing-service";
import { planFromPriceId } from "../lib/plans";
import { recordAuditEvent } from "../lib/audit";
import type Stripe from "stripe";

const router: IRouter = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(amountCents: number | null, currency: string | null): string {
  if (amountCents == null) return "—";
  const code = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${code}`;
  }
}

interface PaidOrderNotification {
  kind: "build" | "retainer";
  sessionId: string;
  livemode: boolean;
  amountCents: number | null;
  currency: string | null;
  customerEmail: string | null;
  customerName: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
}

async function notifyOperatorOfPaidOrder(order: PaidOrderNotification): Promise<void> {
  const operatorEmail =
    process.env.LEADS_NOTIFY_EMAIL?.trim() ||
    process.env.SMTP_FROM_EMAIL?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim();
  if (!operatorEmail) {
    logger.warn(
      { sessionId: order.sessionId, kind: order.kind },
      "Paid order notification skipped — no operator email configured (set LEADS_NOTIFY_EMAIL or SMTP_FROM/SMTP_USER)",
    );
    return;
  }

  const cfg = loadMailerConfig();
  if (!cfg) {
    logger.warn(
      { sessionId: order.sessionId, kind: order.kind },
      "Paid order notification skipped — SMTP not configured",
    );
    return;
  }

  const dashboardBase = order.livemode
    ? "https://dashboard.stripe.com"
    : "https://dashboard.stripe.com/test";
  const dashboardUrl =
    order.kind === "retainer" && order.stripeSubscriptionId
      ? `${dashboardBase}/subscriptions/${order.stripeSubscriptionId}`
      : order.stripePaymentIntentId
        ? `${dashboardBase}/payments/${order.stripePaymentIntentId}`
        : `${dashboardBase}/payments?query=${encodeURIComponent(order.sessionId)}`;

  const kindLabel = order.kind === "build" ? "Premium Build deposit" : "Monthly retainer";
  const amount = formatAmount(order.amountCents, order.currency);
  const customerLabel =
    order.customerName?.trim() || order.customerEmail?.trim() || "(unknown customer)";
  const subject = `[Machinedog] ${kindLabel} · ${amount} from ${customerLabel}`;

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; color: #0b1220;">
      <h2 style="margin:0 0 12px;">${escapeHtml(kindLabel)} received</h2>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Kind</td><td><strong>${escapeHtml(order.kind)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Amount</td><td><strong>${escapeHtml(amount)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td>${escapeHtml(order.customerName ?? "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td>${
          order.customerEmail
            ? `<a href="mailto:${escapeHtml(order.customerEmail)}">${escapeHtml(order.customerEmail)}</a>`
            : "—"
        }</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Stripe session</td><td><code>${escapeHtml(order.sessionId)}</code></td></tr>
        ${
          order.stripeSubscriptionId
            ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Subscription</td><td><code>${escapeHtml(order.stripeSubscriptionId)}</code></td></tr>`
            : ""
        }
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Mode</td><td>${order.livemode ? "live" : "test"}</td></tr>
      </table>
      <p style="margin:20px 0 0;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:10px 16px;background:#0b1220;color:#fff;border-radius:6px;text-decoration:none;">Open in Stripe dashboard</a>
      </p>
    </div>
  `.trim();

  const text = [
    `${kindLabel} received`,
    ``,
    `Kind: ${order.kind}`,
    `Amount: ${amount}`,
    `Name: ${order.customerName ?? "—"}`,
    `Email: ${order.customerEmail ?? "—"}`,
    `Stripe session: ${order.sessionId}`,
    order.stripeSubscriptionId ? `Subscription: ${order.stripeSubscriptionId}` : null,
    `Mode: ${order.livemode ? "live" : "test"}`,
    ``,
    `Stripe dashboard: ${dashboardUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const transporter = getTransporter(cfg);
  await transporter.sendMail({
    from: cfg.from,
    to: operatorEmail,
    replyTo: order.customerEmail ?? undefined,
    subject,
    html,
    text,
  });
}

// IMPORTANT: this router is mounted BEFORE express.json(), and uses raw body parsing.
router.post("/", raw({ type: "application/json", limit: "2mb" }), async (req, res): Promise<void> => {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret) {
    req.log.warn("Stripe webhook hit but Stripe is not fully configured");
    res.status(503).send("Stripe not configured");
    return;
  }
  if (!sig || typeof sig !== "string") {
    res.status(400).send("Missing signature");
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err) {
    req.log.error({ err }, "Stripe webhook signature verification failed");
    res.status(400).send("Bad signature");
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const kind = session.metadata?.kind;

    // Public checkouts (no clientId) — Premium Build deposit and monthly retainer.
    if (kind === "build" || kind === "retainer") {
      const customerEmail =
        session.customer_details?.email ?? session.customer_email ?? null;
      const customerName = session.customer_details?.name ?? null;
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : null;

      const status = kind === "retainer" ? "active" : "completed";

      const [updated] = await db
        .update(buildOrdersTable)
        .set({
          status,
          email: customerEmail,
          name: customerName,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePaymentIntentId: paymentIntentId,
          completedAt: new Date(),
        })
        .where(eq(buildOrdersTable.stripeSessionId, session.id))
        .returning({
          amountCents: buildOrdersTable.amountCents,
          currency: buildOrdersTable.currency,
        });

      req.log.info(
        { kind, sessionId: session.id, email: customerEmail },
        "Public checkout completed",
      );

      // Operator notification — failures are logged but must not fail the
      // webhook, otherwise Stripe will retry indefinitely.
      void notifyOperatorOfPaidOrder({
        kind,
        sessionId: session.id,
        livemode: event.livemode === true,
        amountCents:
          updated?.amountCents ??
          (typeof session.amount_total === "number" ? session.amount_total : null),
        currency: updated?.currency ?? session.currency ?? null,
        customerEmail,
        customerName,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePaymentIntentId: paymentIntentId,
      }).catch((err) => {
        req.log.error(
          { err, sessionId: session.id, kind },
          "Failed to send paid order notification email",
        );
      });

      res.json({ received: true });
      return;
    }

    // Phase 1 flows are org-scoped (no legacy clientId in metadata) — handle
    // them before the legacy clientId requirement so token-pack purchases
    // and plan subscriptions are fulfilled correctly.
    if (kind === "token_pack") {
      const orgId = Number(session.metadata?.organizationId);
      const packKey = session.metadata?.packKey;
      if (orgId && !Number.isNaN(orgId) && packKey) {
        try {
          await applyTokenPackPurchase({
            organizationId: orgId,
            packKey,
            sessionId: session.id,
          });
        } catch (err) {
          // Surface the failure to Stripe so it retries the webhook. The
          // ledger insert is idempotent on session.id so retries are safe.
          req.log.error({ err, orgId, packKey, sessionId: session.id }, "Token pack credit failed");
          res.status(500).json({ error: "token_pack_credit_failed" });
          return;
        }
      } else {
        req.log.warn({ sessionId: session.id }, "token_pack checkout missing org/pack metadata");
      }
      res.json({ received: true });
      return;
    }

    if (kind === "plan_subscription") {
      // Subscription create event will sync the subscriptions table; nothing
      // to do here besides logging — the sub event is the source of truth.
      req.log.info(
        { sessionId: session.id, planType: session.metadata?.planType },
        "Plan subscription checkout completed",
      );
      res.json({ received: true });
      return;
    }

    // Legacy flows below all require clientId metadata.
    const clientId = Number(session.metadata?.clientId);
    if (!clientId || Number.isNaN(clientId)) {
      req.log.warn({ sessionId: session.id }, "Missing clientId in metadata");
      res.json({ received: true });
      return;
    }

    if (kind === "tokens") {
      const tokens = Number(session.metadata?.tokens ?? "0");
      const bundleKey = session.metadata?.bundleKey ?? "unknown";
      // Mark purchase complete
      await db
        .update(tokenPurchasesTable)
        .set({ status: "completed" })
        .where(eq(tokenPurchasesTable.stripeSessionId, session.id));
      // Credit the balance
      await db
        .update(clientsTable)
        .set({
          tokenBalance: sql`${clientsTable.tokenBalance} + ${tokens}`,
        })
        .where(eq(clientsTable.id, clientId));
      req.log.info({ clientId, tokens, bundleKey }, "Tokens credited via Stripe");
    } else if (kind === "consulting") {
      await db
        .update(consultingBookingsTable)
        .set({ status: "active" })
        .where(eq(consultingBookingsTable.stripeSessionId, session.id));
      req.log.info({ clientId, sessionId: session.id }, "Consulting booking activated");
    } else if (kind === "portal") {
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;
      await db
        .update(clientsTable)
        .set({
          stripeCustomerId: customerId ?? undefined,
          portalSubscriptionId: subscriptionId ?? undefined,
          portalSubscriptionStatus: "active",
        })
        .where(eq(clientsTable.id, clientId));
      req.log.info({ clientId, subscriptionId }, "Portal Access subscription activated");
    }
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object;
    const kind = sub.metadata?.kind;

    if (kind === "plan_subscription") {
      try {
        await syncSubscriptionFromStripe(sub as Stripe.Subscription);
      } catch (err) {
        // Surface failures so Stripe retries; sync is upserted by
        // stripeSubscriptionId so retries are safe.
        req.log.error({ err, subId: sub.id }, "Plan subscription sync failed");
        res.status(500).json({ error: "plan_subscription_sync_failed" });
        return;
      }
      res.json({ received: true });
      return;
    }

    if (kind === "portal") {
      const clientId = Number(sub.metadata?.clientId);
      const customerId = typeof sub.customer === "string" ? sub.customer : null;
      const status = sub.status;
      const allowedStatuses = [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
      ] as const;
      const portalStatus = allowedStatuses.includes(status as (typeof allowedStatuses)[number])
        ? (status as (typeof allowedStatuses)[number])
        : "incomplete";
      const subAny = sub as unknown as { current_period_end?: number };
      const periodEndUnix =
        typeof subAny.current_period_end === "number" ? subAny.current_period_end : null;
      const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

      const updateValues = {
        portalSubscriptionId: sub.id,
        portalSubscriptionStatus:
          event.type === "customer.subscription.deleted" ? ("canceled" as const) : portalStatus,
        portalCurrentPeriodEnd: periodEnd,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      };

      if (clientId && !Number.isNaN(clientId)) {
        await db.update(clientsTable).set(updateValues).where(eq(clientsTable.id, clientId));
      } else if (customerId) {
        await db
          .update(clientsTable)
          .set(updateValues)
          .where(eq(clientsTable.stripeCustomerId, customerId));
      }
      req.log.info(
        { clientId, subscriptionId: sub.id, status: updateValues.portalSubscriptionStatus },
        "Portal subscription state synced",
      );
    }
  }

  // Plan renewals: invoice.paid grants the org's monthly token allotment.
  // Idempotent on the invoice id via the ledger's stripeEventId unique constraint.
  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const billingReason = invoice.billing_reason ?? "";
    const subId =
      typeof (invoice as unknown as { subscription?: string | null }).subscription === "string"
        ? (invoice as unknown as { subscription: string }).subscription
        : null;
    // Only grant on the initial creation invoice and on true cycle renewals.
    // `subscription_update` fires on mid-cycle plan changes / proration and
    // must NOT mint another monthly allotment.
    if (subId && (billingReason === "subscription_create" || billingReason === "subscription_cycle")) {
      try {
        const stripeClient = getStripe()!;
        const sub = await stripeClient.subscriptions.retrieve(subId);
        if (sub.metadata?.kind === "plan_subscription") {
          const orgId = Number(sub.metadata.organizationId);
          // Resolve plan from the live Stripe price (source of truth) instead
          // of metadata, which is not rewritten by customer-portal plan
          // changes. Falling back to metadata only if the price is unknown
          // keeps demo/legacy paths working.
          const livePriceId = sub.items.data[0]?.price?.id ?? null;
          const resolved = livePriceId ? planFromPriceId(livePriceId) : null;
          const planType =
            resolved?.plan.key ??
            (sub.metadata.planType as
              | "starter"
              | "pro"
              | "business"
              | "healthcare"
              | "enterprise"
              | undefined);
          // Interval is needed to size the grant correctly: annual invoices
          // fire once per year so they must credit 12× the monthly allotment.
          // Prefer the live price's resolved interval; fall back to metadata.
          const interval =
            resolved?.interval ??
            (sub.metadata.billingInterval === "annual" ? "annual" : "monthly");
          if (orgId && !Number.isNaN(orgId) && planType) {
            await grantPlanRenewalTokens({
              organizationId: orgId,
              planType,
              interval,
              invoiceId: invoice.id ?? `${subId}-${invoice.created}`,
            });
            req.log.info(
              { orgId, planType, interval, invoiceId: invoice.id, priceId: livePriceId },
              "Plan renewal grant credited",
            );
          } else {
            req.log.warn(
              { subId, livePriceId, metadataPlan: sub.metadata.planType },
              "Plan renewal: could not resolve plan type, skipping grant",
            );
          }
        }
      } catch (err) {
        // Surface failures so Stripe retries; grantPlanRenewalTokens is
        // idempotent on invoice.id so retries are safe.
        req.log.error({ err, subId }, "Plan renewal grant failed");
        res.status(500).json({ error: "plan_renewal_grant_failed" });
        return;
      }
    }
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subId =
      typeof (invoice as unknown as { subscription?: string | null }).subscription === "string"
        ? (invoice as unknown as { subscription: string }).subscription
        : null;
    await recordAuditEvent({
      category: "billing",
      action: "invoice.payment_failed",
      targetType: "stripe_invoice",
      targetId: invoice.id ?? null,
      metadata: {
        subscriptionId: subId,
        amountDue: invoice.amount_due,
        attemptCount: invoice.attempt_count,
      },
    });
    req.log.warn({ invoiceId: invoice.id, subId }, "Invoice payment failed");
  }

  res.json({ received: true });
});

export default router;
