import { useState } from "react";
import { useListMyProjects, useCreateProject } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FolderGit2, Plus, Calendar, Activity, Archive, CheckCircle2 } from "lucide-react";
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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createProject.mutate(
      { data: { title, description } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
          setOpen(false);
          setTitle("");
          setDescription("");
        }
      }
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
                  placeholder="e.g. Core API Migration"
                  className="font-mono"
                />
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
              className="glass-interactive p-5 rounded-xl flex flex-col gap-4"
            >
              <div className="flex justify-between items-start relative z-10">
                <h3 className="font-bold text-lg font-mono line-clamp-1 text-foreground">{project.title}</h3>
                <span className={`text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1 uppercase tracking-wider ${statusColors[project.status]}`}>
                  {statusIcons[project.status]}
                  {project.status}
                </span>
              </div>
              
              <p className="text-sm text-muted-foreground flex-1 line-clamp-3 relative z-10">
                {project.description || "No description provided."}
              </p>
              
              <div className="text-xs font-mono text-muted-foreground flex items-center justify-between pt-4 border-t border-border/20 relative z-10">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(project.updatedAt), "MMM d, yyyy")}
                </span>
                <span className="font-mono text-primary cursor-pointer hover:underline">
                  VIEW_DETAILS &rarr;
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
