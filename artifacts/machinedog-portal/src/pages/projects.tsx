import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useListMyProjects, useCreateProject } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FolderGit2,
  Plus,
  Calendar,
  Activity,
  Archive,
  CheckCircle2,
  ExternalLink,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getListMyProjectsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

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

export default function ProjectsPage() {
  const { data, isLoading } = useListMyProjects();
  const createProject = useCreateProject();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();

  // Auto-open the create dialog when navigated to with ?new=1 (e.g. from the
  // ProjectsPicker "New project" footer link). Clears the query param after
  // opening so a refresh doesn't re-trigger.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setOpen(true);
      params.delete("new");
      const next = params.toString();
      setLocation(next ? `/projects?${next}` : "/projects", { replace: true });
    }
  }, [location, setLocation]);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createProject.mutate(
      {
        data: {
          title,
          description,
          summary,
          liveUrl: liveUrl.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
          setOpen(false);
          setTitle("");
          setSummary("");
          setLiveUrl("");
          setDescription("");
        },
      },
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-5xl mx-auto w-full gap-6">
      <div className="flex justify-between items-start gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
            <FolderGit2 className="h-6 w-6 text-primary" />
            PROJECTS
          </h1>
          <p className="text-muted-foreground text-sm font-mono">
            Track active engagements and codebase contexts.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4 mr-2" /> NEW_PROJECT
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-mono flex items-center gap-2">
                <FolderGit2 className="h-5 w-5 text-primary" /> INIT_PROJECT
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-muted-foreground">TITLE</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. BeeSuite.farm"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-muted-foreground">ONE-LINE SUMMARY</label>
                <Input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Beekeeping operations platform"
                  maxLength={160}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-muted-foreground">DEV PREVIEW URL</label>
                <Input
                  value={liveUrl}
                  onChange={(e) => setLiveUrl(e.target.value)}
                  placeholder="https://your-app.replit.dev"
                  type="url"
                  className="font-mono"
                />
                <p className="text-[10px] font-mono text-muted-foreground/70">
                  The Replit .replit.dev URL of the project's dev environment. Auto-loads in the preview pane when you open the project.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono font-bold text-muted-foreground">DESCRIPTION</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Context and goals..."
                  className="font-mono min-h-[100px] resize-y"
                />
              </div>
              <Button type="submit" className="w-full font-mono bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20" disabled={createProject.isPending || !title.trim()}>
                {createProject.isPending ? "INITIALIZING..." : "CREATE"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          <>
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full glass rounded-xl" />)}
          </>
        ) : !data || data.data.length === 0 ? (
          <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center h-64 glass-subtle border-dashed rounded-xl text-muted-foreground font-mono">
            <FolderGit2 className="h-8 w-8 mb-4 opacity-50" />
            <p>NO_PROJECTS_FOUND</p>
          </div>
        ) : (
          data.data.map((project, index) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              key={project.id}
            >
              <Link href={`/projects/${project.id}`}>
                <div className="glass-interactive p-5 rounded-xl flex flex-col gap-4 cursor-pointer h-full">
                  <div className="flex justify-between items-start relative z-10 gap-2">
                    <h3 className="font-bold text-lg font-mono line-clamp-1 text-foreground flex-1 min-w-0">
                      {project.title}
                    </h3>
                    <span
                      className={`text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1 uppercase tracking-wider ${statusColors[project.status]}`}
                    >
                      {statusIcons[project.status]}
                      {project.status}
                    </span>
                  </div>

                  {project.viewerRole === "collaborator" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-primary self-start px-2 py-0.5 rounded bg-primary/10 ring-1 ring-primary/20">
                      <Users className="h-3 w-3" /> Shared with me
                    </span>
                  )}

                  <p className="text-sm text-muted-foreground flex-1 line-clamp-3 relative z-10">
                    {project.summary || project.description || "No description provided."}
                  </p>

                  {project.liveUrl && (
                    <span className="inline-flex items-center gap-1 text-xs text-primary hover:underline truncate">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {project.liveUrl.replace(/^https?:\/\//, "")}
                    </span>
                  )}

                  <div className="text-xs font-mono text-muted-foreground flex items-center justify-between pt-4 border-t border-border/20 relative z-10">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(project.updatedAt), "MMM d, yyyy")}
                    </span>
                    <span className="font-mono text-primary">VIEW &rarr;</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
