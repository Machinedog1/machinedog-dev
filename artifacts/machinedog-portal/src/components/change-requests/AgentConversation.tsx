import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProjectAgentThread,
  useSubmitAgentChangeRequest,
  useRequestChangePublish,
  useRollbackChangeRequest,
  useMarkChangeDeployed,
  useRequestUploadUrl,
  useAddProjectFile,
  getGetProjectAgentThreadQueryKey,
  type ChangeRequest,
  type ChangeRequestEvent,
} from "@workspace/api-client-react";
import { Loader2, Send, Sparkles, AlertTriangle, Globe2, Rocket, ArrowDown, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  UserMessage,
  AgentHeader,
  StatusMessage,
  PlanCard,
  PatchCard,
  InlinePublishHint,
  isInProgress,
  eventTone,
} from "./AgentMessage";
import { LivePreviewPane } from "./LivePreviewPane";
import { PublishTab } from "./PublishTab";

const PUBLISH_NOTE =
  "GitHub repo not yet wired up — Publish only emails the operator. The PR/preview integration arrives in the next release.";

const HIDDEN_EVENT_KINDS = new Set<ChangeRequestEvent["kind"]>([
  "snapshot_created",
  "branch_pushed",
]);

function statusHeadline(cr: ChangeRequest): string | null {
  switch (cr.status) {
    case "draft":
      return "Got it — queuing this up.";
    case "distilling":
      return "Reading your project and turning your request into a plan…";
    case "generating_patch":
      return "Drafting the file changes…";
    case "patched":
      return "Drafted the changes. Review the plan and click Publish when you're happy.";
    case "awaiting_publish":
    case "pr_open":
      return "Waiting on Publish.";
    case "merged":
    case "awaiting_deploy":
      return "Operator notified — your change is queued for deploy.";
    case "deployed":
      return "Live in production.";
    case "rolled_back":
      return "Rolled back.";
    case "failed":
      return cr.errorMessage || "Something went wrong.";
    default:
      return null;
  }
}

export function AgentConversation({
  projectId,
  isOwner = false,
}: {
  projectId: number;
  isOwner?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const queryKey = getGetProjectAgentThreadQueryKey(projectId);
  const { data, isLoading, error } = useGetProjectAgentThread(projectId, {
    query: {
      queryKey,
      enabled: Number.isFinite(projectId),
      refetchInterval: (q) => {
        const items = (q.state.data as { items?: { changeRequest: ChangeRequest }[] } | undefined)?.items;
        if (!items?.length) return false;
        return items.some((it) => isInProgress(it.changeRequest.status)) ? 1500 : false;
      },
    },
  });

  const submitMutation = useSubmitAgentChangeRequest({
    mutation: {
      onSuccess: () => {
        setInput("");
        stickToBottomRef.current = true;
        qc.invalidateQueries({ queryKey });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to send";
        toast({ title: "Couldn't send", description: msg, variant: "destructive" });
      },
    },
  });

  const publishMutation = useRequestChangePublish({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey });
        toast({ title: "Sent", description: "Operator notified to publish." });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Publish failed";
        toast({ title: "Publish failed", description: msg, variant: "destructive" });
      },
    },
  });

  const markDeployedMutation = useMarkChangeDeployed({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey });
        toast({ title: "Marked deployed", description: "Change is live." });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed";
        toast({ title: "Mark deployed failed", description: msg, variant: "destructive" });
      },
    },
  });

  const requestUploadMutation = useRequestUploadUrl();
  const addFileMutation = useAddProjectFile();

  async function handleFileSelected(file: File) {
    const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX_BYTES) {
      toast({
        title: "File too large",
        description: "Maximum upload size is 25 MB.",
        variant: "destructive",
      });
      return;
    }
    setIsUploading(true);
    try {
      const upload = await requestUploadMutation.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        },
      });
      const putRes = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }
      await addFileMutation.mutateAsync({
        id: projectId,
        data: {
          name: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          objectPath: upload.objectPath,
        },
      });
      const reference = `[file: ${file.name}](${upload.objectPath})`;
      setInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n${reference}` : reference));
      toast({
        title: "Attached",
        description: `${file.name} added to your message.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }

  const rollbackMutation = useRollbackChangeRequest({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey });
        toast({ title: "Rollback requested" });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Rollback failed";
        toast({ title: "Rollback failed", description: msg, variant: "destructive" });
      },
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const project = data?.project;
  const anyInProgress = items.some((it) => isInProgress(it.changeRequest.status));

  // Auto-scroll to bottom when content grows, unless user scrolled up.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      setShowJumpToLatest(false);
    }
  }, [items]);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (text.split(/\s+/).filter(Boolean).length < 6) {
      toast({
        title: "A bit more detail, please",
        description: "Describe your change in more than five words.",
        variant: "destructive",
      });
      return;
    }
    if (anyInProgress) {
      toast({
        title: "Hold on",
        description: "The agent is still working on the previous request.",
      });
      return;
    }
    submitMutation.mutate({
      id: projectId,
      data: { rawRequest: text },
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading conversation…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px] text-red-300 gap-2">
        <AlertTriangle className="h-5 w-5" />
        Couldn't load the conversation.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 h-[calc(100vh-7rem)] min-h-[700px]">
      {/* LEFT: Conversation */}
      <div className="flex flex-col glass rounded-2xl ring-1 ring-border/30 overflow-hidden min-h-0 relative">
        <div className="flex items-center justify-between px-4 h-11 border-b border-border/30 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/60 ring-1 ring-primary/40 flex items-center justify-center shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div className="flex flex-col min-w-0">
              <h3 className="font-mono text-[12px] uppercase tracking-wider leading-tight">
                Agent
              </h3>
              <div className="text-[10px] text-muted-foreground/80 leading-tight truncate">
                {project?.title ?? "Project"}
              </div>
            </div>
          </div>
          {anyInProgress ? (
            <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-blue-300 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              Working
            </div>
          ) : items.length > 0 ? (
            <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-emerald-300/80 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Idle
            </div>
          ) : null}
        </div>

        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-4 space-y-6 min-h-0"
          data-testid="agent-thread-scroller"
        >
          {items.length === 0 && (
            <div className="text-center text-muted-foreground py-16 px-6">
              <div className="h-12 w-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="text-[14px] text-foreground/90 font-medium">
                Start a conversation
              </div>
              <div className="text-[12px] mt-1 max-w-xs mx-auto">
                Describe a change in plain English. The agent will plan, draft
                the code, and let you review before anything ships.
              </div>
            </div>
          )}

          {items.map(({ changeRequest: cr, events }) => {
            const headline = statusHeadline(cr);
            const visibleEvents = events.filter((e) => !HIDDEN_EVENT_KINDS.has(e.kind));
            const distilledSpec = cr.distilledSpec as
              | {
                  title?: string;
                  intent?: string;
                  files?: { path: string; why: string }[];
                  acceptanceCriteria?: string[];
                  risks?: string[];
                }
              | null;
            const patchFiles = (cr.patchFiles ?? []) as
              | { path: string; contents: string }[];
            const showPlan = !!distilledSpec && (cr.status !== "draft");
            const showPatch = patchFiles.length > 0;
            const showPublishHint =
              cr.status === "patched" ||
              cr.status === "awaiting_publish" ||
              cr.status === "pr_open" ||
              cr.status === "merged" ||
              cr.status === "awaiting_deploy" ||
              cr.status === "deployed" ||
              cr.status === "rolled_back";
            return (
              <div key={cr.id} className="space-y-2.5">
                {/* User's original request */}
                <UserMessage
                  email={cr.requesterEmail ?? null}
                  text={cr.rawRequest}
                  createdAt={cr.createdAt}
                />

                {/* Single agent header per request */}
                <div className="pt-1">
                  <AgentHeader time={visibleEvents[0]?.createdAt ?? cr.updatedAt} />
                </div>

                {/* Inline tool-call style status rows */}
                {visibleEvents.map((ev) => (
                  <StatusMessage
                    key={ev.id}
                    text={ev.message}
                    tone={eventTone(ev.kind)}
                    createdAt={ev.createdAt}
                    kind={ev.kind}
                  />
                ))}

                {/* In-progress shimmer if mid-pipeline */}
                {isInProgress(cr.status) && headline && (
                  <StatusMessage
                    text={headline}
                    tone="working"
                    createdAt={cr.updatedAt}
                  />
                )}

                {/* Plan card */}
                {showPlan && distilledSpec && <PlanCard spec={distilledSpec} />}

                {/* Patch card */}
                {showPatch && (
                  <PatchCard files={patchFiles} summary={cr.patchSummary ?? null} />
                )}

                {/* Publish hint — full controls live in the Publish tab */}
                {showPublishHint && <InlinePublishHint status={cr.status} />}
              </div>
            );
          })}
        </div>

        {/* Jump to latest */}
        {showJumpToLatest && (
          <button
            type="button"
            onClick={jumpToLatest}
            data-testid="button-jump-to-latest"
            className="absolute bottom-[calc(108px+12px)] left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-mono uppercase tracking-wider shadow-lg shadow-primary/30 ring-1 ring-primary-foreground/20 hover:bg-primary/90 transition"
          >
            <ArrowDown className="h-3 w-3" />
            Latest
          </button>
        )}

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-border/30 p-3 bg-muted/10 shrink-0"
        >
          <div className="rounded-xl ring-1 ring-border/40 bg-background focus-within:ring-primary/40 focus-within:ring-2 transition-shadow overflow-hidden">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={
                anyInProgress
                  ? "Agent is working… please wait."
                  : "Describe a change in plain English. Cmd/Ctrl + Enter to send."
              }
              disabled={anyInProgress || submitMutation.isPending}
              className="min-h-[60px] max-h-[180px] resize-none font-mono text-[13px] bg-transparent border-0 ring-0 focus-visible:ring-0 focus-visible:outline-none px-3 py-2.5"
              rows={2}
              data-testid="textarea-agent-input"
            />
            <div className="flex items-center justify-between px-2 pb-2 pt-0 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  data-testid="input-file-upload"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFileSelected(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || anyInProgress}
                  aria-label="Attach a file"
                  title="Attach a file"
                  data-testid="button-attach-file"
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                </button>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/80 px-1 truncate min-w-0">
                  <Sparkles className="h-3 w-3 text-primary/70 shrink-0" />
                  <span className="truncate">Claude · plans, drafts, never ships without you</span>
                </div>
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={
                  anyInProgress || submitMutation.isPending || !input.trim()
                }
                className="font-mono h-8 px-3 shrink-0"
                data-testid="button-agent-send"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5 text-[11px]">Send</span>
              </Button>
            </div>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/70 mt-1.5 px-1">
            {PUBLISH_NOTE}
          </div>
        </form>
      </div>

      {/* RIGHT: Tabbed preview / publish */}
      <div className="min-h-0">
        <Tabs defaultValue="preview" className="flex flex-col h-full glass rounded-2xl ring-1 ring-border/30 overflow-hidden">
          <TabsList className="rounded-none border-b border-border/30 bg-muted/20 h-auto p-1 justify-start shrink-0">
            <TabsTrigger
              value="preview"
              className="font-mono text-xs uppercase tracking-wider data-[state=active]:bg-background"
            >
              <Globe2 className="h-3.5 w-3.5 mr-1.5" />
              Preview
            </TabsTrigger>
            <TabsTrigger
              value="publish"
              className="font-mono text-xs uppercase tracking-wider data-[state=active]:bg-background"
            >
              <Rocket className="h-3.5 w-3.5 mr-1.5" />
              Publish
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="preview"
            className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
            forceMount
          >
            <LivePreviewPane
              previewUrl={null}
              productionUrl={project?.productionUrl}
              liveUrl={project?.liveUrl}
            />
          </TabsContent>
          <TabsContent
            value="publish"
            className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden"
            forceMount
          >
            <PublishTab
              items={items}
              onPublish={(id) => publishMutation.mutate({ id })}
              onRollback={(id) => rollbackMutation.mutate({ id })}
              onMarkDeployed={(id) => markDeployedMutation.mutate({ id })}
              publishPendingId={
                publishMutation.isPending
                  ? publishMutation.variables?.id ?? null
                  : null
              }
              rollbackPendingId={
                rollbackMutation.isPending
                  ? rollbackMutation.variables?.id ?? null
                  : null
              }
              markDeployedPendingId={
                markDeployedMutation.isPending
                  ? markDeployedMutation.variables?.id ?? null
                  : null
              }
              canMarkDeployed={isOwner}
              noteCopy={PUBLISH_NOTE}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
