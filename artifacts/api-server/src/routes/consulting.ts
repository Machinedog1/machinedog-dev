import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, consultingBookingsTable } from "@workspace/db";
import {
  ListConsultingPackagesResponse,
  ListMyConsultingBookingsResponse,
  CreateConsultingCheckoutBody,
  CreateConsultingCheckoutResponse,
} from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient, requireActiveClient } from "../lib/auth";
import { CONSULTING_PACKAGES, findConsultingPackage } from "../lib/bundles";
import { getStripe, publicOrigin } from "../lib/stripe";

const router: IRouter = Router();

router.get("/consulting/packages", requireAuth, loadOrCreateClient, async (_req, res): Promise<void> => {
  const data = CONSULTING_PACKAGES.map((p) => ({
    key: p.key,
    name: p.name,
    hours: p.hours,
    priceUsd: p.priceUsd,
    description: p.description,
    popular: p.popular,
    stripePriceId: process.env[p.stripePriceIdEnv] ?? null,
  }));
  res.json(ListConsultingPackagesResponse.parse({ data }));
});

router.get("/consulting/bookings", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(consultingBookingsTable)
    .where(eq(consultingBookingsTable.organizationId, req.dbClient!.id))
    .orderBy(desc(consultingBookingsTable.createdAt));
  res.json(ListMyConsultingBookingsResponse.parse({ data: rows }));
});

router.post("/consulting/checkout", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const parsed = CreateConsultingCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const pkg = findConsultingPackage(parsed.data.packageKey);
  if (!pkg) {
    res.status(404).json({ error: "Unknown consulting package" });
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
          unit_amount: Math.round(pkg.priceUsd * 100),
          product_data: {
            name: `Machinedog · ${pkg.name} consulting`,
            description: `${pkg.hours} hours of dedicated consulting time. ${pkg.description}`,
          },
        },
      },
    ],
    customer_email: req.dbClient!.email,
    client_reference_id: String(req.dbClient!.id),
    metadata: {
      kind: "consulting",
      clientId: String(req.dbClient!.id),
      packageKey: pkg.key,
      hours: String(pkg.hours),
    },
    success_url: `${origin}/consulting?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/consulting?status=cancelled`,
  });

  await db.insert(consultingBookingsTable).values({
    organizationId: req.dbClient!.id,
    packageKey: pkg.key,
    hoursTotal: pkg.hours,
    amountCents: Math.round(pkg.priceUsd * 100),
    status: "pending",
    stripeSessionId: session.id,
  });

  if (!session.url) {
    res.status(500).json({ error: "Stripe did not return a checkout URL" });
    return;
  }
  res.json(CreateConsultingCheckoutResponse.parse({ url: session.url }));
});

export default router;
