import Stripe from "stripe";
import { logger } from "./logger";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    logger.warn("STRIPE_SECRET_KEY is not set — checkout endpoints will return 503");
    return null;
  }
  _stripe = new Stripe(key);
  return _stripe;
}

export function getStripeOrThrow(): Stripe {
  const s = getStripe();
  if (!s) {
    throw new Error("Stripe is not configured");
  }
  return s;
}

export function publicOrigin(req: { protocol: string; get: (h: string) => string | undefined }): string {
  const explicit = process.env.PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${host}`;
}
