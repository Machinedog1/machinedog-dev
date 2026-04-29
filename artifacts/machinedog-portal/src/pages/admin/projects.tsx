import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAllProjects,
  useListClients,
  useReassignProjectOwner,
  getListAllProjectsQueryKey,
} from "@workspace/api-client-react";
import {
  FolderGit2,
  ShieldAlert,
  Clock,
  Activity,
  Archive,
  CheckCircle2,
  ExternalLink,
  Github,
  UserCog,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const statusColors = {
  draft: "glass-subtle text-muted-foreground border-0 ring-1 ring-border/20",
  active: "glass-subtle text-primary border-0 ring-1 ring-primary/30",
  completed: "glass-subtle text-green-500 border-0 ring-1 ring-green-500/30",
  archived: "glass-subtle text-destructive border-0 ring-1 ring-destructive/30",
};

const statusIcons = {
  draft: <FolderGit2 className="h-3 w-3" />,
  active: <Activity className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  archived: <Archive className="h-3 w-3" />,
};

export default function AdminProjects() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListAllProjects();
  const { data: clientsData } = useListClients({ limit: 500, offset: 0 });
  const [pendingId, setPendingId] = useState<number | null>(null);

  const reassign = useReassignProjectOwner({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAllProjectsQueryKey() });
        toast({ title: "Owner reassigned", description: "Project moved to new client." });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to reassign";
        toast({ title: "Reassign failed", description: msg, variant: "destructive" });
      },
      onSettled: () => setPendingId(null),
    },
  });

  const clientLookup = useMemo(() => {
    const m = new Map<number, { email: string; status: string }>();
    for (const c of clientsData?.data ?? []) {
      m.set(c.id, { email: c.email, status: c.status });
    }
    return m;
  }, [clientsData]);

  const assignableClients = useMemo(
    () =>
      (clientsData?.data ?? [])
        .filter((c) => c.status !== "suspended")
        .sort((a, b) => a.email.localeCompare(b.email)),
    [clientsData],
  );

  function handleReassign(projectId: number, newClientId: number) {
    setPendingId(projectId);
    reassign.mutate({ id: projectId, data: { clientId: newClientId } });
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <FolderGit2 className="h-6 w-6 text-primary" />
          ALL_PROJECTS
        </h1>
        <p className="text-muted-foreground text-sm font-mono flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Every Repl in the system. Reassign
          owners to attach a project to a client — they'll see only that
          project in their portal.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto content-start pb-8">
        {isLoading ? (
          [1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 w-full glass rounded-2xl" />
          ))
        ) : !data?.data?.length ? (
          <div className="col-span-full p-8 text-center text-muted-foreground font-mono text-sm glass-subtle border-dashed rounded-2xl border-0">
            NO_PROJECTS_FOUND
          </div>
        ) : (
          data.data.map((project) => {
            const owner = clientLookup.get(project.clientId);
            const ownerLabel = owner?.email ?? `Client #${project.clientId}`;
            const repoLabel =
              project.githubOwner && project.githubRepo
                ? `${project.githubOwner}/${project.githubRepo}`
                : null;
            const isPending = pendingId === project.id;
            return (
              <div
                key={project.id}
                className="glass p-5 rounded-2xl flex flex-col gap-3"
                data-testid={`admin-project-card-${project.id}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold font-mono line-clamp-1 text-foreground leading-tight">
                      {project.title}
                    </h3>
                    <div
                      className="text-xs font-mono text-muted-foreground mt-1 truncate"
                      title={ownerLabel}
                    >
                      Owner: {ownerLabel}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1 uppercase tracking-wider ${statusColors[project.status]}`}
                  >
                    {statusIcons[project.status]}
                    {project.status}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2">
                  {project.description || "No description provided."}
                </p>

                <div className="flex flex-col gap-1.5 text-[11px] font-mono">
                  {project.productionUrl ? (
                    <a
                      href={project.productionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-primary hover:underline truncate"
                      title={project.productionUrl}
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{project.productionUrl}</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground/60 italic flex items-center gap-1.5">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      No Repl URL set
                    </span>
                  )}
                  {repoLabel ? (
                    <a
                      href={`https://github.com/${repoLabel}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-muted-foreground hover:text-primary truncate"
                    >
                      <Github className="h-3 w-3 shrink-0" />
                      <span className="truncate">{repoLabel}</span>
                    </a>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5 pt-2 border-t border-border/20">
                  <label
                    htmlFor={`reassign-${project.id}`}
                    className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <UserCog className="h-3 w-3" />
                    Reassign owner
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      id={`reassign-${project.id}`}
                      aria-label={`Reassign owner of ${project.title}`}
                      data-testid={`select-reassign-${project.id}`}
                      value={project.clientId}
                      disabled={isPending}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next) || next === project.clientId) return;
                        const target = clientLookup.get(next);
                        const ok = window.confirm(
                          `Reassign "${project.title}" to ${target?.email ?? `client #${next}`}? They will see this project in their portal.`,
                        );
                        if (!ok) {
                          e.target.value = String(project.clientId);
                          return;
                        }
                        handleReassign(project.id, next);
                      }}
                      className="flex-1 text-xs font-mono bg-background ring-1 ring-border/40 rounded-md px-2 py-1.5 focus:outline-none focus:ring-primary/50 focus:ring-2"
                    >
                      {!clientLookup.has(project.clientId) && (
                        <option value={project.clientId}>{ownerLabel}</option>
                      )}
                      {assignableClients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.email}
                          {c.status !== "active" ? ` (${c.status})` : ""}
                        </option>
                      ))}
                    </select>
                    {isPending && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                </div>

                <div className="text-xs font-mono text-muted-foreground flex items-center justify-between pt-2 border-t border-border/20">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(project.updatedAt), "MMM d, yy")}
                  </span>
                  {project.consultingBookingId && (
                    <span className="flex items-center gap-1 text-primary">
                      <Activity className="h-3 w-3" /> Booked
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
