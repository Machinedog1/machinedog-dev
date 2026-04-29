import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProjectAgentThread,
  useSubmitAgentChangeRequest,
  useRequestChangePublish,
  useRollbackChangeRequest,
  useMarkChangeDeployed,
  getGetProjectAgentThreadQueryKey,
  type ChangeRequest,
  type ChangeRequestEvent,
} from "@workspace/api-client-react";
import { Loader2, Send, Sparkles, AlertTriangle, Globe2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  UserMessage,
  StatusMessage,
  PlanCard,
  PatchCard,
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
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

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
    }
  }, [items]);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = nearBottom;
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
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 h-[calc(100vh-12rem)] min-h-[600px]">
      {/* LEFT: Conversation */}
      <div className="flex flex-col glass rounded-2xl ring-1 ring-border/30 overflow-hidden min-h-0">
        <div className="px-4 py-3 border-b border-border/30 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-mono text-sm uppercase tracking-wider">
              Agent Thread
            </h3>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            One continuous conversation per project. Describe a change in plain
            English — the agent plans it and drafts the code. You click Publish.
          </div>
        </div>

        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0"
        >
          {items.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <Sparkles className="h-8 w-8 mx-auto mb-3 text-primary/50" />
              <div className="text-sm">No conversation yet.</div>
              <div className="text-xs mt-1">
                Send your first request below to get started.
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
            const showPublishCard =
              cr.status === "patched" ||
              cr.status === "awaiting_publish" ||
              cr.status === "pr_open" ||
              cr.status === "merged" ||
              cr.status === "awaiting_deploy" ||
              cr.status === "deployed" ||
              cr.status === "rolled_back";
            return (
              <div key={cr.id} className="space-y-4">
                {/* User's original request */}
                <UserMessage
                  email={cr.requesterEmail ?? null}
                  text={cr.rawRequest}
                  createdAt={cr.createdAt}
                />

                {/* Timeline of agent events as bubbles */}
                {visibleEvents.map((ev) => (
                  <StatusMessage
                    key={ev.id}
                    text={ev.message}
                    tone={eventTone(ev.kind)}
                    createdAt={ev.createdAt}
                  />
                ))}

                {/* Plan card when distilled */}
                {showPlan && distilledSpec && (
                  <div className="ml-11">
                    <PlanCard spec={distilledSpec} />
                  </div>
                )}

                {/* Patch card when files exist */}
                {showPatch && (
                  <div className="ml-11">
                    <PatchCard files={patchFiles} summary={cr.patchSummary ?? null} />
                  </div>
                )}

                {/* In-progress shimmer if mid-pipeline and no event yet */}
                {isInProgress(cr.status) && headline && (
                  <StatusMessage
                    text={headline}
                    tone="working"
                    createdAt={cr.updatedAt}
                  />
                )}

                {/* Publish hint — full controls live in the Publish tab */}
                {showPublishCard && (
                  <div className="ml-11">
                    <div className="rounded-lg ring-1 ring-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-center gap-2">
                      <Rocket className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-foreground">
                        {cr.status === "deployed"
                          ? "Live in production."
                          : cr.status === "rolled_back"
                          ? "Rolled back."
                          : cr.status === "awaiting_deploy" || cr.status === "merged"
                          ? "Operator notified — open the Publish tab to track or roll back."
                          : "Ready to ship — open the Publish tab to review and publish."}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-border/30 p-3 bg-muted/10 shrink-0"
        >
          <div className="flex items-end gap-2">
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
                  : "Describe a change. e.g. 'Add a contact form to the homepage.'"
              }
              disabled={anyInProgress || submitMutation.isPending}
              className="min-h-[64px] max-h-[180px] resize-none font-mono text-sm bg-background"
              rows={2}
            />
            <Button
              type="submit"
              disabled={
                anyInProgress || submitMutation.isPending || !input.trim()
              }
              className="font-mono shrink-0"
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">SEND</span>
            </Button>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1.5 px-1">
            Cmd/Ctrl + Enter to send. {PUBLISH_NOTE}
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
