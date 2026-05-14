/**
 * Phase 1 plan + token-pack catalog. The Stripe Price IDs live in env so
 * the same code works across local / staging / prod.
 *
 * Pricing v1 is intentionally flat-fee, no per-seat. See setup-stripe.md.
 */

export type PlanType = "starter" | "pro" | "business" | "healthcare" | "enterprise";
export type BillingInterval = "monthly" | "annual";

export type PlanConfig = {
  key: PlanType;
  name: string;
  tagline: string;
  priceMonthlyUsd: number;
  priceAnnualUsd: number; // total billed once per year
  /** Tokens granted on every successful invoice.paid (i.e. each renewal). */
  monthlyTokenGrant: number;
  popular: boolean;
  features: string[];
  /** Env var that holds the Stripe Price ID for the monthly plan. */
  stripePriceMonthlyEnv: string;
  /** Env var that holds the Stripe Price ID for the annual plan. */
  stripePriceAnnualEnv: string;
  /** Whether selecting this plan kicks off a BAA review (Phase 8 unlocks PHI). */
  requiresBaa: boolean;
};

export const PLANS: PlanConfig[] = [
  {
    key: "starter",
    name: "Starter",
    tagline: "For solo builders trying out the platform",
    priceMonthlyUsd: 29,
    priceAnnualUsd: 290,
    monthlyTokenGrant: 1_000_000,
    popular: false,
    features: ["1M tokens / month", "1 active project", "Community support"],
    stripePriceMonthlyEnv: "STRIPE_PRICE_PLAN_STARTER_MONTHLY",
    stripePriceAnnualEnv: "STRIPE_PRICE_PLAN_STARTER_ANNUAL",
    requiresBaa: false,
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "For serious indie operators",
    priceMonthlyUsd: 99,
    priceAnnualUsd: 990,
    monthlyTokenGrant: 5_000_000,
    popular: true,
    features: ["5M tokens / month", "5 active projects", "Email support", "Custom domains"],
    stripePriceMonthlyEnv: "STRIPE_PRICE_PLAN_PRO_MONTHLY",
    stripePriceAnnualEnv: "STRIPE_PRICE_PLAN_PRO_ANNUAL",
    requiresBaa: false,
  },
  {
    key: "business",
    name: "Business",
    tagline: "For teams shipping production apps",
    priceMonthlyUsd: 299,
    priceAnnualUsd: 2_990,
    monthlyTokenGrant: 20_000_000,
    popular: false,
    features: ["20M tokens / month", "Unlimited projects", "Priority support", "SSO via Clerk"],
    stripePriceMonthlyEnv: "STRIPE_PRICE_PLAN_BUSINESS_MONTHLY",
    stripePriceAnnualEnv: "STRIPE_PRICE_PLAN_BUSINESS_ANNUAL",
    requiresBaa: false,
  },
  {
    key: "healthcare",
    name: "Healthcare",
    tagline: "HIPAA-aligned tier with BAA on file",
    priceMonthlyUsd: 599,
    priceAnnualUsd: 5_990,
    monthlyTokenGrant: 20_000_000,
    popular: false,
    features: [
      "Everything in Business",
      "BAA execution + PHI Guard (Phase 8)",
      "Audit log retention (7 years)",
    ],
    stripePriceMonthlyEnv: "STRIPE_PRICE_PLAN_HEALTHCARE_MONTHLY",
    stripePriceAnnualEnv: "STRIPE_PRICE_PLAN_HEALTHCARE_ANNUAL",
    requiresBaa: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    tagline: "For organizations with custom requirements",
    priceMonthlyUsd: 1_999,
    priceAnnualUsd: 19_990,
    monthlyTokenGrant: 100_000_000,
    popular: false,
    features: [
      "Everything in Business",
      "Dedicated success engineer",
      "Custom SLAs",
      "Volume token discounts",
    ],
    stripePriceMonthlyEnv: "STRIPE_PRICE_PLAN_ENTERPRISE_MONTHLY",
    stripePriceAnnualEnv: "STRIPE_PRICE_PLAN_ENTERPRISE_ANNUAL",
    requiresBaa: false,
  },
];

export type TokenPackConfig = {
  key: "small" | "medium" | "large";
  name: string;
  tokens: number;
  priceUsd: number;
  popular: boolean;
  stripePriceIdEnv: string;
};

export const TOKEN_PACKS: TokenPackConfig[] = [
  {
    key: "small",
    name: "Small Pack",
    tokens: 1_000_000,
    priceUsd: 25,
    popular: false,
    stripePriceIdEnv: "STRIPE_PRICE_PACK_SMALL",
  },
  {
    key: "medium",
    name: "Medium Pack",
    tokens: 5_000_000,
    priceUsd: 99,
    popular: true,
    stripePriceIdEnv: "STRIPE_PRICE_PACK_MEDIUM",
  },
  {
    key: "large",
    name: "Large Pack",
    tokens: 20_000_000,
    priceUsd: 349,
    popular: false,
    stripePriceIdEnv: "STRIPE_PRICE_PACK_LARGE",
  },
];

export function findPlan(key: string): PlanConfig | undefined {
  return PLANS.find((p) => p.key === key);
}

export function findTokenPack(key: string): TokenPackConfig | undefined {
  return TOKEN_PACKS.find((p) => p.key === key);
}

export function planPriceId(plan: PlanConfig, interval: BillingInterval): string | null {
  const env = interval === "annual" ? plan.stripePriceAnnualEnv : plan.stripePriceMonthlyEnv;
  return process.env[env] ?? null;
}

export function tokenPackPriceId(pack: TokenPackConfig): string | null {
  return process.env[pack.stripePriceIdEnv] ?? null;
}

/**
 * Resolve a plan / interval from the Stripe price id we got back on a webhook.
 * Returns null if the price isn't recognized (e.g. legacy product, manual sub).
 */
export function planFromPriceId(
  priceId: string,
): { plan: PlanConfig; interval: BillingInterval } | null {
  for (const plan of PLANS) {
    if (process.env[plan.stripePriceMonthlyEnv] === priceId) return { plan, interval: "monthly" };
    if (process.env[plan.stripePriceAnnualEnv] === priceId) return { plan, interval: "annual" };
  }
  return null;
}

export function tokenPackFromPriceId(priceId: string): TokenPackConfig | null {
  for (const pack of TOKEN_PACKS) {
    if (process.env[pack.stripePriceIdEnv] === priceId) return pack;
  }
  return null;
}
