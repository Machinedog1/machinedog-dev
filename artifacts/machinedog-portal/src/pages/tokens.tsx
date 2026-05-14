import { useEffect, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Coins, Shield, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import {
  billingApi,
  type TokenPackCard,
  type UsageBucket,
  type LedgerRow,
} from "@/lib/billing-api";

const CATEGORY_LABEL: Record<UsageBucket["category"], string> = {
  ai: "AI prompts",
  build: "Builds",
  deploy: "Deploys",
  template: "Templates",
  other: "Other",
  purchase: "Purchases",
  grant: "Plan grants",
  admin: "Admin / refunds",
};

export default function TokensPage() {
  const { data: me } = useGetMe();
  const [packs, setPacks] = useState<TokenPackCard[] | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageBucket[] | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingPack, setPendingPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [p, b, u, l] = await Promise.all([
        billingApi.listTokenPacks(),
        billingApi.getBalance().catch(() => ({ balance: me?.tokenBalance ?? 0 })),
        billingApi.getUsage().catch(() => ({ data: [] as UsageBucket[] })),
        billingApi.getLedger().catch(() => ({ data: [] as LedgerRow[] })),
      ]);
      setPacks(p.data);
      setStripeConfigured(p.stripeConfigured);
      setBalance(b.balance);
      setUsage(u.data);
      setLedger(l.data);
    } catch (err) {
      setError((err as Error).message ?? "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buy(packKey: string) {
    setPendingPack(packKey);
    setError(null);
    try {
      const res = await billingApi.buyTokens(packKey);
      if (res.mock) {
        await load();
      } else if (res.url) {
        window.location.href = res.url;
      }
    } catch (err) {
      setError((err as Error).message ?? "Purchase failed");
    } finally {
      setPendingPack(null);
    }
  }

  const displayBalance = balance ?? me?.tokenBalance ?? 0;

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-5xl mx-auto w-full gap-8 overflow-y-auto">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" />
          TOKEN_STORE
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Buy token packs and track usage across AI, builds, deploys, and templates.
        </p>
      </div>

      {!stripeConfigured && (
        <div className="glass-subtle border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold font-mono">Stripe disabled — using demo billing.</div>
            <div className="text-muted-foreground mt-1">
              Pack purchases credit the balance immediately and tag the ledger entry as
              <code className="text-xs ml-1">dev_mock</code>.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="glass-subtle border border-red-500/30 rounded-xl p-3 text-sm text-red-400 font-mono">
          {error}
        </div>
      )}

      {/* Balance card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
        <div className="col-span-1 md:col-span-3 glass p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-sm font-mono text-muted-foreground uppercase mb-1">
              Current Balance
            </h2>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold font-mono text-primary tracking-tighter">
                {displayBalance.toLocaleString()}
              </span>
              <span className="text-lg font-mono text-muted-foreground">TKNS</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
              <Shield className="h-4 w-4" /> Lifetime usage:{" "}
              {me?.totalTokensUsed?.toLocaleString() || "0"}
            </p>
          </div>
        </div>
      </div>

      {/* Token packs */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2">
          BUY_TOKEN_PACK
        </h2>

        {loading || !packs ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full glass rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {packs.map((pack, index) => (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                key={pack.key}
                className={`glass-interactive p-6 rounded-2xl flex flex-col relative ${
                  pack.popular
                    ? "glass-strong border-primary/50 shadow-[0_0_30px_rgba(255,102,0,0.15)] ring-primary/30 -translate-y-2"
                    : ""
                }`}
              >
                {pack.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full font-mono uppercase tracking-wider shadow-lg">
                    Popular
                  </div>
                )}
                <div className="mb-4 flex-1 relative z-10">
                  <h3 className="font-bold text-lg mb-1">{pack.name}</h3>
                  <div className="flex items-baseline gap-1 font-mono">
                    <span className="text-2xl font-bold text-primary">
                      {pack.tokens.toLocaleString()}
                    </span>
                    <span className="text-sm text-muted-foreground">TKNS</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border/20 flex items-center justify-between relative z-10">
                  <span className="font-mono text-xl">${pack.priceUsd}</span>
                  <Button
                    onClick={() => buy(pack.key)}
                    disabled={pendingPack !== null}
                    variant={pack.popular ? "default" : "secondary"}
                    className={
                      pack.popular
                        ? "font-mono font-bold shadow-lg shadow-primary/20"
                        : "font-mono font-bold glass-subtle hover:bg-muted/50"
                    }
                  >
                    {pendingPack === pack.key ? "..." : "BUY"}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Usage by category */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2 mt-4">
          USAGE_BY_CATEGORY
        </h2>
        {loading ? (
          <Skeleton className="h-32 w-full glass rounded-xl" />
        ) : !usage || usage.length === 0 ? (
          <div className="text-sm font-mono text-muted-foreground py-8 text-center glass-subtle rounded-xl border-dashed">
            NO_USAGE_RECORDED_YET
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 text-xs font-mono text-muted-foreground p-3 border-b border-border/20 glass-subtle uppercase">
              <div>Category</div>
              <div className="text-right">Tokens</div>
              <div className="text-right">Events</div>
            </div>
            <div className="divide-y divide-border/10">
              {usage.map((u) => {
                const negative = u.totalAmount < 0;
                return (
                  <div
                    key={u.category}
                    className="grid grid-cols-3 text-sm font-mono p-3 items-center hover:bg-muted/10"
                  >
                    <div className="flex items-center gap-2">
                      {negative ? (
                        <TrendingDown className="h-3 w-3 text-red-400" />
                      ) : (
                        <TrendingUp className="h-3 w-3 text-green-400" />
                      )}
                      {CATEGORY_LABEL[u.category] ?? u.category}
                    </div>
                    <div className={`text-right ${negative ? "text-red-400" : "text-green-400"}`}>
                      {u.totalAmount > 0 ? "+" : ""}
                      {u.totalAmount.toLocaleString()}
                    </div>
                    <div className="text-right text-muted-foreground">{u.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent ledger entries */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2 mt-4">
          RECENT_ACTIVITY
        </h2>
        {loading ? (
          <Skeleton className="h-32 w-full glass rounded-xl" />
        ) : !ledger || ledger.length === 0 ? (
          <div className="text-sm font-mono text-muted-foreground py-8 text-center glass-subtle rounded-xl border-dashed">
            NO_ACTIVITY_YET
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 text-xs font-mono text-muted-foreground p-3 border-b border-border/20 glass-subtle uppercase">
              <div>Date</div>
              <div>Type</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Balance</div>
            </div>
            <div className="divide-y divide-border/10">
              {ledger.slice(0, 25).map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-4 text-sm font-mono p-3 items-center hover:bg-muted/10"
                >
                  <div className="text-muted-foreground">
                    {format(new Date(row.createdAt), "MMM d, HH:mm")}
                  </div>
                  <div className="text-xs">
                    {row.type}
                    {row.source === "dev_mock" && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 text-[10px]">
                        demo
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-right ${
                      row.amount < 0 ? "text-red-400" : "text-green-400"
                    }`}
                  >
                    {row.amount > 0 ? "+" : ""}
                    {row.amount.toLocaleString()}
                  </div>
                  <div className="text-right text-muted-foreground">
                    {row.balanceAfter.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
