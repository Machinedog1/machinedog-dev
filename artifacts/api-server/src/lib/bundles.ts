export type TokenBundleConfig = {
  key: string;
  name: string;
  tokens: number;
  priceUsd: number;
  popular: boolean;
  stripePriceIdEnv: string;
};

export const TOKEN_BUNDLES: TokenBundleConfig[] = [
  { key: "starter", name: "Starter", tokens: 500_000, priceUsd: 25, popular: false, stripePriceIdEnv: "STRIPE_PRICE_TOKENS_STARTER" },
  { key: "basic", name: "Basic", tokens: 1_000_000, priceUsd: 45, popular: false, stripePriceIdEnv: "STRIPE_PRICE_TOKENS_BASIC" },
  { key: "pro", name: "Pro", tokens: 2_500_000, priceUsd: 99, popular: true, stripePriceIdEnv: "STRIPE_PRICE_TOKENS_PRO" },
  { key: "business", name: "Business", tokens: 5_000_000, priceUsd: 179, popular: false, stripePriceIdEnv: "STRIPE_PRICE_TOKENS_BUSINESS" },
  { key: "scale", name: "Scale", tokens: 10_000_000, priceUsd: 329, popular: false, stripePriceIdEnv: "STRIPE_PRICE_TOKENS_SCALE" },
  { key: "enterprise", name: "Enterprise", tokens: 25_000_000, priceUsd: 749, popular: false, stripePriceIdEnv: "STRIPE_PRICE_TOKENS_ENTERPRISE" },
];

export type ConsultingPackageConfig = {
  key: string;
  name: string;
  hours: number;
  priceUsd: number;
  description: string;
  popular: boolean;
  stripePriceIdEnv: string;
};

export const CONSULTING_PACKAGES: ConsultingPackageConfig[] = [
  {
    key: "spark",
    name: "Spark",
    hours: 5,
    priceUsd: 1_250,
    description: "Five focused hours to unblock a single technical question or kick off a small project.",
    popular: false,
    stripePriceIdEnv: "STRIPE_PRICE_CONSULTING_SPARK",
  },
  {
    key: "build",
    name: "Build",
    hours: 10,
    priceUsd: 2_250,
    description: "Ten hours of dedicated build time across architecture, code review, and pair-programming.",
    popular: true,
    stripePriceIdEnv: "STRIPE_PRICE_CONSULTING_BUILD",
  },
  {
    key: "scale",
    name: "Scale",
    hours: 20,
    priceUsd: 4_000,
    description: "Twenty hours embedded with your team — ideal for delivering a feature end-to-end.",
    popular: false,
    stripePriceIdEnv: "STRIPE_PRICE_CONSULTING_SCALE",
  },
];

export function findTokenBundle(key: string): TokenBundleConfig | undefined {
  return TOKEN_BUNDLES.find((b) => b.key === key);
}

export function findConsultingPackage(key: string): ConsultingPackageConfig | undefined {
  return CONSULTING_PACKAGES.find((p) => p.key === key);
}
