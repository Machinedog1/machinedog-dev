import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useListMyProjects } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FolderGit2,
  ChevronDown,
  Search,
  Plus,
  Activity,
  Archive,
  CheckCircle2,
  Users,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_ICON: Record<string, React.ReactNode> = {
  draft: <FolderGit2 className="h-3 w-3" />,
  active: <Activity className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  archived: <Archive className="h-3 w-3" />,
};

const STATUS_RING: Record<string, string> = {
  draft: "ring-border/30 text-muted-foreground",
  active: "ring-primary/30 text-primary",
  completed: "ring-green-500/30 text-green-400",
  archived: "ring-destructive/30 text-destructive",
};

export function ProjectsPicker() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data, isLoading } = useListMyProjects();

  const all = data?.data ?? [];
  const sorted = useMemo(
    () =>
      [...all].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [all],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.summary ?? "").toLowerCase().includes(q),
    );
  }, [sorted, query]);

  const openProject = (id: number) => {
    setOpen(false);
    setQuery("");
    setLocation(`/projects/${id}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open one of your projects"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="button-projects-picker"
          title="Open one of your projects"
          className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md ring-1 ring-border/30 bg-background/60 hover:bg-background/80 transition font-mono text-[11px] text-foreground/90"
        >
          <FolderGit2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="hidden sm:inline">Projects</span>
          {!isLoading && all.length > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9.5px] leading-none font-bold">
              {all.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 glass-strong rounded-xl ring-1 ring-border/30 overflow-hidden"
        data-testid="popover-projects-picker"
      >
        {/* Header / search */}
        <div className="px-3 pt-3 pb-2 border-b border-border/30">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
            Recent projects
          </div>
          <label className="flex items-center gap-2 px-2 h-8 rounded-md bg-background/60 ring-1 ring-border/30">
            <Search
              className="h-3.5 w-3.5 text-muted-foreground shrink-0"
              aria-hidden="true"
            />
            <span className="sr-only">Search projects</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
              data-testid="input-projects-picker-search"
              className="flex-1 bg-transparent border-0 outline-none text-[12px] font-mono placeholder:text-muted-foreground/60 min-w-0"
              autoFocus
            />
          </label>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto py-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-[12px] font-mono text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] font-mono text-muted-foreground">
              {all.length === 0
                ? "You don't have any projects yet."
                : "No projects match your search."}
            </div>
          ) : (
            filtered.map((p) => {
              const ring =
                STATUS_RING[p.status as keyof typeof STATUS_RING] ??
                STATUS_RING.draft;
              const icon =
                STATUS_ICON[p.status as keyof typeof STATUS_ICON] ??
                STATUS_ICON.draft;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openProject(p.id)}
                  data-testid={`button-projects-picker-item-${p.id}`}
                  className="group w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/30 transition"
                >
                  <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                    <FolderGit2 className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-medium truncate">
                        {p.title}
                      </span>
                      {p.viewerRole === "collaborator" && (
                        <span
                          title="Shared with me"
                          className="inline-flex items-center text-primary/80 shrink-0"
                        >
                          <Users className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] font-mono text-muted-foreground truncate">
                      Updated{" "}
                      {formatDistanceToNow(new Date(p.updatedAt), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                  <span
                    className={`text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1 ring-1 bg-background/40 shrink-0 ${ring}`}
                  >
                    {icon}
                    {p.status}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/30 px-2 py-1.5 flex items-center justify-between gap-2 bg-muted/10">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQuery("");
              setLocation("/projects");
            }}
            data-testid="button-projects-picker-view-all"
            className="text-[11px] font-mono text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/40 transition"
          >
            View all
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQuery("");
              setLocation("/projects?new=1");
            }}
            data-testid="button-projects-picker-new"
            className="inline-flex items-center gap-1 text-[11px] font-mono text-primary hover:text-primary/80 px-2 py-1 rounded hover:bg-primary/10 transition"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            New project
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
