import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetProject,
  useUpdateProject,
  useListProjectMembers,
  useInviteProjectMember,
  useRemoveProjectMember,
  useListProjectComments,
  useAddProjectComment,
  useDeleteProjectComment,
  useListProjectPrompts,
  useSubmitProjectPrompt,
  useListProjectFiles,
  useAddProjectFile,
  useDeleteProjectFile,
  useRequestUploadUrl,
  useGetMe,
  getGetProjectQueryKey,
  getListProjectMembersQueryKey,
  getListMyProjectsQueryKey,
  getListProjectCommentsQueryKey,
  getListProjectPromptsQueryKey,
  getListProjectFilesQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  FileUp,
  Files,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Save,
  Send,
  Terminal,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ProjectChangeRequestsPanel } from "@/components/change-requests/ProjectChangeRequestsPanel";

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

      <ProjectChangeRequestsPanel projectId={project.id} />
      <ProjectPromptPanel projectId={project.id} />
      <ProjectCommentsPanel projectId={project.id} isOwner={isOwner} />
      <ProjectFilesPanel projectId={project.id} isOwner={isOwner} />

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

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "data" in err) {
    const d = (err as { data?: { error?: string } }).data;
    if (d?.error) return d.error;
  }
  if (err && typeof err === "object" && "error" in err) {
    const e = (err as { error?: string }).error;
    if (typeof e === "string" && e) return e;
  }
  return fallback;
}

function ProjectCommentsPanel({
  projectId,
  isOwner,
}: {
  projectId: number;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [body, setBody] = useState("");
  const commentsQuery = useListProjectComments(projectId, {
    query: { queryKey: getListProjectCommentsQueryKey(projectId) },
  });
  const addComment = useAddProjectComment();
  const removeComment = useDeleteProjectComment();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListProjectCommentsQueryKey(projectId) });

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    addComment.mutate(
      { id: projectId, data: { body: trimmed } },
      {
        onSuccess: () => {
          setBody("");
          invalidate();
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Could not post comment",
            description: errorMessage(err, "Try again."),
          }),
      },
    );
  };

  const handleRemove = (commentId: number) => {
    removeComment.mutate(
      { id: projectId, commentId },
      { onSuccess: invalidate },
    );
  };

  const items = commentsQuery.data?.data ?? [];

  return (
    <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-mono font-bold uppercase tracking-wider">Discussion</h2>
        <span className="text-[10px] font-mono text-muted-foreground tracking-widest ml-auto">
          {items.length} {items.length === 1 ? "MESSAGE" : "MESSAGES"}
        </span>
      </div>

      <form onSubmit={handlePost} className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share an update, question, or note for the team…"
          rows={3}
          className="resize-y"
          disabled={addComment.isPending}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!body.trim() || addComment.isPending}
            size="sm"
            className="font-mono"
          >
            {addComment.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
            ) : (
              <Send className="h-3 w-3 mr-2" />
            )}
            POST
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {commentsQuery.isLoading ? (
          <p className="text-xs font-mono text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground">
            No messages yet. Start the conversation.
          </p>
        ) : (
          items.map((c) => {
            const isAuthor = me?.id === c.clientId;
            const canDelete = isAuthor || isOwner;
            return (
              <div
                key={c.id}
                className="flex flex-col gap-1 px-4 py-3 rounded-lg glass-subtle"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <span className="truncate">{c.clientEmail}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span>{format(new Date(c.createdAt), "MMM d · HH:mm")}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleRemove(c.id)}
                        className="hover:text-destructive transition-colors"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ProjectPromptPanel({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const [prompt, setPrompt] = useState("");
  const promptsQuery = useListProjectPrompts(projectId, {
    query: { queryKey: getListProjectPromptsQueryKey(projectId) },
  });
  const submit = useSubmitProjectPrompt();
  const items = promptsQuery.data?.data ?? [];
  const outOfTokens = me ? me.tokenBalance <= 0 : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    submit.mutate(
      { id: projectId, data: { prompt: trimmed } },
      {
        onSuccess: () => {
          setPrompt("");
          queryClient.invalidateQueries({
            queryKey: getListProjectPromptsQueryKey(projectId),
          });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Prompt failed",
            description: errorMessage(err, "Try again."),
          }),
      },
    );
  };

  return (
    <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-mono font-bold uppercase tracking-wider">
          Project Prompt Console
        </h2>
        <span className="text-[10px] font-mono text-muted-foreground tracking-widest ml-auto">
          {items.length} {items.length === 1 ? "RUN" : "RUNS"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        Prompts run here are visible to everyone with access to this project. Tokens are charged
        to whoever runs them.
      </p>

      {outOfTokens && (
        <div className="text-xs font-mono text-destructive border border-destructive/40 rounded-lg p-3">
          You&rsquo;re out of tokens.{" "}
          <Link href="/tokens" className="underline">
            Buy a bundle
          </Link>{" "}
          to run prompts here.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask Machinedog to help with this project…"
          rows={4}
          className="resize-y font-mono"
          disabled={submit.isPending || outOfTokens}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!prompt.trim() || submit.isPending || outOfTokens}
            size="sm"
            className="font-mono"
          >
            {submit.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
            ) : (
              <Zap className="h-3 w-3 mr-2" />
            )}
            RUN
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {promptsQuery.isLoading ? (
          <p className="text-xs font-mono text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground">No runs yet.</p>
        ) : (
          items.slice(0, 20).map((s) => (
            <details
              key={s.id}
              className="rounded-lg glass-subtle px-4 py-3 group"
            >
              <summary className="cursor-pointer flex items-center justify-between gap-2 text-xs font-mono text-muted-foreground">
                <span className="truncate flex-1">
                  {s.prompt.slice(0, 120)}
                  {s.prompt.length > 120 ? "…" : ""}
                </span>
                <span className="shrink-0 tracking-widest">
                  {s.tokensUsed} TOK · {format(new Date(s.createdAt), "MMM d HH:mm")}
                </span>
              </summary>
              <div className="mt-3 pt-3 border-t border-border/30 text-sm prose prose-sm dark:prose-invert max-w-none">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                  Prompt
                </div>
                <pre className="whitespace-pre-wrap break-words bg-background/40 rounded p-2 text-xs">
                  {s.prompt}
                </pre>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-3 mb-2">
                  Output
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.output}</ReactMarkdown>
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}

function ProjectFilesPanel({
  projectId,
  isOwner,
}: {
  projectId: number;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const filesQuery = useListProjectFiles(projectId, {
    query: { queryKey: getListProjectFilesQueryKey(projectId) },
  });
  const requestUpload = useRequestUploadUrl();
  const addFile = useAddProjectFile();
  const removeFile = useDeleteProjectFile();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const items = filesQuery.data?.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListProjectFilesQueryKey(projectId) });

  const handlePick = () => fileInputRef.current?.click();

  const handleFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Max 50 MB per upload.",
      });
      return;
    }
    setUploading(true);
    try {
      const reservation = await requestUpload.mutateAsync({
        data: { contentType: file.type || "application/octet-stream" },
      });
      const putRes = await fetch(reservation.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }
      await addFile.mutateAsync({
        id: projectId,
        data: {
          name: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          objectPath: reservation.objectPath,
        },
      });
      invalidate();
      toast({ title: "File uploaded", description: file.name });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: errorMessage(err, "Could not upload file."),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = (fileId: number) => {
    removeFile.mutate(
      { id: projectId, fileId },
      { onSuccess: invalidate },
    );
  };

  return (
    <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Files className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-mono font-bold uppercase tracking-wider">Files</h2>
        <span className="text-[10px] font-mono text-muted-foreground tracking-widest ml-auto">
          {items.length} {items.length === 1 ? "FILE" : "FILES"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          size="sm"
          variant="outline"
          className="font-mono"
        >
          {uploading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-2" /> UPLOADING…
            </>
          ) : (
            <>
              <FileUp className="h-3 w-3 mr-2" /> UPLOAD FILE
            </>
          )}
        </Button>
        <span className="text-[10px] font-mono text-muted-foreground tracking-widest">
          MAX 50 MB
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {filesQuery.isLoading ? (
          <p className="text-xs font-mono text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground">
            No files yet. Drop in references, briefs, or assets.
          </p>
        ) : (
          items.map((f) => {
            const canDelete = isOwner || me?.id === f.uploadedByClientId;
            return (
              <div
                key={f.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg glass-subtle"
              >
                <div className="flex flex-col min-w-0">
                  <a
                    href={f.objectPath}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm truncate hover:text-primary"
                  >
                    {f.name}
                  </a>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {(f.sizeBytes / 1024).toFixed(1)} KB · {f.uploadedByEmail} ·{" "}
                    {format(new Date(f.createdAt), "MMM d")}
                  </span>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(f.id)}
                    disabled={removeFile.isPending}
                    aria-label={`Delete ${f.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
