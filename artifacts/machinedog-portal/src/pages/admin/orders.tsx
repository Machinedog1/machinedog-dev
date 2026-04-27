import { useListAllBuildOrders } from "@workspace/api-client-react";
import { Briefcase, ShieldAlert, ExternalLink, Package, Repeat } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const statusStyles: Record<string, string> = {
  pending: "text-yellow-500 ring-yellow-500/30",
  completed: "text-green-500 ring-green-500/30",
  active: "text-primary ring-primary/30",
  cancelled: "text-destructive ring-destructive/30",
};

function stripeUrl(order: {
  stripeSubscriptionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeSessionId: string;
  kind: string;
}): string {
  // Default to live dashboard; Stripe will fall back to test mode automatically
  // when the user is signed in to a test account.
  const base = "https://dashboard.stripe.com";
  if (order.kind === "retainer" && order.stripeSubscriptionId) {
    return `${base}/subscriptions/${order.stripeSubscriptionId}`;
  }
  if (order.stripePaymentIntentId) {
    return `${base}/payments/${order.stripePaymentIntentId}`;
  }
  return `${base}/payments?query=${encodeURIComponent(order.stripeSessionId)}`;
}

function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${(currency || "usd").toUpperCase()}`;
  }
}

export default function AdminOrders() {
  const { data, isLoading } = useListAllBuildOrders();

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full gap-6">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-primary" />
          PAID_ORDERS
        </h1>
        <p className="text-muted-foreground text-sm font-mono flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Premium Build deposits and monthly retainer subscriptions.
        </p>
      </div>

      <div className="glass rounded-2xl overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="grid grid-cols-12 text-xs font-mono text-muted-foreground p-4 border-b border-border/20 glass-subtle uppercase shrink-0 gap-2">
          <div className="col-span-2">Kind</div>
          <div className="col-span-3">Customer</div>
          <div className="col-span-2">Amount</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Created</div>
          <div className="col-span-1 text-right">Stripe</div>
        </div>

        <div className="divide-y divide-border/10 overflow-y-auto flex-1">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="p-4">
                <Skeleton className="h-6 w-full glass" />
              </div>
            ))
          ) : !data?.data?.length ? (
            <div className="p-8 text-center text-muted-foreground font-mono text-sm">
              NO_ORDERS_YET
            </div>
          ) : (
            data.data.map((order) => {
              const customerLabel =
                (order.name && order.name.trim()) ||
                (order.email && order.email.trim()) ||
                "(unknown)";
              const status = order.status as keyof typeof statusStyles;
              const styleKey = statusStyles[status] ?? "text-muted-foreground ring-border/30";
              return (
                <div
                  key={order.id}
                  className="grid grid-cols-12 text-sm items-center p-4 hover:bg-muted/10 transition-colors gap-2"
                >
                  <div className="col-span-2">
                    <span className="font-mono text-xs font-bold text-primary glass-subtle px-2 py-0.5 rounded uppercase inline-flex items-center gap-1">
                      {order.kind === "retainer" ? (
                        <Repeat className="h-3 w-3" />
                      ) : (
                        <Package className="h-3 w-3" />
                      )}
                      {order.kind}
                    </span>
                  </div>
                  <div className="col-span-3 flex flex-col min-w-0">
                    <span className="font-mono font-bold text-foreground truncate">
                      {customerLabel}
                    </span>
                    {order.email && order.name && (
                      <span className="text-xs font-mono text-muted-foreground truncate">
                        {order.email}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-muted-foreground/60 truncate">
                      ID: {order.id} · {order.source}
                    </span>
                  </div>
                  <div className="col-span-2 font-mono font-bold text-foreground">
                    {formatAmount(order.amountCents, order.currency)}
                  </div>
                  <div className="col-span-2">
                    <span
                      className={`text-xs font-mono px-2 py-0.5 rounded uppercase glass-subtle ring-1 ${styleKey}`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="col-span-2 font-mono text-xs text-muted-foreground">
                    {format(new Date(order.createdAt), "MMM d, yyyy")}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <a
                      href={stripeUrl(order)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title="Open in Stripe dashboard"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {data?.total != null && data.total > 0 && (
          <div className="p-3 border-t border-border/20 glass-subtle text-xs font-mono text-muted-foreground text-right shrink-0">
            {data.data.length} of {data.total} orders
          </div>
        )}
      </div>
    </div>
  );
}
