import { useMemo, useState } from "react";
import {
  useListAdminAudit,
  getListAdminAuditQueryKey,
  type ListAdminAuditParams,
  type AuditEvent,
} from "@workspace/api-client-react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface Filters {
  organizationId?: number;
  projectId?: number;
  action?: string;
  actor?: string;
  since?: string;
  until?: string;
}

export default function AdminAuditPage() {
  const [pending, setPending] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<AuditEvent | null>(null);

  const params: ListAdminAuditParams = useMemo(
    () => ({ limit: PAGE_SIZE, offset, ...filters } as ListAdminAuditParams),
    [offset, filters],
  );
  const { data, isLoading } = useListAdminAudit(params, {
    query: { queryKey: getListAdminAuditQueryKey(params) },
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

  const columns: AdminTableColumn<AuditEvent>[] = [
    {
      key: "time",
      header: "Time",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(r.createdAt), "MMM d HH:mm:ss")}
        </span>
      ),
    },
    { key: "org", header: "Org", cell: (r) => <span className="font-mono">{r.organizationId ?? "—"}</span> },
    { key: "project", header: "Project", cell: (r) => <span className="font-mono">{r.projectId ?? "—"}</span> },
    {
      key: "actor",
      header: "Actor",
      cell: (r) => (
        <span className="font-mono text-xs">{r.actorEmail ?? "system"}</span>
      ),
    },
    { key: "category", header: "Category", cell: (r) => <span className="font-mono text-xs">{r.category}</span> },
    {
      key: "action",
      header: "Action",
      cell: (r) => (
        <Badge variant="secondary" className="font-mono text-xs">{r.action}</Badge>
      ),
    },
    {
      key: "target",
      header: "Target",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.targetType ? `${r.targetType}${r.targetId ? `#${r.targetId}` : ""}` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <History className="h-6 w-6 text-primary" /> AUDIT_LOG
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          {data?.total?.toLocaleString() ?? "—"} events recorded.
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
        <Input
          placeholder="action"
          value={pending.action ?? ""}
          onChange={(e) => setPending((s) => ({ ...s, action: e.target.value || undefined }))}
          className="font-mono text-xs"
        />
        <Input
          placeholder="actor email"
          value={pending.actor ?? ""}
          onChange={(e) => setPending((s) => ({ ...s, actor: e.target.value || undefined }))}
          className="font-mono text-xs"
        />
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
        emptyMessage="NO_EVENTS"
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event #{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail && format(new Date(detail.createdAt), "MMM d, yyyy HH:mm:ss")}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="flex flex-col gap-3 text-sm font-mono">
              <dl className="grid grid-cols-2 gap-3">
                <F label="Category" value={detail.category} />
                <F label="Action" value={detail.action} />
                <F label="Org" value={detail.organizationId ? `#${detail.organizationId}` : "—"} />
                <F label="Project" value={detail.projectId ? `#${detail.projectId}` : "—"} />
                <F label="Actor email" value={detail.actorEmail ?? "system"} />
                <F label="Actor user" value={detail.actorUserId ?? "—"} />
                <F
                  label="Target"
                  value={
                    detail.targetType
                      ? `${detail.targetType}${detail.targetId ? `#${detail.targetId}` : ""}`
                      : "—"
                  }
                />
              </dl>
              {detail.metadata && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase text-muted-foreground">Metadata</span>
                  <pre className="glass-subtle rounded p-3 text-[11px] overflow-x-auto">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
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
