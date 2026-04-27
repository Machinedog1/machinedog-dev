import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetProject,
  useUpdateProject,
  useListProjectMembers,
  useInviteProjectMember,
  useRemoveProjectMember,
  getGetProjectQueryKey,
  getListProjectMembersQueryKey,
  getListMyProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Mail,
  Pencil,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const projectQuery = useGetProject(projectId, {
    query: { queryKey: getGetProjectQueryKey(projectId), enabled: Number.isFinite(projectId) },
  });
  const project = projectQuery.data;
  const isOwner = project?.viewerRole === "owner";

  const membersQuery = useListProjectMembers(projectId, {
    query: {
      queryKey: getListProjectMembersQueryKey(projectId),
      enabled: Number.isFinite(projectId) && isOwner,
    },
  });

  const updateProject = useUpdateProject();
  const inviteMember = useInviteProjectMember();
  const removeMember = useRemoveProjectMember();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    summary: "",
    description: "",
    liveUrl: "",
    coverImageUrl: "",
    status: "draft" as "draft" | "active" | "completed" | "archived",
  });
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    if (project) {
      setForm({
        title: project.title,
        summary: project.summary ?? "",
        description: project.description ?? "",
        liveUrl: project.liveUrl ?? "",
        coverImageUrl: project.coverImageUrl ?? "",
        status: project.status,
      });
    }
  }, [project]);

  if (projectQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="glass rounded-xl p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground mb-4">PROJECT_NOT_FOUND</p>
          <Link href="/projects">
            <Button variant="outline">Back to projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProject.mutate(
      {
        id: project.id,
        data: {
          title: form.title,
          summary: form.summary,
          description: form.description,
          liveUrl: form.liveUrl.trim() ? form.liveUrl.trim() : null,
          coverImageUrl: form.coverImageUrl.trim() ? form.coverImageUrl.trim() : null,
          status: form.status,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
          queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
          setEditing(false);
          toast({ title: "Project saved" });
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "data" in err
              ? ((err as { data?: { error?: string } }).data?.error ?? "Could not save")
              : "Could not save";
          toast({ variant: "destructive", title: "Save failed", description: msg });
        },
      },
    );
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    inviteMember.mutate(
      { id: project.id, data: { email } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectMembersQueryKey(project.id) });
          setInviteEmail("");
          toast({
            title: "Invitation sent",
            description: `${email} can now access this project after signing in.`,
          });
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "data" in err
              ? ((err as { data?: { error?: string } }).data?.error ?? "Could not invite")
              : "Could not invite";
          toast({ variant: "destructive", title: "Invite failed", description: msg });
        },
      },
    );
  };

  const handleRemoveMember = (memberId: number) => {
    removeMember.mutate(
      { id: project.id, memberId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectMembersQueryKey(project.id) });
        },
      },
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-5xl mx-auto w-full gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link href="/projects">
          <Button variant="ghost" size="sm" className="font-mono text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-2" /> ALL_PROJECTS
          </Button>
        </Link>
        <span
          className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20"
        >
          {project.viewerRole === "owner" ? "Owner" : "Collaborator"}
        </span>
      </div>

      <div className="glass-strong rounded-2xl overflow-hidden">
        {project.coverImageUrl && (
          <div
            className="h-40 sm:h-56 w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${project.coverImageUrl})` }}
          />
        )}
        <div className="p-6 sm:p-8 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-2 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight break-words">
                {project.title}
              </h1>
              {project.summary && (
                <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
                  {project.summary}
                </p>
              )}
            </div>
            {isOwner && !editing && (
              <Button
                onClick={() => setEditing(true)}
                variant="outline"
                size="sm"
                className="font-mono"
              >
                <Pencil className="h-3 w-3 mr-2" /> EDIT
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted-foreground">
            <span className="px-2 py-1 rounded bg-muted/30 uppercase">{project.status}</span>
            <span>UPDATED {format(new Date(project.updatedAt), "MMM d, yyyy")}</span>
            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {project.liveUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          {project.description && !editing && (
            <p className="whitespace-pre-wrap text-sm text-foreground/80 leading-relaxed pt-2 border-t border-border/20">
              {project.description}
            </p>
          )}

          {editing && (
            <form onSubmit={handleSave} className="flex flex-col gap-4 pt-2 border-t border-border/20">
              <Field label="TITLE">
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </Field>
              <Field label="ONE-LINE SUMMARY">
                <Input
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                  placeholder="e.g. Beekeeping operations platform for commercial apiaries"
                  maxLength={160}
                />
              </Field>
              <Field label="LIVE URL">
                <Input
                  value={form.liveUrl}
                  onChange={(e) => setForm((f) => ({ ...f, liveUrl: e.target.value }))}
                  placeholder="https://beesuite.farm"
                  type="url"
                />
              </Field>
              <Field label="COVER IMAGE URL">
                <Input
                  value={form.coverImageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                  placeholder="https://…/cover.png"
                  type="url"
                />
              </Field>
              <Field label="DETAILS">
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={6}
                  className="resize-y"
                />
              </Field>
              <Field label="STATUS">
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as typeof f.status }))
                  }
                  className="glass-input rounded-md px-3 py-2 text-sm font-mono w-full"
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="completed">completed</option>
                  <option value="archived">archived</option>
                </select>
              </Field>
              <div className="flex items-center gap-3 justify-end pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={updateProject.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateProject.isPending} className="font-mono">
                  {updateProject.isPending ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-2" /> SAVING…
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3 mr-2" /> SAVE
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider">Collaborators</h2>
          </div>

          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="client@example.com"
              required
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={inviteMember.isPending || !inviteEmail.trim()}
              className="font-mono"
            >
              {inviteMember.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-2" /> SENDING…
                </>
              ) : (
                <>
                  <Mail className="h-3 w-3 mr-2" /> INVITE
                </>
              )}
            </Button>
          </form>

          <div className="flex flex-col gap-2">
            {membersQuery.isLoading ? (
              <p className="text-xs font-mono text-muted-foreground">Loading…</p>
            ) : !membersQuery.data || membersQuery.data.data.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground">
                No collaborators yet. Invite a client by email above.
              </p>
            ) : (
              membersQuery.data.data.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg glass-subtle"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm truncate">{m.email}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {m.status === "active" ? "Active" : "Pending invite"} ·{" "}
                      {format(new Date(m.invitedAt), "MMM d")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMember(m.id)}
                    disabled={removeMember.isPending}
                    aria-label={`Remove ${m.email}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-mono font-bold text-muted-foreground tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
