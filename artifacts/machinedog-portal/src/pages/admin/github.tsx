import { useMemo, useState } from "react";
import {
  useListAdminGithubRepos,
  getListAdminGithubReposQueryKey,
  type ListAdminGithubReposParams,
  type AdminGithubRepo,
} from "@workspace/api-client-react";
import { Github, Search, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";
import { format } from "date-fns";
import { Link } from "wouter";

const PAGE_SIZE = 25;

export default function AdminGithubPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "imported" | "available">("all");
  const [offset, setOffset] = useState(0);

  const params: ListAdminGithubReposParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      search: search.trim() || undefined,
      imported: filter === "all" ? undefined : filter === "imported",
    }),
    [search, filter, offset],
  );

  const { data, isLoading } = useListAdminGithubRepos(params, {
    query: { queryKey: getListAdminGithubReposQueryKey(params) },
  });

  const columns: AdminTableColumn<AdminGithubRepo>[] = [
    {
      key: "repo",
      header: "Repository",
      cell: (r) => (
        <div className="flex flex-col">
          <a
            href={r.htmlUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-sm text-foreground hover:text-primary inline-flex items-center gap-1"
          >
            {r.fullName} <ExternalLink className="h-3 w-3" />
          </a>
          {r.description && (
            <span className="text-xs text-muted-foreground line-clamp-1">{r.description}</span>
          )}
        </div>
      ),
    },
    {
      key: "branch",
      header: "Branch",
      cell: (r) => <span className="font-mono text-xs">{r.defaultBranch}</span>,
    },
    {
      key: "visibility",
      header: "Visibility",
      cell: (r) => (
        <Badge variant={r.private ? "secondary" : "outline"} className="font-mono uppercase">
          {r.private ? "PRIVATE" : "PUBLIC"}
        </Badge>
      ),
    },
    {
      key: "imported",
      header: "Status",
      cell: (r) =>
        r.importedProjectId != null ? (
          <Badge variant="default" className="font-mono uppercase">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            IMPORTED #{r.importedProjectId}
          </Badge>
        ) : (
          <Badge variant="secondary" className="font-mono uppercase">AVAILABLE</Badge>
        ),
    },
    {
      key: "updated",
      header: "Updated",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.updatedAt ? format(new Date(r.updatedAt), "MMM d, yyyy") : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: () => (
        <Link href="/admin/projects">
          <Button size="sm" variant="ghost">View →</Button>
        </Link>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Github className="h-6 w-6 text-primary" /> GITHUB_REPOSITORIES
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Every repo the connected GitHub account can manage. Use All Projects to import.
        </p>
      </div>

      {data && !data.connected && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 border border-destructive/40">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div className="flex flex-col">
            <span className="font-mono text-sm font-bold">GitHub not connected</span>
            <span className="text-xs text-muted-foreground">
              Authorize GitHub in Replit → Integrations to surface repos here.
            </span>
          </div>
        </div>
      )}

      {data?.connected && data.login && (
        <div className="text-xs font-mono text-muted-foreground">
          Connected as <span className="text-foreground">{data.login}</span> ·{" "}
          {data.total.toLocaleString()} repos visible
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Search by owner/repo"
            className="pl-9"
          />
        </div>
        <Select
          value={filter}
          onValueChange={(v) => {
            setFilter(v as "all" | "imported" | "available");
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="imported">Imported</SelectItem>
            <SelectItem value="available">Not imported</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AdminTable
        columns={columns}
        rows={data?.repos}
        total={data?.total}
        isLoading={isLoading}
        limit={PAGE_SIZE}
        offset={offset}
        onPageChange={setOffset}
        rowKey={(r) => r.fullName}
        emptyMessage="NO_REPOS"
      />
    </div>
  );
}
