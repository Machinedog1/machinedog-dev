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

const router: IRouter = Router();

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

      await db
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
        .where(eq(buildOrdersTable.stripeSessionId, session.id));

      req.log.info(
        { kind, sessionId: session.id, email: customerEmail },
        "Public checkout completed",
      );
      res.json({ received: true });
      return;
    }

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
    }
  }

  res.json({ received: true });
});

export default router;
