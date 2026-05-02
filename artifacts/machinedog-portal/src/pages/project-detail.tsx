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
  useCreateChangeRequest,
  useRequestChangePublish,
  useRotateProjectHeartbeatToken,
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
  ChevronLeft,
  ExternalLink,
  FileUp,
  Files,
  Globe,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Eye,
  Terminal,
  Plus,
  X,
  Trash2,
  Users,
  Zap,
  LayoutPanelLeft,
  Layers,
  Code2,
  Copy,
  Check,
  RotateCw,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentConversation } from "@/components/change-requests/AgentConversation";
import { LivePreviewPane } from "@/components/change-requests/LivePreviewPane";
import { WorkspaceSplit } from "@/components/change-requests/WorkspaceSplit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Legacy Replit hosting used a 1:1 mapping between dev (`<repl>.replit.dev`)
// and prod (`<repl>.replit.app`) hostnames, so when a user pastes a legacy
// dev URL we can backfill the matching prod URL. Modern Replit dev URLs use
// a per-run UUID host (`<uuid>-00-xxx.<region>.replit.dev`) that has NO
// stable relationship to the published `.replit.app`, so we never derive
// in either direction for those — they have to be set manually.
//
// Direction note: we only auto-derive Dev → Prod, never Prod → Dev. The
// reverse direction would generate dead URLs for any modern project (the
// legacy `<slug>.replit.dev` host returns NXDOMAIN today).
function inferProdFromDev(devUrl: string): string | null {
  try {
    const u = new URL(devUrl);
    if (!u.hostname.endsWith(".replit.dev")) return null;
    const stem = u.hostname.slice(0, -".replit.dev".length);
    if (!stem) return null;
    // Modern dev hosts contain a hyphen ("<uuid>-00-...") and/or a region
    // sub-subdomain. A legacy host is a single label with no hyphen and no
    // dot. Refuse to derive anything else — silently — to avoid creating
    // broken prod URLs that the user then has to clean up.
    if (stem.includes(".") || stem.includes("-")) return null;
    return `${u.protocol}//${stem}.replit.app`;
  } catch {
    return null;
  }
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Poll the project every 5s while this page is open so a freshly-reported
  // heartbeat (Dev URL changed because the Replit container restarted, the
  // user just installed the snippet, etc.) flows straight into the preview
  // iframe without requiring a manual refresh. Paused when the tab is hidden
  // so it stays cheap.
  const projectQuery = useGetProject(projectId, {
    query: {
      queryKey: getGetProjectQueryKey(projectId),
      enabled: Number.isFinite(projectId),
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
    },
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
  const createChangeRequest = useCreateChangeRequest();
  const requestChangePublish = useRequestChangePublish();
  const inviteMember = useInviteProjectMember();
  const removeMember = useRemoveProjectMember();

  const [editing, setEditing] = useState(false);
  // Snapshot of the form values at the moment the user opened the editor.
  // At save time we diff `form` against this baseline and only send the fields
  // the user actually changed. This stops the 5s background poll from causing
  // stale-overwrite: if heartbeat lands a new liveUrl while editing, the user
  // saving unrelated fields won't clobber the freshly-reported URL.
  const editBaselineRef = useRef<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({
    title: "",
    summary: "",
    description: "",
    liveUrl: "",
    productionUrl: "",
    coverImageUrl: "",
    status: "draft" as "draft" | "active" | "completed" | "archived",
    githubOwner: "",
    githubRepo: "",
    githubDefaultBranch: "main",
    previewUrlTemplate: "",
    operatorEmail: "",
  });
  const [inviteEmail, setInviteEmail] = useState("");
  // Replit-style split view: agent on the left, full-height live preview on the right.
  // Always opens in "workspace" view (identical to Replit IDE) — even when no
  // URLs are configured yet, so the user lands on the env switcher and can
  // configure Dev/Prod inline. User preference persists per-project in
  // localStorage so a manual switch to "details" sticks.
  const hasPreview = !!(project?.productionUrl || project?.liveUrl);
  const [view, setView] = useState<"workspace" | "details">("workspace");
  useEffect(() => {
    if (!project) return;
    const stored = window.localStorage.getItem(`md.projectView.${project.id}`);
    if (stored === "workspace" || stored === "details") {
      setView(stored);
    } else {
      setView("workspace");
    }
  }, [project?.id]);
  function handleViewChange(next: "workspace" | "details") {
    setView(next);
    if (project) {
      window.localStorage.setItem(`md.projectView.${project.id}`, next);
    }
  }

  // Auto-derive Production URL from a legacy Dev URL on project load. Modern
  // Replit dev URLs (UUID hosts) cannot be mapped to a prod URL, so this only
  // fires for the old `<slug>.replit.dev` shape. Never derives in the reverse
  // direction — see `inferProdFromDev` for why. Owner-only; runs once per
  // fetched project state.
  const autoDerivedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!project || !isOwner) return;
    if (autoDerivedRef.current === project.id) return;

    const inferred: { productionUrl?: string } = {};
    if (!project.productionUrl && project.liveUrl) {
      const prod = inferProdFromDev(project.liveUrl);
      if (prod) inferred.productionUrl = prod;
    }
    if (Object.keys(inferred).length === 0) {
      autoDerivedRef.current = project.id;
      return;
    }

    autoDerivedRef.current = project.id;
    updateProject.mutate(
      { id: project.id, data: inferred },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(project.id),
          });
          queryClient.invalidateQueries({
            queryKey: getListMyProjectsQueryKey(),
          });
        },
      },
    );
  }, [project?.id, project?.liveUrl, project?.productionUrl, isOwner]);

  // Invite dialog state — used by the workspace top-bar "Invite" button to
  // open a small modal that calls useInviteProjectMember.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDialogEmail, setInviteDialogEmail] = useState("");

  function submitInvite() {
    if (!project) return;
    const email = inviteDialogEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ variant: "destructive", title: "Invalid email" });
      return;
    }
    inviteMember.mutate(
      { id: project.id, data: { email } },
      {
        onSuccess: () => {
          toast({
            title: "Collaborator invited",
            description: `${email} can now access this project.`,
          });
          setInviteDialogEmail("");
          setInviteOpen(false);
          queryClient.invalidateQueries({
            queryKey: getListProjectMembersQueryKey(project.id),
          });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Try again.";
          toast({ variant: "destructive", title: "Invite failed", description: msg });
        },
      },
    );
  }

  // "Set production URL" inline dialog — opened by Republish when no
  // productionUrl is set, and by the overflow menu's "Set production URL" item.
  // Saves directly via useUpdateProject and (optionally) opens the URL after.
  const [prodUrlOpen, setProdUrlOpen] = useState(false);
  const [prodUrlInput, setProdUrlInput] = useState("");

  function openProdUrlDialog() {
    setProdUrlInput(project?.productionUrl ?? "");
    setProdUrlOpen(true);
  }

  function submitProductionUrl(opts?: { openAfter?: boolean }) {
    if (!project) return;
    const raw = prodUrlInput.trim();
    if (!raw) {
      toast({ variant: "destructive", title: "URL required" });
      return;
    }
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(normalized);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      toast({ variant: "destructive", title: "Invalid URL" });
      return;
    }
    updateProject.mutate(
      { id: project.id, data: { productionUrl: normalized } },
      {
        onSuccess: () => {
          toast({
            title: "Production URL saved",
            description: normalized,
          });
          setProdUrlOpen(false);
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(project.id),
          });
          queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
          if (opts?.openAfter) {
            window.open(normalized, "_blank", "noopener,noreferrer");
          }
        },
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            title: "Couldn't save URL",
            description: errorMessage(err, "Try again."),
          });
        },
      },
    );
  }

  // "Set Dev URL" inline dialog — mirrors the production URL dialog so the
  // user can configure their .replit.dev (or other dev host) without leaving
  // the workspace. The Dev URL is what the agent iterates against and what
  // Publish promotes to Production. Persists to project.liveUrl.
  const [devUrlOpen, setDevUrlOpen] = useState(false);
  const [devUrlInput, setDevUrlInput] = useState("");

  function openDevUrlDialog() {
    setDevUrlInput(project?.liveUrl ?? "");
    setDevUrlOpen(true);
  }

  // Auto-prompt for the Dev URL the first time an owner opens a project that
  // has no liveUrl set, so the preview pane can auto-populate on subsequent
  // visits. Gated by sessionStorage per project so we don't re-prompt on every
  // navigation in the same session.
  useEffect(() => {
    if (!project || !isOwner) return;
    if (project.liveUrl) return;
    if (typeof window === "undefined") return;
    const key = `md.devUrlPrompted.project.${project.id}`;
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
    setDevUrlInput("");
    setDevUrlOpen(true);
  }, [project?.id, project?.liveUrl, isOwner]);

  function submitDevUrl(opts?: { openAfter?: boolean }) {
    if (!project) return;
    const raw = devUrlInput.trim();
    if (!raw) {
      toast({ variant: "destructive", title: "URL required" });
      return;
    }
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(normalized);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      toast({ variant: "destructive", title: "Invalid URL" });
      return;
    }
    updateProject.mutate(
      { id: project.id, data: { liveUrl: normalized } },
      {
        onSuccess: () => {
          toast({
            title: "Dev URL saved",
            description: normalized,
          });
          setDevUrlOpen(false);
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(project.id),
          });
          queryClient.invalidateQueries({
            queryKey: getListMyProjectsQueryKey(),
          });
          if (opts?.openAfter) {
            window.open(normalized, "_blank", "noopener,noreferrer");
          }
        },
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            title: "Couldn't save URL",
            description: errorMessage(err, "Try again."),
          });
        },
      },
    );
  }

  // "Auto-link app" dialog — shows the per-project heartbeat token plus a
  // copy-pasteable JS snippet the client drops into their app. The snippet
  // POSTs `https://${REPLIT_DEV_DOMAIN}` to /api/projects/heartbeat on boot,
  // so Machinedog's Dev preview always points at the live workspace without
  // anyone having to re-paste a URL after every Replit run.
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [copied, setCopied] = useState<"token" | "snippet" | null>(null);
  const rotateToken = useRotateProjectHeartbeatToken();

  // While the dialog is open, poll the project every 2s so the heartbeat
  // status indicator flips to "live" as soon as the user wires up the
  // snippet on their side, without requiring a manual page refresh.
  useEffect(() => {
    if (!linkDialogOpen || !Number.isFinite(projectId)) return;
    queryClient.invalidateQueries({
      queryKey: getGetProjectQueryKey(projectId),
    });
    const t = setInterval(() => {
      queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(projectId),
      });
    }, 2000);
    return () => clearInterval(t);
  }, [linkDialogOpen, projectId, queryClient]);

  function copyToClipboard(text: string, which: "token" | "snippet") {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(which);
        setTimeout(() => setCopied(null), 1600);
      })
      .catch(() => {
        toast({ variant: "destructive", title: "Copy failed" });
      });
  }

  function handleRotateToken() {
    if (!project) return;
    if (
      !window.confirm(
        "Rotate the heartbeat token? Your current snippet will stop working until you redeploy with the new token.",
      )
    ) {
      return;
    }
    rotateToken.mutate(
      { id: project.id },
      {
        onSuccess: () => {
          toast({ title: "Token rotated" });
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(project.id),
          });
        },
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            title: "Couldn't rotate token",
            description: errorMessage(err, "Try again."),
          });
        },
      },
    );
  }

  // "Publish" — promotes the current Dev site to Production. Backed by the
  // change-request workflow (T001-T005): we create a change request titled
  // "Publish Dev → Production", call request-publish (which emails the
  // operator and marks the CR awaiting_deploy), and immediately update the
  // project's productionUrl so the Production env tab in the preview pane
  // points at the just-published target. Operator confirms the live deploy
  // separately via mark-deployed.
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNotes, setPublishNotes] = useState("");

  function handlePublishClick() {
    if (!project) return;
    if (!project.liveUrl) {
      toast({
        title: "No Dev URL",
        description:
          "Set a Dev URL on the project before publishing — that's the source of truth for the publish.",
      });
      handleViewChange("details");
      setEditing(true);
      return;
    }
    setPublishNotes("");
    setPublishOpen(true);
  }

  async function confirmPublish() {
    if (!project || !project.liveUrl) return;
    const devUrl = project.liveUrl;
    const note = publishNotes.trim();
    const rawRequest =
      `Publish current Dev to Production.\n\n` +
      `Dev URL: ${devUrl}\n` +
      `Current Production URL: ${project.productionUrl ?? "(none)"}\n` +
      (note ? `\nRelease notes:\n${note}\n` : "");

    try {
      const created = await createChangeRequest.mutateAsync({
        id: project.id,
        data: {
          title: "Publish Dev → Production",
          rawRequest,
        },
      });
      const crId = (created as { id: number }).id;

      await requestChangePublish.mutateAsync({ id: crId });

      // Promote Dev URL to Production so the env tab updates immediately.
      // Operator still has to flip the actual deploy in their hosting UI;
      // the change request stays in "awaiting_deploy" until they confirm.
      if (project.productionUrl !== devUrl) {
        await updateProject.mutateAsync({
          id: project.id,
          data: { productionUrl: devUrl },
        });
      }

      queryClient.invalidateQueries({
        queryKey: getGetProjectQueryKey(project.id),
      });
      queryClient.invalidateQueries({
        queryKey: getListMyProjectsQueryKey(),
      });

      setPublishOpen(false);
      toast({
        title: "Publish requested",
        description:
          "Production now points at your Dev site. We've notified the operator to confirm the deploy.",
      });
    } catch (err) {
      toast({
        title: "Publish failed",
        description:
          err instanceof Error
            ? err.message
            : "Something went wrong creating the publish request.",
      });
    }
  }

  // Sync the edit form from the server-side project record. Skipped while the
  // user is actively editing so the 5s background poll (which keeps the dev
  // preview iframe up-to-date with the latest heartbeat) doesn't wipe in-flight
  // edits every refetch.
  useEffect(() => {
    if (project && !editing) {
      const next = {
        title: project.title,
        summary: project.summary ?? "",
        description: project.description ?? "",
        liveUrl: project.liveUrl ?? "",
        productionUrl: project.productionUrl ?? "",
        coverImageUrl: project.coverImageUrl ?? "",
        status: project.status,
        githubOwner: project.githubOwner ?? "",
        githubRepo: project.githubRepo ?? "",
        githubDefaultBranch: project.githubDefaultBranch ?? "main",
        previewUrlTemplate: project.previewUrlTemplate ?? "",
        operatorEmail: project.operatorEmail ?? "",
      };
      setForm(next);
      // Clear baseline outside of an edit session so a stale snapshot can't
      // leak into the next save.
      editBaselineRef.current = null;
    }
  }, [project, editing]);

  // The instant edit mode opens, snapshot the current form so the save-time
  // diff knows what the user started from. Cleared automatically by the
  // form-sync effect above when editing closes.
  useEffect(() => {
    if (editing && editBaselineRef.current === null) {
      editBaselineRef.current = { ...form };
    }
    // Intentionally only depend on `editing` — re-snapshotting on every
    // keystroke would defeat the diffing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

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
    // Build a sparse patch: only fields the user actually changed since they
    // entered edit mode. This is what protects heartbeat-driven liveUrl
    // updates from being clobbered when the admin saves unrelated edits
    // mid-poll.
    const baseline = editBaselineRef.current ?? {};
    const fullPayload = {
      title: form.title,
      summary: form.summary,
      description: form.description,
      liveUrl: form.liveUrl.trim() ? form.liveUrl.trim() : null,
      productionUrl: form.productionUrl.trim() ? form.productionUrl.trim() : null,
      coverImageUrl: form.coverImageUrl.trim() ? form.coverImageUrl.trim() : null,
      status: form.status,
      githubOwner: form.githubOwner.trim() ? form.githubOwner.trim() : null,
      githubRepo: form.githubRepo.trim() ? form.githubRepo.trim() : null,
      githubDefaultBranch: form.githubDefaultBranch.trim() || "main",
      previewUrlTemplate: form.previewUrlTemplate.trim()
        ? form.previewUrlTemplate.trim()
        : null,
      operatorEmail: form.operatorEmail.trim() ? form.operatorEmail.trim() : null,
    };
    const patch: Partial<typeof fullPayload> = {};
    let changedCount = 0;
    for (const [key, value] of Object.entries(fullPayload)) {
      // Compare against the baseline form value (not the live `project` —
      // that's the whole point: server may have changed under us).
      if (baseline[key] !== form[key as keyof typeof form]) {
        (patch as Record<string, unknown>)[key] = value;
        changedCount++;
      }
    }
    if (changedCount === 0) {
      // Nothing changed — short-circuit. Closes the editor without a network
      // round-trip and without clearing freshly-heartbeated server state.
      setEditing(false);
      toast({ title: "No changes" });
      return;
    }
    updateProject.mutate(
      {
        id: project.id,
        data: patch,
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
    <div
      className={
        view === "workspace"
          ? "h-full flex flex-col p-3 md:p-4 w-full gap-3 overflow-hidden"
          : "min-h-full flex flex-col p-4 md:p-6 max-w-[1600px] mx-auto w-full gap-6"
      }
    >
      {view === "workspace" ? (
        /* ─── Replit-style IDE chrome ─────────────────────────────────────── */
        <div
          className="glass rounded-xl ring-1 ring-border/30 px-1.5 h-11 flex items-center gap-1 shrink-0 overflow-x-auto"
          data-testid="workspace-chrome"
        >
          {/* Back chevron */}
          <Link href="/projects">
            <button
              type="button"
              title="Back to all projects"
              aria-label="Back to all projects"
              data-testid="button-back-projects"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Link>

          {/* Workspace tabs — only Preview and Publishing are surfaced. */}
          <ChromeTab
            icon={<Eye className="h-3.5 w-3.5" />}
            label="Preview"
            active
            testId="tab-workspace-preview"
          />
          <ChromeTab
            icon={<Rocket className="h-3.5 w-3.5" />}
            label="Publishing"
            dismissible
            testId="tab-workspace-publishing"
          />
          <button
            type="button"
            aria-label="Add tab (coming soon)"
            title="Add tab — coming soon"
            data-testid="button-tab-add"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          <div className="flex-1" />

          {/* Right cluster: Invite / Republish / overflow menu */}
          {isOwner && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              data-testid="button-workspace-invite"
              className="hidden sm:inline-flex items-center gap-1 px-2.5 h-7 rounded-md ring-1 ring-border/30 bg-background/60 hover:bg-background/80 transition font-mono text-[11px] text-foreground/90 shrink-0"
            >
              <Users className="h-3.5 w-3.5" />
              Invite
            </button>
          )}
          <button
            type="button"
            onClick={handlePublishClick}
            data-testid="button-workspace-publish"
            title={
              project.liveUrl
                ? `Publish current Dev (${project.liveUrl}) to Production`
                : "Set a Dev URL first to enable Publish"
            }
            className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md font-mono text-[11px] font-bold shadow-md shadow-primary/20 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-white shrink-0"
          >
            <Rocket className="h-3.5 w-3.5" />
            Publish
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                data-testid="button-workspace-menu"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider">
                {project.title}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  handleViewChange("details");
                  setEditing(true);
                }}
                data-testid="menu-edit-project"
              >
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit project
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleViewChange("details")}
                data-testid="menu-switch-details"
              >
                <Layers className="h-3.5 w-3.5 mr-2" />
                Switch to details view
              </DropdownMenuItem>
              {isOwner && (
                <DropdownMenuItem
                  onClick={openDevUrlDialog}
                  data-testid="menu-set-dev-url"
                >
                  <Code2 className="h-3.5 w-3.5 mr-2" />
                  {project.liveUrl ? "Change Dev URL" : "Set Dev URL"}
                </DropdownMenuItem>
              )}
              {isOwner && (
                <DropdownMenuItem
                  onClick={() => setLinkDialogOpen(true)}
                  data-testid="menu-auto-link-app"
                >
                  <Plug className="h-3.5 w-3.5 mr-2" />
                  Auto-link app
                  {project.heartbeatAt && (
                    <span className="ml-auto text-[10px] text-emerald-500 font-mono">
                      live
                    </span>
                  )}
                </DropdownMenuItem>
              )}
              {isOwner && (
                <DropdownMenuItem
                  onClick={openProdUrlDialog}
                  data-testid="menu-set-production-url"
                >
                  <Globe className="h-3.5 w-3.5 mr-2" />
                  {project.productionUrl
                    ? "Change production URL"
                    : "Set production URL"}
                </DropdownMenuItem>
              )}
              {project.productionUrl && (
                <DropdownMenuItem asChild>
                  <a
                    href={project.productionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="menu-open-production"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Open production
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {project.viewerRole === "owner" ? "Owner" : "Collaborator"}
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        /* ─── Details mode header (back button + view toggle + role pill) ── */
        <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="font-mono text-muted-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" /> ALL_PROJECTS
              </Button>
            </Link>
            <div
              role="group"
              aria-label="Project view"
              className="flex items-center gap-0.5 rounded-lg ring-1 ring-border/30 bg-background/40 p-0.5"
            >
              <button
                type="button"
                onClick={() => handleViewChange("workspace")}
                aria-pressed={false}
                aria-label="Switch to workspace view"
                data-testid="button-view-workspace"
                title={
                  hasPreview
                    ? "Workspace view: agent + live preview"
                    : "Workspace view: agent + preview pane (set a Production URL to fill the preview)"
                }
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/40"
              >
                <LayoutPanelLeft className="h-3.5 w-3.5" />
                Workspace
              </button>
              <button
                type="button"
                onClick={() => handleViewChange("details")}
                aria-pressed={true}
                aria-label="Switch to details view"
                data-testid="button-view-details"
                title="Details view: full editor, files, comments, collaborators"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors bg-primary/15 text-primary"
              >
                <Layers className="h-3.5 w-3.5" />
                Details
              </button>
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
            {project.viewerRole === "owner" ? "Owner" : "Collaborator"}
          </span>
        </div>
      )}

      {view === "workspace" && (
        /* Replit-style split: agent on the left, full-height preview on the right.
           The divider is draggable; width is persisted per project. */
        <WorkspaceSplit
          storageKey={`md.workspaceSplit.project.${project.id}`}
          left={
            <AgentConversation projectId={project.id} isOwner={isOwner} compact />
          }
          right={
            <LivePreviewPane
              previewUrl={null}
              liveUrl={project.liveUrl}
              onSetDevUrl={isOwner ? openDevUrlDialog : undefined}
            />
          }
        />
      )}

      {/* Invite collaborator dialog — opened from the workspace top bar. */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite collaborator</DialogTitle>
            <DialogDescription>
              They'll get access as soon as they sign in with this email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label
              htmlFor="invite-dialog-email"
              className="text-xs font-mono font-bold text-muted-foreground tracking-wider uppercase"
            >
              Email address
            </label>
            <Input
              id="invite-dialog-email"
              type="email"
              autoComplete="email"
              placeholder="collaborator@example.com"
              value={inviteDialogEmail}
              onChange={(e) => setInviteDialogEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitInvite();
              }}
              data-testid="input-invite-dialog-email"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setInviteOpen(false)}
              data-testid="button-invite-dialog-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={submitInvite}
              disabled={inviteMember.isPending || !inviteDialogEmail.trim()}
              data-testid="button-invite-dialog-submit"
              className="bg-gradient-to-r from-[#3FB1F0] to-[#7C7BF7] text-white font-bold"
            >
              {inviteMember.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Inviting...
                </>
              ) : (
                <>
                  <Mail className="h-3.5 w-3.5 mr-1.5" /> Send invite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Dev → Production confirm dialog. Creates a change request,
          calls request-publish (notifies operator), and promotes the
          project's productionUrl so the Production env tab in the preview
          pane reflects the new target immediately. */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="sm:max-w-lg !bg-card !backdrop-blur-none border border-border/60 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Publish Dev → Production</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This promotes your current Dev site to Production and notifies
              the operator to confirm the deploy. The change is logged so you
              can roll back if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-md ring-1 ring-border/40 bg-muted/30 p-3 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">
                  From Dev
                </span>
                <span
                  className="font-mono text-xs break-all"
                  data-testid="publish-from-dev"
                >
                  {project.liveUrl ?? "(none)"}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">
                  To Prod
                </span>
                <span
                  className="font-mono text-xs break-all text-foreground/80"
                  data-testid="publish-to-prod"
                >
                  {project.productionUrl &&
                  project.productionUrl !== project.liveUrl
                    ? `${project.productionUrl} → ${project.liveUrl}`
                    : project.liveUrl ?? "(none)"}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="publish-notes-input"
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Release notes (optional)
              </label>
              <textarea
                id="publish-notes-input"
                data-testid="input-publish-notes"
                value={publishNotes}
                onChange={(e) => setPublishNotes(e.target.value)}
                placeholder="What changed in this release?"
                rows={3}
                className="w-full text-sm rounded-md ring-1 ring-border/40 bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setPublishOpen(false)}
              className="px-3 h-8 rounded-md ring-1 ring-border/40 text-sm font-mono hover:bg-muted/40"
              data-testid="button-publish-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPublish}
              disabled={
                createChangeRequest.isPending ||
                requestChangePublish.isPending ||
                updateProject.isPending
              }
              data-testid="button-publish-confirm"
              className="inline-flex items-center gap-1 px-3 h-8 rounded-md font-mono text-[12px] font-bold shadow-md shadow-primary/20 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-white disabled:opacity-60"
            >
              <Rocket className="h-3.5 w-3.5" />
              {createChangeRequest.isPending ||
              requestChangePublish.isPending ||
              updateProject.isPending
                ? "Publishing..."
                : "Publish to Production"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / change production URL dialog — opened from the env switcher
          (when no Production URL is configured) or from the overflow menu.
          Owner-only. Persists via useUpdateProject and refreshes the project
          query so the iframe and env tabs update immediately. */}
      <Dialog open={prodUrlOpen} onOpenChange={setProdUrlOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {project.productionUrl ? "Change production URL" : "Set production URL"}
            </DialogTitle>
            <DialogDescription>
              The live URL of your published site. The workspace preview pane
              loads this URL inside the iframe when the Production env tab is
              selected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label
              htmlFor="prod-url-input"
              className="text-xs font-mono font-bold text-muted-foreground tracking-wider uppercase"
            >
              Production URL
            </label>
            <Input
              id="prod-url-input"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://app.example.com"
              value={prodUrlInput}
              onChange={(e) => setProdUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitProductionUrl();
              }}
              data-testid="input-prod-url"
            />
            <p className="text-[11px] text-muted-foreground/80">
              Tip: include the protocol (we'll add <code>https://</code> if you don't).
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setProdUrlOpen(false)}
              data-testid="button-prod-url-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => submitProductionUrl()}
              disabled={updateProject.isPending || !prodUrlInput.trim()}
              data-testid="button-prod-url-save"
            >
              {updateProject.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Save
                </>
              )}
            </Button>
            <Button
              onClick={() => submitProductionUrl({ openAfter: true })}
              disabled={updateProject.isPending || !prodUrlInput.trim()}
              data-testid="button-prod-url-save-open"
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold"
            >
              <Rocket className="h-3.5 w-3.5 mr-1.5" /> Save & Republish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / change Dev URL dialog — opened from the env switcher (when no
          Dev URL is configured) or from the empty-state Set Dev URL button.
          The Dev URL is the project's iteration target (typically your
          .replit.dev domain). Persists to project.liveUrl. */}
      <Dialog open={devUrlOpen} onOpenChange={setDevUrlOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {project.liveUrl ? "Change Dev URL" : "Set Dev URL"}
            </DialogTitle>
            <DialogDescription>
              The development URL of your project — typically your Replit
              <code className="mx-1">.replit.dev</code> domain. The workspace
              preview pane loads this URL inside the iframe when the Dev env
              tab is selected, and Publish promotes it to Production.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label
              htmlFor="dev-url-input"
              className="text-xs font-mono font-bold text-muted-foreground tracking-wider uppercase"
            >
              Dev URL
            </label>
            <Input
              id="dev-url-input"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://your-project.replit.dev"
              value={devUrlInput}
              onChange={(e) => setDevUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitDevUrl();
              }}
              data-testid="input-dev-url"
            />
            <p className="text-[11px] text-muted-foreground/80">
              Tip: include the protocol (we'll add <code>https://</code> if you don't).
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDevUrlOpen(false)}
              data-testid="button-dev-url-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => submitDevUrl()}
              disabled={updateProject.isPending || !devUrlInput.trim()}
              data-testid="button-dev-url-save"
            >
              {updateProject.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Save
                </>
              )}
            </Button>
            <Button
              onClick={() => submitDevUrl({ openAfter: true })}
              disabled={updateProject.isPending || !devUrlInput.trim()}
              data-testid="button-dev-url-save-open"
              className="bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-bold"
            >
              <Code2 className="h-3.5 w-3.5 mr-1.5" /> Save & Open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-link app dialog. Owner-only. Shows the per-project heartbeat
          token plus a copy-pasteable JS snippet the client drops into their
          app boot. The snippet POSTs the live `https://${REPLIT_DEV_DOMAIN}`
          to /api/projects/heartbeat so this project's Dev URL stays current
          without manual updates. Includes a token rotate action and a status
          row (last heartbeat) so the user can confirm the snippet wired up. */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-2xl !bg-card !backdrop-blur-none border border-border/60 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-4 w-4" /> Auto-link your app
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Drop this snippet into your app and it will report its current
              Replit Dev URL to Machinedog on every boot. No more re-pasting
              after each run.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const token = project.heartbeatToken ?? "";
            const snippet = `// machinedog-heartbeat.js — paste at the top of your server entry
// (e.g. require("./machinedog-heartbeat") in index.js, or import it).
// In Replit, set MACHINEDOG_TOKEN in Secrets to the value above.
(function () {
  const token = process.env.MACHINEDOG_TOKEN;
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (!token || !dev || typeof fetch !== "function") return;
  fetch("${window.location.origin}/api/projects/heartbeat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token,
      devUrl: "https://" + dev,
      replId: process.env.REPL_ID || null,
      replSlug: process.env.REPL_SLUG || null,
    }),
  })
    .then((r) => r.ok && console.log("[machinedog] dev URL reported"))
    .catch(() => {});
})();
`;
            const heartbeatAt = project.heartbeatAt
              ? new Date(project.heartbeatAt)
              : null;
            const ageMs = heartbeatAt
              ? Date.now() - heartbeatAt.getTime()
              : null;
            const fresh = ageMs !== null && ageMs < 1000 * 60 * 10;
            return (
              <div className="space-y-4 py-2 text-sm">
                {/* Status */}
                <div
                  className="rounded-md ring-1 ring-border/40 bg-muted/30 p-3 flex items-center gap-3"
                  data-testid="heartbeat-status"
                >
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      fresh
                        ? "bg-emerald-500 shadow-emerald-500/60 shadow-md animate-pulse"
                        : heartbeatAt
                        ? "bg-amber-500"
                        : "bg-muted-foreground/40"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Heartbeat
                    </div>
                    <div className="text-sm">
                      {heartbeatAt
                        ? `Last seen ${format(heartbeatAt, "MMM d, h:mm a")}`
                        : "Not connected yet"}
                    </div>
                    {project.liveUrl && (
                      <div className="font-mono text-[10px] text-muted-foreground truncate">
                        {project.liveUrl}
                      </div>
                    )}
                  </div>
                </div>

                {/* Token */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Token (paste as MACHINEDOG_TOKEN secret)</span>
                    <button
                      type="button"
                      onClick={handleRotateToken}
                      disabled={rotateToken.isPending}
                      data-testid="button-rotate-token"
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      <RotateCw
                        className={`h-3 w-3 ${rotateToken.isPending ? "animate-spin" : ""}`}
                      />
                      Rotate
                    </button>
                  </label>
                  <div className="flex items-stretch gap-2">
                    <code
                      className="flex-1 min-w-0 font-mono text-xs rounded-md ring-1 ring-border/40 bg-background px-3 py-2 break-all"
                      data-testid="text-heartbeat-token"
                    >
                      {token || "(missing — try rotating)"}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(token, "token")}
                      disabled={!token}
                      data-testid="button-copy-token"
                      className="inline-flex items-center gap-1 px-3 rounded-md ring-1 ring-border/40 text-xs font-mono hover:bg-muted/40 disabled:opacity-50"
                    >
                      {copied === "token" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied === "token" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Snippet */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Snippet (save as machinedog-heartbeat.js)</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(snippet, "snippet")}
                      data-testid="button-copy-snippet"
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      {copied === "snippet" ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copied === "snippet" ? "Copied" : "Copy snippet"}
                    </button>
                  </label>
                  <pre className="font-mono text-[11px] rounded-md ring-1 ring-border/40 bg-background px-3 py-2 max-h-64 overflow-auto whitespace-pre">
                    {snippet}
                  </pre>
                </div>

                {/* Steps */}
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>
                    Save the snippet as{" "}
                    <code className="font-mono">machinedog-heartbeat.js</code>{" "}
                    in your app.
                  </li>
                  <li>
                    Import it once on boot —{" "}
                    <code className="font-mono">
                      require("./machinedog-heartbeat")
                    </code>{" "}
                    or{" "}
                    <code className="font-mono">
                      import "./machinedog-heartbeat.js"
                    </code>
                    .
                  </li>
                  <li>
                    Add{" "}
                    <code className="font-mono">MACHINEDOG_TOKEN</code> to your
                    Replit Secrets with the token above.
                  </li>
                  <li>
                    Restart your Repl. The status above turns green within a
                    second.
                  </li>
                </ol>
              </div>
            );
          })()}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setLinkDialogOpen(false)}
              data-testid="button-link-dialog-close"
              className="px-3 h-8 rounded-md ring-1 ring-border/40 text-sm font-mono hover:bg-muted/40"
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {view === "details" && (<>
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
              <Field label="DEV URL">
                <Input
                  value={form.liveUrl}
                  onChange={(e) => setForm((f) => ({ ...f, liveUrl: e.target.value }))}
                  placeholder="https://your-app.replit.dev — auto-updated by the heartbeat snippet"
                  type="url"
                />
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  The development URL the agent iterates against. Auto-set by the heartbeat snippet, or paste it here.
                </p>
              </Field>
              <Field label="PRODUCTION URL (LIVE PREVIEW)">
                <Input
                  value={form.productionUrl}
                  onChange={(e) => setForm((f) => ({ ...f, productionUrl: e.target.value }))}
                  placeholder="https://beesuite.farm — embedded in the Live Site panel"
                  type="url"
                />
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  The published production URL clients see when Publish is hit.
                </p>
              </Field>
              <Field label="COVER IMAGE URL">
                <Input
                  value={form.coverImageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                  placeholder="https://…/cover.png"
                  type="url"
                />
              </Field>
              <div className="rounded-lg border border-border/40 bg-muted/30 p-4 flex flex-col gap-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 font-mono">
                  GitHub wiring (enables PR previews + auto-merge on Publish)
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="GITHUB OWNER">
                    <Input
                      value={form.githubOwner}
                      onChange={(e) => setForm((f) => ({ ...f, githubOwner: e.target.value }))}
                      placeholder="e.g. machinedog"
                    />
                  </Field>
                  <Field label="GITHUB REPO">
                    <Input
                      value={form.githubRepo}
                      onChange={(e) => setForm((f) => ({ ...f, githubRepo: e.target.value }))}
                      placeholder="e.g. beesuite"
                    />
                  </Field>
                  <Field label="DEFAULT BRANCH">
                    <Input
                      value={form.githubDefaultBranch}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, githubDefaultBranch: e.target.value }))
                      }
                      placeholder="main"
                    />
                  </Field>
                  <Field label="OPERATOR EMAIL">
                    <Input
                      value={form.operatorEmail}
                      onChange={(e) => setForm((f) => ({ ...f, operatorEmail: e.target.value }))}
                      placeholder="ops@machinedog.com"
                      type="email"
                    />
                  </Field>
                </div>
                <Field label="PREVIEW URL TEMPLATE">
                  <Input
                    value={form.previewUrlTemplate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, previewUrlTemplate: e.target.value }))
                    }
                    placeholder="https://preview-{branch}.beesuite.farm  (leave blank to fall back to Dev URL)"
                  />
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    Use {"{branch}"} as the placeholder. Falls back to Dev URL if blank.
                  </p>
                </Field>
              </div>
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

      <AgentConversation
        projectId={project.id}
        isOwner={isOwner}
        onSetDevUrl={isOwner ? openDevUrlDialog : undefined}
      />
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
      </>)}
    </div>
  );
}

function ChromeTab({
  icon,
  label,
  active = false,
  dismissible = false,
  testId,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  /** When true, renders a small "×" affordance like Replit's IDE tabs. The
   *  click is currently a no-op (the tab strip is decorative outside Agent),
   *  but the visual matches the reference. */
  dismissible?: boolean;
  testId?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={
        "h-8 inline-flex items-center gap-1.5 pl-2 rounded-md text-[12px] font-mono transition-colors shrink-0 group " +
        (active
          ? "bg-background/80 text-foreground ring-1 ring-border/40 shadow-sm pr-2"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 pr-1")
      }
      data-testid={testId}
      data-active={active ? "true" : "false"}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="inline-flex items-center gap-1.5 cursor-default"
      >
        <span className={active ? "text-primary" : ""}>{icon}</span>
        <span className="truncate">{label}</span>
      </button>
      {dismissible && !active && (
        <button
          type="button"
          aria-label={`Close ${label} tab`}
          tabIndex={-1}
          className="h-4 w-4 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/60"
        >
          <X className="h-3 w-3" />
        </button>
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

function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function LiveSitePanel({
  productionUrl,
  title,
}: {
  productionUrl: string | null;
  title: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const safeUrl = isSafeHttpUrl(productionUrl) ? productionUrl : null;

  return (
    <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider">
            Live Site
          </h2>
        </div>
        {safeUrl && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="font-mono text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-2" /> REFRESH
            </Button>
            <a
              href={safeUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-primary hover:underline inline-flex items-center gap-1"
            >
              OPEN IN NEW TAB <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {!safeUrl ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-white/3 p-6 text-center">
          <p className="text-sm font-mono text-muted-foreground">
            No live site URL is set for this project yet.
          </p>
          <p className="text-xs font-mono text-muted-foreground mt-2">
            An admin can set the Production URL in the project edit form to embed
            the live site here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-mono text-muted-foreground break-all">
            {safeUrl}
          </p>
          <div className="rounded-lg overflow-hidden border border-white/10 bg-black">
            <iframe
              key={`${safeUrl}-${refreshKey}`}
              src={safeUrl}
              title={`Live preview of ${title}`}
              className="w-full h-[640px] bg-white"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground">
            Note: some sites refuse to be embedded in iframes (X-Frame-Options or CSP).
            If the preview is blank, use OPEN IN NEW TAB.
          </p>
        </div>
      )}
    </div>
  );
}
