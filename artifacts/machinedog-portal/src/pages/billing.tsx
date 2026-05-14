import { useEffect, useState } from "react";
import { CreditCard, Check, ExternalLink, Shield, Sparkles, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  billingApi,
  type PlanCard,
  type SubscriptionInfo,
  type InvoiceRow,
} from "@/lib/billing-api";

type Interval = "monthly" | "annual";

export default function BillingPage() {
  const [plans, setPlans] = useState<PlanCard[] | null>(null);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("monthly");
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [portalPending, setPortalPending] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, s, i] = await Promise.all([
        billingApi.listPlans(),
        billingApi.getSubscription(),
        billingApi.listInvoices().catch(() => ({ data: [] as InvoiceRow[] })),
      ]);
      setPlans(p.data);
      setSub(s);
      setInvoices(i.data);
    } catch (err) {
      setError((err as Error).message ?? "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function startCheckout(planKey: string) {
    setPendingPlan(planKey);
    setError(null);
    try {
      const res = await billingApi.startCheckout(planKey, interval);
      if (res.mock) {
        await load();
      } else if (res.url) {
        window.location.href = res.url;
      } else {
        setError("Checkout did not return a URL.");
      }
    } catch (err) {
      setError((err as Error).message ?? "Checkout failed");
    } finally {
      setPendingPlan(null);
    }
  }

  async function openPortal() {
    setPortalPending(true);
    try {
      const res = await billingApi.customerPortal();
      if (res.url) window.location.href = res.url;
    } catch (err) {
      setError((err as Error).message ?? "Could not open Stripe customer portal");
    } finally {
      setPortalPending(false);
    }
  }

  const stripeConfigured = sub?.stripeConfigured ?? true;
  const currentPlan = sub?.subscription?.planType ?? sub?.organization.planType ?? "free";
  const currentStatus = sub?.subscription?.status ?? sub?.organization.planStatus ?? "none";

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full gap-8 overflow-y-auto">
      <header className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" />
          BILLING
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Manage your plan, view invoices, and change billing details.
        </p>
      </header>

      {!stripeConfigured && (
        <div className="glass-subtle border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold font-mono">Stripe disabled — using demo billing.</div>
            <div className="text-muted-foreground mt-1">
              Subscribing or buying tokens grants the allotment immediately and tags the ledger
              entry as <code className="text-xs">dev_mock</code>. No payment is taken.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="glass-subtle border border-red-500/30 rounded-xl p-3 text-sm text-red-400 font-mono">
          {error}
        </div>
      )}

      <section className="glass p-6 rounded-2xl flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Current plan</div>
          <div className="text-3xl font-bold font-mono capitalize tracking-tight">
            {currentPlan}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Status: <span className="text-foreground font-mono">{currentStatus}</span>
            {sub?.subscription?.currentPeriodEnd && (
              <>
                {" · Renews "}
                <span className="text-foreground font-mono">
                  {format(new Date(sub.subscription.currentPeriodEnd), "MMM d, yyyy")}
                </span>
              </>
            )}
          </div>
          {sub?.organization.baaStatus && sub.organization.baaStatus !== "not_required" && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <Shield className="h-3 w-3" /> BAA {sub.organization.baaStatus} — PHI mode locked
              until Phase 8 review completes.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-stretch md:items-end">
          <Button
            onClick={openPortal}
            disabled={portalPending || !stripeConfigured || !sub?.subscription}
            variant="secondary"
            className="font-mono font-bold"
          >
            {portalPending ? "Opening..." : "Manage in Stripe"}
            <ExternalLink className="ml-2 h-3 w-3" />
          </Button>
          <div className="text-[10px] text-muted-foreground font-mono text-right">
            Update card · cancel · invoices
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2">
            CHANGE_PLAN
          </h2>
          <div className="inline-flex rounded-full glass-subtle p-1 text-xs font-mono">
            {(["monthly", "annual"] as const).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`px-3 py-1 rounded-full transition uppercase ${
                  interval === i
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {i}
                {i === "annual" && <span className="ml-1 text-[9px] opacity-70">·SAVE</span>}
              </button>
            ))}
          </div>
        </div>

        {loading || !plans ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-72 glass rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((p) => {
              const price = interval === "annual" ? p.priceAnnualUsd : p.priceMonthlyUsd;
              const isCurrent = currentPlan === p.key;
              return (
                <div
                  key={p.key}
                  className={`glass p-5 rounded-2xl flex flex-col relative ${
                    p.popular ? "ring-1 ring-primary/40" : ""
                  } ${isCurrent ? "border-2 border-primary/60" : ""}`}
                >
                  {p.popular && (
                    <div className="absolute -top-2 left-4 bg-primary text-primary-foreground text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full">
                      Popular
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-2 right-4 bg-foreground text-background text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full">
                      Current
                    </div>
                  )}
                  <h3 className="font-bold text-lg font-mono">{p.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 mb-4 min-h-[2.5em]">
                    {p.tagline}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold font-mono">${price}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      /{interval === "annual" ? "yr" : "mo"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-primary font-mono">
                    <Sparkles className="h-3 w-3" />
                    {p.monthlyTokenGrant.toLocaleString()} tokens / mo
                  </div>

                  <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {p.requiresBaa && (
                    <div className="mt-3 text-[10px] font-mono text-blue-400 leading-tight">
                      Healthcare tier sets BAA review pending. PHI mode unlocks in Phase 8.
                    </div>
                  )}

                  <Button
                    onClick={() => startCheckout(p.key)}
                    disabled={pendingPlan !== null || isCurrent}
                    variant={isCurrent ? "secondary" : p.popular ? "default" : "secondary"}
                    className="mt-4 font-mono font-bold w-full"
                  >
                    {pendingPlan === p.key
                      ? "..."
                      : isCurrent
                        ? "Current plan"
                        : stripeConfigured
                          ? "Subscribe"
                          : "Subscribe (demo)"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2">
          INVOICES
        </h2>
        {!stripeConfigured ? (
          <div className="text-sm font-mono text-muted-foreground py-6 text-center glass-subtle rounded-xl">
            INVOICES_REQUIRE_STRIPE
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <div className="text-sm font-mono text-muted-foreground py-6 text-center glass-subtle rounded-xl">
            NO_INVOICES_YET
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="grid grid-cols-5 text-xs font-mono text-muted-foreground p-3 border-b border-border/20 glass-subtle uppercase">
              <div>Date</div>
              <div>Number</div>
              <div>Amount</div>
              <div>Status</div>
              <div className="text-right">Link</div>
            </div>
            <div className="divide-y divide-border/10">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="grid grid-cols-5 text-sm font-mono p-3 items-center hover:bg-muted/10"
                >
                  <div className="text-muted-foreground">
                    {format(new Date(inv.createdAt), "MMM d, yyyy")}
                  </div>
                  <div>{inv.number ?? "—"}</div>
                  <div>
                    ${(inv.amountPaid / 100).toFixed(2)} {inv.currency}
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded text-xs glass-subtle">
                      {inv.status ?? "—"}
                    </span>
                  </div>
                  <div className="text-right">
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
