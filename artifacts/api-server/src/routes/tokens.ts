import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tokenPurchasesTable, clientsTable } from "@workspace/db";
import {
  ListTokenBundlesResponse,
  ListMyTokenPurchasesResponse,
  CreateTokenCheckoutBody,
  CreateTokenCheckoutResponse,
} from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient, requireActiveClient } from "../lib/auth";
import { TOKEN_BUNDLES, findTokenBundle } from "../lib/bundles";
import { getStripe, publicOrigin } from "../lib/stripe";

const router: IRouter = Router();

router.get("/tokens/bundles", requireAuth, loadOrCreateClient, async (_req, res): Promise<void> => {
  const data = TOKEN_BUNDLES.map((b) => ({
    key: b.key,
    name: b.name,
    tokens: b.tokens,
    priceUsd: b.priceUsd,
    popular: b.popular,
    stripePriceId: process.env[b.stripePriceIdEnv] ?? null,
  }));
  res.json(ListTokenBundlesResponse.parse({ data }));
});

router.get("/tokens/purchases", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(tokenPurchasesTable)
    .where(eq(tokenPurchasesTable.clientId, req.dbClient!.id))
    .orderBy(desc(tokenPurchasesTable.createdAt));
  res.json(ListMyTokenPurchasesResponse.parse({ data: rows }));
});

router.post("/tokens/checkout", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const parsed = CreateTokenCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const bundle = findTokenBundle(parsed.data.bundleKey);
  if (!bundle) {
    res.status(404).json({ error: "Unknown bundle" });
    return;
  }
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Payments are not yet configured. Please reach out to your account owner." });
    return;
  }

  const origin = publicOrigin(req);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(bundle.priceUsd * 100),
          product_data: {
            name: `Machinedog · ${bundle.name} token bundle`,
            description: `${bundle.tokens.toLocaleString()} prompt tokens`,
          },
        },
      },
    ],
    customer_email: req.dbClient!.email,
    client_reference_id: String(req.dbClient!.id),
    metadata: {
      kind: "tokens",
      clientId: String(req.dbClient!.id),
      bundleKey: bundle.key,
      tokens: String(bundle.tokens),
    },
    success_url: `${origin}/tokens?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/tokens?status=cancelled`,
  });

  // Pre-record a pending purchase so the user sees it in history immediately
  await db.insert(tokenPurchasesTable).values({
    clientId: req.dbClient!.id,
    bundleKey: bundle.key,
    tokensAdded: bundle.tokens,
    amountCents: Math.round(bundle.priceUsd * 100),
    stripeSessionId: session.id,
    status: "pending",
  });

  if (!session.url) {
    res.status(500).json({ error: "Stripe did not return a checkout URL" });
    return;
  }
  res.json(CreateTokenCheckoutResponse.parse({ url: session.url }));
});

export default router;
