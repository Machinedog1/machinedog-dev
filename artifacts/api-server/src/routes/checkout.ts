import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, buildOrdersTable, organizationsTable } from "@workspace/db";
import { CreateBuildCheckoutBody, CreateBuildCheckoutResponse, CreateRetainerCheckoutBody, CreateRetainerCheckoutResponse, CreatePortalCheckoutResponse } from "@workspace/api-zod";
import { getStripe, publicOrigin } from "../lib/stripe";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  if (ipHits.size > 5000) {
    for (const [key, hits] of ipHits) {
      const fresh = hits.filter((t) => t > cutoff);
      if (fresh.length === 0) ipHits.delete(key);
      else ipHits.set(key, fresh);
    }
  }
  return false;
}

function clientIp(req: import("express").Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0];
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function parseSource(
  req: import("express").Request,
  schema: typeof CreateBuildCheckoutBody | typeof CreateRetainerCheckoutBody,
): string {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success && parsed.data.source) {
    return parsed.data.source.slice(0, 100);
  }
  return "pricing-page";
}

const BUILD_PRICE_USD = (() => {
  const raw = Number(process.env.STRIPE_BUILD_DEPOSIT_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 25_000;
})();

const RETAINER_PRICE_USD = (() => {
  const raw = Number(process.env.STRIPE_RETAINER_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 1_200;
})();

const PORTAL_PRICE_USD = (() => {
  const raw = Number(process.env.STRIPE_PORTAL_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : 500;
})();

router.post("/checkout/build", async (req, res): Promise<void> => {
  if (isRateLimited(clientIp(req))) {
    res.status(429).json({ error: "Too many checkout attempts. Please try again later." });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res
      .status(503)
      .json({ error: "Payments are not yet configured. Please contact us to start your build." });
    return;
  }

  const source = parseSource(req, CreateBuildCheckoutBody);
  const origin = publicOrigin(req);
  const amountCents = Math.round(BUILD_PRICE_USD * 100);
  const explicitPriceId = process.env.STRIPE_PRICE_BUILD?.trim();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: explicitPriceId
        ? [{ quantity: 1, price: explicitPriceId }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: amountCents,
                product_data: {
                  name: "Machinedog · Premium Build Starter",
                  description:
                    "Complete Business System Build — backend, frontend, AI, automations, and launch (4–8 week delivery).",
                },
              },
            },
          ],
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      metadata: {
        kind: "build",
        source,
      },
      success_url: `${origin}/thank-you?kind=build&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?status=cancelled#pricing`,
    });

    await db.insert(buildOrdersTable).values({
      kind: "build",
      amountCents,
      currency: "usd",
      source,
      stripeSessionId: session.id,
      status: "pending",
    });

    if (!session.url) {
      res.status(500).json({ error: "Stripe did not return a checkout URL" });
      return;
    }
    res.json(CreateBuildCheckoutResponse.parse({ url: session.url }));
  } catch (err) {
    req.log.error({ err }, "Failed to create build checkout session");
    res.status(500).json({ error: "Could not start checkout. Please try again." });
  }
});

router.post("/checkout/retainer", async (req, res): Promise<void> => {
  if (isRateLimited(clientIp(req))) {
    res.status(429).json({ error: "Too many checkout attempts. Please try again later." });
    return;
  }

  const stripe = getStripe();
  if (!stripe) {
    res
      .status(503)
      .json({ error: "Payments are not yet configured. Please contact us to add the retainer." });
    return;
  }

  const source = parseSource(req, CreateRetainerCheckoutBody);
  const origin = publicOrigin(req);
  const amountCents = Math.round(RETAINER_PRICE_USD * 100);
  const explicitPriceId = process.env.STRIPE_PRICE_RETAINER?.trim();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: explicitPriceId
        ? [{ quantity: 1, price: explicitPriceId }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: amountCents,
                recurring: { interval: "month" },
                product_data: {
                  name: "Machinedog · Growth & Optimization Retainer",
                  // Stripe limits product_data.description to 350 chars.
                  description:
                    "Monthly retainer: ongoing updates, AI prompt tuning, monitoring, fixes, and continuous enhancements.",
                },
              },
            },
          ],
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      metadata: {
        kind: "retainer",
        source,
      },
      subscription_data: {
        metadata: {
          kind: "retainer",
          source,
        },
      },
      success_url: `${origin}/thank-you?kind=retainer&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?status=cancelled#retainer`,
    });

    await db.insert(buildOrdersTable).values({
      kind: "retainer",
      amountCents,
      currency: "usd",
      source,
      stripeSessionId: session.id,
      status: "pending",
    });

    if (!session.url) {
      res.status(500).json({ error: "Stripe did not return a checkout URL" });
      return;
    }
    res.json(CreateRetainerCheckoutResponse.parse({ url: session.url }));
  } catch (err) {
    req.log.error({ err }, "Failed to create retainer checkout session");
    res.status(500).json({ error: "Could not start checkout. Please try again." });
  }
});

router.post(
  "/checkout/portal",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!req.organization) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isRateLimited(clientIp(req))) {
      res.status(429).json({ error: "Too many checkout attempts. Please try again later." });
      return;
    }

    const stripe = getStripe();
    if (!stripe) {
      res
        .status(503)
        .json({ error: "Payments are not yet configured. Please contact us to enable Portal Access." });
      return;
    }

    const origin = publicOrigin(req);
    const amountCents = Math.round(PORTAL_PRICE_USD * 100);
    const explicitPriceId = process.env.STRIPE_PRICE_PORTAL?.trim();
    const customerArgs = req.organization!.stripeCustomerId
      ? { customer: req.organization!.stripeCustomerId }
      : { customer_email: req.organizationMember!.email };

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        ...customerArgs,
        line_items: explicitPriceId
          ? [{ quantity: 1, price: explicitPriceId }]
          : [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: amountCents,
                  recurring: { interval: "month" },
                  product_data: {
                    name: "Machinedog · Portal Access",
                    description:
                      "Monthly Portal Access — invite-only client portal, shared prompt console, comments, file uploads.",
                  },
                },
              },
            ],
        billing_address_collection: "auto",
        allow_promotion_codes: true,
        metadata: {
          kind: "portal",
          clientId: String(req.organization!.id),
        },
        subscription_data: {
          metadata: {
            kind: "portal",
            clientId: String(req.organization!.id),
          },
        },
        success_url: `${origin}/thank-you?kind=portal&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?status=cancelled#portal`,
      });

      if (!session.url) {
        res.status(500).json({ error: "Stripe did not return a checkout URL" });
        return;
      }
      res.json(CreatePortalCheckoutResponse.parse({ url: session.url }));
    } catch (err) {
      req.log.error({ err }, "Failed to create portal checkout session");
      res.status(500).json({ error: "Could not start checkout. Please try again." });
    }
  },
);

export default router;
