import { useMemo, useState } from "react";
import {
  useListAdminTokens,
  getListAdminTokensQueryKey,
  type ListAdminTokensParams,
  type AdminTokenLedgerEntry,
} from "@workspace/api-client-react";
import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";
import { format } from "date-fns";

const LEDGER_TYPES = [
  "grant_monthly",
  "grant_signup",
  "purchase_pack",
  "deduct_ai",
  "deduct_build",
  "deduct_deploy",
  "deduct_template",
  "deduct_other",
  "admin_adjust",
  "refund",
] as const;
const PAGE_SIZE = 100;

type LedgerRow = AdminTokenLedgerEntry;

export default function AdminTokensPage() {
  const [type, setType] = useState<string>("all");
  const [orgId, setOrgId] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<LedgerRow | null>(null);

  const params: ListAdminTokensParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      type: type === "all" ? undefined : (type as "purchase_pack"),
      organizationId: orgId.trim() ? Number(orgId.trim()) : undefined,
    }),
    [type, orgId, offset],
  );
  const { data, isLoading } = useListAdminTokens(params, {
    query: { queryKey: getListAdminTokensQueryKey(params) },
  });

  const columns: AdminTableColumn<LedgerRow>[] = [
    {
      key: "when",
      header: "When",
      cell: (l) => (
        <span className="font-mono text-xs text-muted-foreground">
          {format(new Date(l.createdAt), "MMM d HH:mm")}
        </span>
      ),
    },
    {
      key: "org",
      header: "Org",
      cell: (l) => (
        <span className="font-mono text-xs">
          {l.organizationName ?? `#${l.organizationId}`}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (l) => <Badge variant="outline" className="font-mono uppercase">{l.type}</Badge>,
    },
    {
      key: "amount",
      header: "Amount",
      cell: (l) => (
        <span className={`font-mono ${l.amount < 0 ? "text-destructive" : "text-primary"}`}>
          {l.amount > 0 ? "+" : ""}{l.amount.toLocaleString()}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      cell: (l) => <span className="font-mono">{l.balanceAfter.toLocaleString()}</span>,
    },
    {
      key: "source",
      header: "Source",
      cell: (l) => <span className="font-mono text-xs">{l.source}</span>,
    },
    {
      key: "desc",
      header: "Description",
      cell: (l) => <span className="text-xs text-muted-foreground">{l.description ?? "—"}</span>,
    },
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" /> TOKEN_LEDGER
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Every grant, purchase, deduction, and admin adjustment across the platform.
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <Input
          value={orgId}
          onChange={(e) => { setOrgId(e.target.value); setOffset(0); }}
          placeholder="Organization id"
          className="md:w-48"
        />
        <Select value={type} onValueChange={(v) => { setType(v); setOffset(0); }}>
          <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {LEDGER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
        rowKey={(l) => l.id}
        onRowClick={(l) => setDetail(l)}
        emptyMessage="NO_LEDGER_ENTRIES"
      />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ledger entry #{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail && format(new Date(detail.createdAt), "MMM d, yyyy HH:mm:ss")}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-2 gap-3 text-sm font-mono">
              <F label="Org" value={detail.organizationName ?? `#${detail.organizationId}`} />
              <F label="Type" value={detail.type} />
              <F
                label="Amount"
                value={`${detail.amount > 0 ? "+" : ""}${detail.amount.toLocaleString()}`}
              />
              <F label="Balance after" value={detail.balanceAfter.toLocaleString()} />
              <F label="Source" value={detail.source} />
              <F label="Project" value={detail.projectId ? `#${detail.projectId}` : "—"} />
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-xs uppercase text-muted-foreground">Description</span>
                <span className="text-foreground break-words">{detail.description ?? "—"}</span>
              </div>
            </dl>
          )}
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
