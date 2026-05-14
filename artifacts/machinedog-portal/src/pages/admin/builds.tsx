import { useState } from "react";
import {
  useListAdminBuilds,
  getListAdminBuildsQueryKey,
} from "@workspace/api-client-react";
import { Loader2, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

interface Filters {
  organizationId?: number;
  projectId?: number;
  provider?: "replit" | "vercel" | "render";
  status?: "queued" | "running" | "succeeded" | "failed" | "canceled";
  since?: string;
  until?: string;
}

export default function AdminBuildsPage() {
  const [pending, setPending] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const limit = 100;
  const params = { limit, offset: page * limit, ...filters };
  const list = useListAdminBuilds(params, {
    query: { queryKey: getListAdminBuildsQueryKey(params), refetchInterval: 8000 },
  });
  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const apply = () => {
    setFilters(pending);
    setPage(0);
  };
  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-5" data-testid="page-admin-builds">
      <div className="flex items-center gap-2">
        <Hammer className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-mono font-bold uppercase tracking-wider">Build Jobs</h1>
        <span className="text-xs font-mono text-muted-foreground ml-2">
          {total.toLocaleString()} jobs
        </span>
      </div>
      <div className="glass rounded-xl p-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
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
        <select
          value={pending.provider ?? ""}
          onChange={(e) =>
            setPending((s) => ({
              ...s,
              provider: (e.target.value || undefined) as Filters["provider"],
            }))
          }
          className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs font-mono"
          data-testid="select-filter-provider"
        >
          <option value="">any provider</option>
          <option value="replit">replit</option>
          <option value="vercel">vercel</option>
          <option value="render">render</option>
        </select>
        <select
          value={pending.status ?? ""}
          onChange={(e) =>
            setPending((s) => ({
              ...s,
              status: (e.target.value || undefined) as Filters["status"],
            }))
          }
          className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs font-mono"
          data-testid="select-filter-status"
        >
          <option value="">any status</option>
          <option value="queued">queued</option>
          <option value="running">running</option>
          <option value="succeeded">succeeded</option>
          <option value="failed">failed</option>
          <option value="canceled">canceled</option>
        </select>
        <Input
          type="datetime-local"
          value={pending.since ?? ""}
          onChange={(e) => setPending((s) => ({ ...s, since: e.target.value || undefined }))}
          className="font-mono text-xs"
          data-testid="input-filter-since"
        />
        <Input
          type="datetime-local"
          value={pending.until ?? ""}
          onChange={(e) => setPending((s) => ({ ...s, until: e.target.value || undefined }))}
          className="font-mono text-xs"
          data-testid="input-filter-until"
        />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPending({});
              setFilters({});
              setPage(0);
            }}
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
                <th className="p-2">Provider</th>
                <th className="p-2">Status</th>
                <th className="p-2">Branch</th>
                <th className="p-2">Commit</th>
                <th className="p-2">Tokens</th>
                <th className="p-2">Triggered by</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    No builds match these filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border/30"
                  data-testid={`row-admin-build-${r.id}`}
                >
                  <td className="p-2 whitespace-nowrap text-muted-foreground">
                    {format(new Date(r.createdAt), "yyyy-MM-dd HH:mm:ss")}
                  </td>
                  <td className="p-2">{r.organizationId}</td>
                  <td className="p-2">{r.projectId}</td>
                  <td className="p-2">{r.provider}</td>
                  <td className="p-2 text-primary">{r.status}</td>
                  <td className="p-2 text-muted-foreground">{r.branch ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">
                    {r.commitSha ? r.commitSha.slice(0, 8) : "—"}
                  </td>
                  <td className="p-2">{r.tokenCost}</td>
                  <td className="p-2 text-muted-foreground">{r.triggeredByEmail ?? "system"}</td>
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
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            PREV
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            NEXT
          </Button>
        </div>
      </div>
    </div>
  );
}
