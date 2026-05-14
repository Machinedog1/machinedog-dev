import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin } from "./lib/bootstrap-admin";
import { seedTemplates } from "./lib/seed-templates";
import { isStripeConfigured, isDemoBillingAllowed } from "./lib/billing-service";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Loud guard: in production the billing routes must never fall back to the
// mock checkout path. If Stripe isn't configured here, abort boot rather
// than silently expose a free-credit grant endpoint.
if (process.env.NODE_ENV === "production" && !isStripeConfigured()) {
  logger.error(
    "STRIPE_SECRET_KEY is not set in production. Refusing to start: billing routes would be insecure.",
  );
  throw new Error("Refusing to boot in production without STRIPE_SECRET_KEY");
}
if (isDemoBillingAllowed()) {
  logger.warn(
    "BILLING_DEMO_MODE is enabled. Mock checkout is active — never enable this in production.",
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Fire-and-forget bootstrap so it doesn't block request handling.
  bootstrapAdmin().catch((boot) => {
    logger.error({ err: boot }, "bootstrapAdmin threw");
  });
  seedTemplates().catch((err) => {
    logger.error({ err }, "seedTemplates threw");
  });
});
