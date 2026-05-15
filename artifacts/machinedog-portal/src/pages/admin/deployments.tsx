import { useMemo, useState } from "react";
import {
  useListAdminDeployments,
  getListAdminDeploymentsQueryKey,
  type ListAdminDeploymentsParams,
  type Deployment,
} from "@workspace/api-client-react";
import { Rocket, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";

const PAGE_SIZE = 50;
const PROVIDERS = ["replit", "vercel", "render"] as const;
const STATUSES = ["pending", "building", "live", "failed", "canceled", "rolled_back"] as const;

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  building: "secondary",
  live: "default",
  failed: "destructive",
  canceled: "outline",
  rolled_back: "outline",
};

interface Filters {
  organizationId?: number;
  projectId?: number;
  provider?: "replit" | "vercel" | "render";
  status?: "pending" | "building" | "live" | "failed" | "canceled" | "rolled_back";
  since?: string;
  until?: string;
}

export default function AdminDeploymentsPage() {
  const [pending, setPending] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Deployment | null>(null);

  const params: ListAdminDeploymentsParams = useMemo(
    () => ({ limit: PAGE_SIZE, offset, ...filters }),
    [offset, filters],
  );
  const { data, isLoading } = useListAdminDeployments(params, {
    query: { queryKey: getListAdminDeploymentsQueryKey(params), refetchInterval: 8000 },
  });

  const apply = () => {
    setFilters(pending);
    setOffset(0);
  };
  const clear = () => {
    setPending({});
    setFilters({});
    setOffset(0);
  };

  const columns: AdminTableColumn<Deployment>[] = [
    {
      key: "time",
      header: "Time",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(r.createdAt), "MMM d HH:mm:ss")}
        </span>
      ),
    },
    { key: "org", header: "Org", cell: (r) => <span className="font-mono">#{r.organizationId}</span> },
    { key: "project", header: "Project", cell: (r) => <span className="font-mono">#{r.projectId}</span> },
    { key: "provider", header: "Provider", cell: (r) => <span className="font-mono uppercase">{r.provider}</span> },
    { key: "env", header: "Env", cell: (r) => <span className="font-mono uppercase">{r.environment}</span> },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge variant={statusVariant[r.status] ?? "secondary"} className="font-mono uppercase">
          {r.status}
        </Badge>
      ),
    },
    {
      key: "url",
      header: "URL",
      cell: (r) =>
        r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs underline text-primary truncate max-w-[200px] inline-block"
          >
            {r.url.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "commit",
      header: "Commit",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.commitSha ? r.commitSha.slice(0, 8) : "—"}
        </span>
      ),
    },
    { key: "tokens", header: "Tokens", cell: (r) => <span className="font-mono">{r.tokenCost}</span> },
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Rocket className="h-6 w-6 text-primary" /> DEPLOYMENTS
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          {data?.total?.toLocaleString() ?? "—"} deployments across all organizations.
        </p>
      </div>

      <div className="glass rounded-2xl p-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <Input
          placeholder="org id"
          value={pending.organizationId ?? ""}
          onChange={(e) =>
            setPending((s) => ({
              ...s,
              organizationId: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
          className="font-mono text-xs"
        />
        <Input
          placeholder="project id"
          value={pending.projectId ?? ""}
          onChange={(e) =>
            setPending((s) => ({
              ...s,
              projectId: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
          className="font-mono text-xs"
        />
        <Select
          value={pending.provider ?? "all"}
          onValueChange={(v) =>
            setPending((s) => ({
              ...s,
              provider: v === "all" ? undefined : (v as Filters["provider"]),
            }))
          }
        >
          <SelectTrigger><SelectValue placeholder="provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={pending.status ?? "all"}
          onValueChange={(v) =>
            setPending((s) => ({
              ...s,
              status: v === "all" ? undefined : (v as Filters["status"]),
            }))
          }
        >
          <SelectTrigger><SelectValue placeholder="status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="datetime-local"
          value={pending.since ?? ""}
          onChange={(e) => setPending((s) => ({ ...s, since: e.target.value || undefined }))}
          className="font-mono text-xs"
        />
        <Input
          type="datetime-local"
          value={pending.until ?? ""}
          onChange={(e) => setPending((s) => ({ ...s, until: e.target.value || undefined }))}
          className="font-mono text-xs"
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={clear}>CLEAR</Button>
          <Button size="sm" onClick={apply}>APPLY</Button>
        </div>
      </div>

      <AdminTable
        columns={columns}
        rows={data?.data}
        total={data?.total}
        isLoading={isLoading}
        limit={PAGE_SIZE}
        offset={offset}
        onPageChange={setOffset}
        rowKey={(r) => r.id}
        onRowClick={(r) => setDetail(r)}
        emptyMessage="NO_DEPLOYMENTS"
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deployment #{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail && format(new Date(detail.createdAt), "MMM d, yyyy HH:mm:ss")}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-2 gap-3 text-sm font-mono">
              <F label="Org" value={`#${detail.organizationId}`} />
              <F label="Project" value={`#${detail.projectId}`} />
              <F label="Provider" value={detail.provider} />
              <F label="Environment" value={detail.environment} />
              <F label="Status" value={detail.status} />
              <F label="Branch" value={detail.branch ?? "—"} />
              <F label="Commit" value={detail.commitSha ?? "—"} />
              <F label="Tokens" value={String(detail.tokenCost)} />
              <F label="External id" value={detail.externalId ?? "—"} />
              <F label="Build job" value={detail.buildJobId ? `#${detail.buildJobId}` : "—"} />
              <F
                label="Deployed at"
                value={
                  detail.deployedAt
                    ? format(new Date(detail.deployedAt), "MMM d, yyyy HH:mm")
                    : "—"
                }
              />
              {detail.url && (
                <div className="col-span-2">
                  <a
                    href={detail.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline text-xs inline-flex items-center gap-1"
                  >
                    {detail.url} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {detail.errorMessage && (
                <div className="col-span-2 flex flex-col gap-1">
                  <span className="text-xs uppercase text-muted-foreground">Error</span>
                  <span className="text-destructive break-words">{detail.errorMessage}</span>
                </div>
              )}
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
