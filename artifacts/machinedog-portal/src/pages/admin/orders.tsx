import { useMemo, useState } from "react";
import {
  useListAllBuildOrders,
  getListAllBuildOrdersQueryKey,
  type ListAllBuildOrdersParams,
  type BuildOrder,
} from "@workspace/api-client-react";
import { Briefcase, ShieldAlert, ExternalLink, Package, Repeat, Search } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";

const PAGE_SIZE = 25;
const STATUSES = ["pending", "completed", "active", "cancelled"] as const;
const KINDS = ["build", "retainer"] as const;

type OrderKind = (typeof KINDS)[number];
type OrderStatus = (typeof STATUSES)[number];

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  completed: "default",
  active: "default",
  cancelled: "destructive",
};

function stripeUrl(o: BuildOrder): string {
  const base = "https://dashboard.stripe.com";
  if (o.kind === "retainer" && o.stripeSubscriptionId) {
    return `${base}/subscriptions/${o.stripeSubscriptionId}`;
  }
  if (o.stripePaymentIntentId) {
    return `${base}/payments/${o.stripePaymentIntentId}`;
  }
  return `${base}/payments?query=${encodeURIComponent(o.stripeSessionId)}`;
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

export default function AdminOrdersPage() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [kind, setKind] = useState<"all" | OrderKind>("all");
  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<BuildOrder | null>(null);

  const params: ListAllBuildOrdersParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      kind: kind === "all" ? undefined : kind,
      status: status === "all" ? undefined : status,
      search: appliedSearch.trim() || undefined,
    }),
    [offset, kind, status, appliedSearch],
  );
  const { data, isLoading } = useListAllBuildOrders(params, {
    query: { queryKey: getListAllBuildOrdersQueryKey(params) },
  });

  const columns: AdminTableColumn<BuildOrder>[] = [
    {
      key: "kind",
      header: "Kind",
      cell: (o) => (
        <Badge variant="secondary" className="font-mono uppercase inline-flex items-center gap-1">
          {o.kind === "retainer" ? <Repeat className="h-3 w-3" /> : <Package className="h-3 w-3" />}
          {o.kind}
        </Badge>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (o) => (
        <div className="flex flex-col min-w-0">
          <span className="font-mono font-bold text-foreground truncate">
            {o.name?.trim() || o.email?.trim() || "(unknown)"}
          </span>
          {o.email && o.name && (
            <span className="text-xs font-mono text-muted-foreground truncate">{o.email}</span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground/60">
            #{o.id} · {o.source}
          </span>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      cell: (o) => (
        <span className="font-mono font-bold">{formatAmount(o.amountCents, o.currency)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => (
        <Badge variant={statusVariant[o.status] ?? "secondary"} className="font-mono uppercase">
          {o.status}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (o) => (
        <span className="font-mono text-xs text-muted-foreground">
          {format(new Date(o.createdAt), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      key: "stripe",
      header: "",
      className: "text-right",
      cell: (o) => (
        <a
          href={stripeUrl(o)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-primary"
          title="Open in Stripe dashboard"
        >
          <ExternalLink className="h-4 w-4 inline" />
        </a>
      ),
    },
  ];

  const submitSearch = () => {
    setAppliedSearch(search);
    setOffset(0);
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-primary" /> PAID_ORDERS
        </h1>
        <p className="text-muted-foreground text-sm font-mono flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Premium Build deposits and monthly retainer
          subscriptions.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={submitSearch}
            placeholder="Search customer, email, company, session id (press enter)"
            className="pl-9"
          />
        </form>
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v as "all" | OrderKind);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as "all" | OrderStatus);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <AdminTable
        columns={columns}
        rows={data?.data}
        total={data?.total}
        isLoading={isLoading}
        limit={PAGE_SIZE}
        offset={offset}
        onPageChange={setOffset}
        rowKey={(o) => o.id}
        onRowClick={(o) => setDetail(o)}
        emptyMessage="NO_ORDERS"
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order #{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail && format(new Date(detail.createdAt), "MMM d, yyyy HH:mm:ss")}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-2 gap-3 text-sm font-mono">
              <F label="Kind" value={detail.kind} />
              <F label="Status" value={detail.status} />
              <F label="Amount" value={formatAmount(detail.amountCents, detail.currency)} />
              <F label="Source" value={detail.source} />
              <F label="Email" value={detail.email ?? "—"} />
              <F label="Name" value={detail.name ?? "—"} />
              <F label="Company" value={detail.company ?? "—"} />
              <F label="Stripe customer" value={detail.stripeCustomerId ?? "—"} />
              <F label="Stripe session" value={detail.stripeSessionId} />
              <F label="Subscription" value={detail.stripeSubscriptionId ?? "—"} />
              <F label="Payment intent" value={detail.stripePaymentIntentId ?? "—"} />
              <F
                label="Completed"
                value={
                  detail.completedAt
                    ? format(new Date(detail.completedAt), "MMM d, yyyy HH:mm")
                    : "—"
                }
              />
            </dl>
          )}
          <DialogFooter>
            {detail && (
              <a href={stripeUrl(detail)} target="_blank" rel="noreferrer">
                <Button variant="outline">
                  Open in Stripe <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </a>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-foreground break-words">{value}</span>
    </div>
  );
}
