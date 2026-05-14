/**
 * Phase 1 billing/token client. Hand-rolled because the new endpoints aren't
 * (yet) part of the OpenAPI spec — the existing useGetMe / useListTokenBundles
 * hooks keep working unchanged for the legacy bundles flow.
 */

const BASE = "/api";

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // ignore
    }
    const err = new Error(`HTTP ${res.status}`) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return (await res.json()) as T;
}

export interface PlanCard {
  key: "starter" | "pro" | "business" | "healthcare" | "enterprise";
  name: string;
  tagline: string;
  priceMonthlyUsd: number;
  priceAnnualUsd: number;
  monthlyTokenGrant: number;
  popular: boolean;
  features: string[];
  requiresBaa: boolean;
  stripePriceMonthlyId: string | null;
  stripePriceAnnualId: string | null;
}

export interface TokenPackCard {
  key: "small" | "medium" | "large";
  name: string;
  tokens: number;
  priceUsd: number;
  popular: boolean;
  stripePriceId: string | null;
}

export interface SubscriptionInfo {
  subscription: {
    id: number;
    planType: string;
    billingInterval: "monthly" | "annual";
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    source: "stripe" | "dev_mock";
  } | null;
  organization: {
    id: number;
    name: string;
    planType: string;
    planStatus: string;
    baaStatus: string;
  };
  stripeConfigured: boolean;
}

export interface InvoiceRow {
  id: string;
  number: string | null;
  amountPaid: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

export interface UsageBucket {
  category: "ai" | "build" | "deploy" | "template" | "other" | "purchase" | "grant" | "admin";
  totalAmount: number;
  count: number;
}

export interface LedgerRow {
  id: number;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  source: string;
  createdAt: string;
}

export const billingApi = {
  listPlans: () => jsonFetch<{ data: PlanCard[]; stripeConfigured: boolean }>("/billing/plans"),
  listTokenPacks: () =>
    jsonFetch<{ data: TokenPackCard[]; stripeConfigured: boolean }>("/billing/token-packs"),
  getSubscription: () => jsonFetch<SubscriptionInfo>("/billing/subscription"),
  listInvoices: () => jsonFetch<{ data: InvoiceRow[] }>("/billing/invoices"),
  startCheckout: (planType: string, interval: "monthly" | "annual") =>
    jsonFetch<{ url: string | null; mock: boolean }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planType, interval }),
    }),
  buyTokens: (packKey: string) =>
    jsonFetch<{ url: string | null; mock: boolean }>("/billing/buy-tokens", {
      method: "POST",
      body: JSON.stringify({ packKey }),
    }),
  customerPortal: () =>
    jsonFetch<{ url: string }>("/billing/portal", { method: "POST" }),
  getBalance: () => jsonFetch<{ balance: number }>("/tokens/balance"),
  getUsage: () => jsonFetch<{ data: UsageBucket[] }>("/tokens/usage"),
  getLedger: () => jsonFetch<{ data: LedgerRow[] }>("/tokens/ledger"),
};
