import { useState } from "react";
import {
  useListAdminAudit,
  getListAdminAuditQueryKey,
} from "@workspace/api-client-react";
import { Loader2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

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
  const [page, setPage] = useState(0);
  const limit = 100;

  const params = { limit, offset: page * limit, ...filters };
  const list = useListAdminAudit(params, {
    query: { queryKey: getListAdminAuditQueryKey(params) },
  });
  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  const apply = () => {
    setFilters(pending);
    setPage(0);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-mono font-bold uppercase tracking-wider">Audit Log</h1>
        <span className="text-xs font-mono text-muted-foreground ml-2">
          {total.toLocaleString()} events
        </span>
      </div>

      <div className="glass rounded-xl p-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
          data-testid="input-filter-org"
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
          data-testid="input-filter-project"
        />
        <Input
          placeholder="action (eg secret_created)"
          value={pending.action ?? ""}
          onChange={(e) =>
            setPending((s) => ({ ...s, action: e.target.value || undefined }))
          }
          className="font-mono text-xs"
          data-testid="input-filter-action"
        />
        <Input
          placeholder="actor email"
          value={pending.actor ?? ""}
          onChange={(e) =>
            setPending((s) => ({ ...s, actor: e.target.value || undefined }))
          }
          className="font-mono text-xs"
          data-testid="input-filter-actor"
        />
        <Input
          type="datetime-local"
          value={pending.since ?? ""}
          onChange={(e) =>
            setPending((s) => ({ ...s, since: e.target.value || undefined }))
          }
          className="font-mono text-xs"
          data-testid="input-filter-since"
        />
        <Input
          type="datetime-local"
          value={pending.until ?? ""}
          onChange={(e) =>
            setPending((s) => ({ ...s, until: e.target.value || undefined }))
          }
          className="font-mono text-xs"
          data-testid="input-filter-until"
        />
        <div className="sm:col-span-3 lg:col-span-6 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPending({});
              setFilters({});
              setPage(0);
            }}
            data-testid="button-filter-clear"
          >
            CLEAR
          </Button>
          <Button size="sm" onClick={apply} data-testid="button-filter-apply">
            APPLY
          </Button>
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        {list.isLoading && (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!list.isLoading && (
          <table className="w-full text-[11px] font-mono">
            <thead className="bg-background/60 text-left text-muted-foreground">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Org</th>
                <th className="p-2">Project</th>
                <th className="p-2">Actor</th>
                <th className="p-2">Category</th>
                <th className="p-2">Action</th>
                <th className="p-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No events match these filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border/30"
                  data-testid={`row-admin-audit-${r.id}`}
                >
                  <td className="p-2 whitespace-nowrap text-muted-foreground">
                    {format(new Date(r.createdAt), "yyyy-MM-dd HH:mm:ss")}
                  </td>
                  <td className="p-2">{r.organizationId ?? "—"}</td>
                  <td className="p-2">{r.projectId ?? "—"}</td>
                  <td className="p-2">{r.actorEmail ?? "system"}</td>
                  <td className="p-2">{r.category}</td>
                  <td className="p-2 text-primary">{r.action}</td>
                  <td className="p-2 text-muted-foreground">
                    {r.targetType
                      ? `${r.targetType}${r.targetId ? `#${r.targetId}` : ""}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground">
          Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            data-testid="button-page-prev"
          >
            PREV
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage((p) => p + 1)}
            data-testid="button-page-next"
          >
            NEXT
          </Button>
        </div>
      </div>
    </div>
  );
}
