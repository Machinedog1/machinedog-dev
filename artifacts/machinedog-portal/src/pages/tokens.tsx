import { useGetMe, useListTokenBundles, useListMyTokenPurchases, useCreateTokenCheckout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Coins, Zap, Shield, ChevronRight, Check } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function TokensPage() {
  const { data: me } = useGetMe();
  const { data: bundles, isLoading: bundlesLoading } = useListTokenBundles();
  const { data: purchases, isLoading: purchasesLoading } = useListMyTokenPurchases();
  const checkout = useCreateTokenCheckout();

  const handlePurchase = (bundleKey: string) => {
    checkout.mutate(
      { data: { bundleKey } },
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          }
        },
      }
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-5xl mx-auto w-full gap-8 overflow-y-auto">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" />
          TOKEN_STORE
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Acquire computing fuel for console execution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
        <div className="col-span-1 md:col-span-3 glass p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-sm font-mono text-muted-foreground uppercase mb-1">Current Balance</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold font-mono text-primary tracking-tighter">
                {me?.tokenBalance?.toLocaleString() || "0"}
              </span>
              <span className="text-lg font-mono text-muted-foreground">TKNS</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
              <Shield className="h-4 w-4" /> Lifetime usage: {me?.totalTokensUsed?.toLocaleString() || "0"}
            </p>
          </div>
          <div className="glass-subtle p-4 rounded-xl border border-border/20 text-sm font-mono max-w-sm w-full relative z-10">
            <div className="flex justify-between mb-2">
              <span className="text-foreground">Machinedog AI</span>
              <span className="text-primary font-bold">Active</span>
            </div>
            <div className="text-xs text-muted-foreground border-t border-border/20 pt-2 mt-2">
              Input: 3 TKNS / 1K tokens
              <br />
              Output: 15 TKNS / 1K tokens
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2">ACQUIRE_TOKENS</h2>
        
        {bundlesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full glass rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {bundles?.data.map((bundle, index) => (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                key={bundle.key}
                className={`glass-interactive p-6 rounded-2xl flex flex-col relative ${
                  bundle.popular ? "glass-strong border-primary/50 shadow-[0_0_30px_rgba(255,102,0,0.15)] ring-primary/30 -translate-y-2" : ""
                }`}
              >
                {bundle.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full font-mono uppercase tracking-wider shadow-lg">
                    Popular
                  </div>
                )}
                <div className="mb-4 flex-1 relative z-10">
                  <h3 className="font-bold text-lg mb-1">{bundle.name}</h3>
                  <div className="flex items-baseline gap-1 font-mono">
                    <span className="text-2xl font-bold text-primary">{bundle.tokens.toLocaleString()}</span>
                    <span className="text-sm text-muted-foreground">TKNS</span>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-border/20 flex items-center justify-between relative z-10">
                  <span className="font-mono text-xl">${bundle.priceUsd}</span>
                  <Button 
                    onClick={() => handlePurchase(bundle.key)}
                    disabled={checkout.isPending}
                    variant={bundle.popular ? "default" : "secondary"}
                    className={bundle.popular ? "font-mono font-bold shadow-lg shadow-primary/20" : "font-mono font-bold glass-subtle hover:bg-muted/50"}
                  >
                    {checkout.isPending && checkout.variables?.data.bundleKey === bundle.key ? "..." : "BUY"}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2 mt-4">PURCHASE_HISTORY</h2>
        
        {purchasesLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full glass rounded-xl" />
            <Skeleton className="h-12 w-full glass rounded-xl" />
          </div>
        ) : !purchases || purchases.data.length === 0 ? (
          <div className="text-sm font-mono text-muted-foreground py-8 text-center glass-subtle rounded-xl border-dashed">
            NO_PURCHASES_FOUND
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 text-xs font-mono text-muted-foreground p-3 border-b border-border/20 glass-subtle uppercase">
              <div>Date</div>
              <div>Amount</div>
              <div>Tokens</div>
              <div>Status</div>
            </div>
            <div className="divide-y divide-border/10">
              {purchases.data.map((p) => (
                <div key={p.id} className="grid grid-cols-4 text-sm font-mono p-3 items-center hover:bg-muted/10 transition-colors">
                  <div className="text-muted-foreground">{format(new Date(p.createdAt), "MMM d, yyyy")}</div>
                  <div>${(p.amountCents / 100).toFixed(2)}</div>
                  <div className="text-primary font-bold">+{p.tokensAdded.toLocaleString()}</div>
                  <div>
                    <span className={`px-2 py-0.5 rounded text-xs glass-subtle ${
                      p.status === "completed" ? "text-green-500 ring-green-500/30" : "text-yellow-500 ring-yellow-500/30"
                    }`}>
                      {p.status}
                    </span>
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
