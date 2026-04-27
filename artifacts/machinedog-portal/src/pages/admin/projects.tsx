import { useListAllProjects } from "@workspace/api-client-react";
import { FolderGit2, ShieldAlert, Clock, Activity, Archive, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors = {
  draft: "glass-subtle text-muted-foreground border-0 ring-1 ring-border/20",
  active: "glass-subtle text-primary border-0 ring-1 ring-primary/30",
  completed: "glass-subtle text-green-500 border-0 ring-1 ring-green-500/30",
  archived: "glass-subtle text-destructive border-0 ring-1 ring-destructive/30"
};

const statusIcons = {
  draft: <FolderGit2 className="h-3 w-3" />,
  active: <Activity className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  archived: <Archive className="h-3 w-3" />
};

export default function AdminProjects() {
  const { data, isLoading } = useListAllProjects();

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <FolderGit2 className="h-6 w-6 text-primary" />
          ALL_PROJECTS
        </h1>
        <p className="text-muted-foreground text-sm font-mono flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Global view of all client engagements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto content-start pb-8">
        {isLoading ? (
          [1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-48 w-full glass rounded-2xl" />)
        ) : !data?.data?.length ? (
          <div className="col-span-full p-8 text-center text-muted-foreground font-mono text-sm glass-subtle border-dashed rounded-2xl border-0">NO_PROJECTS_FOUND</div>
        ) : (
          data.data.map((project) => (
            <div key={project.id} className="glass p-5 rounded-2xl flex flex-col gap-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-bold font-mono line-clamp-1 text-foreground leading-tight">{project.title}</h3>
                  <div className="text-xs font-mono text-muted-foreground mt-1">Client ID: {project.clientId}</div>
                </div>
                <span className={`shrink-0 text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1 uppercase tracking-wider ${statusColors[project.status]}`}>
                  {statusIcons[project.status]}
                  {project.status}
                </span>
              </div>
              
              <p className="text-sm text-muted-foreground flex-1 line-clamp-3">
                {project.description || "No description provided."}
              </p>
              
              <div className="text-xs font-mono text-muted-foreground flex items-center justify-between pt-4 border-t border-border/20">
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
          ))
        )}
      </div>
    </div>
  );
}
