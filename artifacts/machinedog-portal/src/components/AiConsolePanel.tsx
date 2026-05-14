/**
 * Phase 4 — AI Console panel. Renders inside a full-screen Dialog launched
 * from the workspace toolbar's "AI Plan" button.
 *
 * Features:
 *  - Mode selector (Auto / Fast / Coding / Architect / Long Context / Healthcare Safe)
 *  - Conversation thread (user + assistant turns)
 *  - Proposed-changes panel grouped by message, with per-file accept / reject
 *  - "Open as change request" toggle on accept
 *  - Healthcare-Safe lock state surfaced inline
 *  - Mock-mode banner when no providers are configured
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Send,
  Loader2,
  Check,
  X,
  GitPullRequest,
  AlertTriangle,
  Lock,
  Bot,
  User as UserIcon,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Category =
  | "auto"
  | "fast"
  | "coding"
  | "architect"
  | "long_context"
  | "healthcare_safe";

interface CategoryMeta {
  id: Category;
  label: string;
  description: string;
  configured: boolean;
  modelKey: string | null;
  providerSlug: string | null;
  estimatedCostPerCall: number | null;
}

interface Conversation {
  id: number;
  projectId: number;
  title: string;
  lastCategory: Category;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
  providerSlug: string | null;
  modelKey: string | null;
  category: Category | null;
  inputTokens: number;
  outputTokens: number;
  tokenCost: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ProposedChange {
  id: number;
  conversationId: number;
  messageId: number;
  projectId: number;
  op: "create" | "update" | "delete" | "rename";
  path: string;
  newPath: string | null;
  contents: string | null;
  previousContents: string | null;
  status: "pending" | "accepted" | "rejected" | "applied" | "failed";
  appliedAt: string | null;
  appliedAs: "commit" | "change_request" | null;
  appliedChangeRequestId: number | null;
  rejectedAt: string | null;
  createdAt: string;
}

interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  proposedChanges: ProposedChange[];
}

interface SendResult {
  ok: boolean;
  status: string;
  mocked: boolean;
  category: Category;
  providerSlug: string;
  modelKey: string;
  inputTokens: number;
  outputTokens: number;
  tokenCost: number;
  blockReason: { code: string; message: string } | null;
}

interface HealthcareGate {
  ok: boolean;
  failedPreconditions: string[];
}

export function AiConsoleDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  projectId: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border/30 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-mono">
            <Sparkles className="h-4 w-4 text-primary" />
            AI CONSOLE
          </DialogTitle>
        </DialogHeader>
        {open ? <AiConsolePanel projectId={projectId} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AiConsolePanel({ projectId }: { projectId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(
    null,
  );
  const [category, setCategory] = useState<Category>("auto");
  const [draft, setDraft] = useState("");
  const [acceptAsChangeRequest, setAcceptAsChangeRequest] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["ai-categories"],
    queryFn: async () =>
      await customFetch<{ data: CategoryMeta[]; anyProviderEnabled: boolean }>(
        "/api/ai/categories",
      ),
  });

  const conversationsQuery = useQuery({
    queryKey: ["ai-conversations", projectId],
    queryFn: async () =>
      await customFetch<{ data: Conversation[] }>(
        `/api/projects/${projectId}/ai/conversations`,
      ),
  });

  const healthcareGateQuery = useQuery({
    queryKey: ["ai-healthcare-gate", projectId],
    queryFn: async () =>
      await customFetch<HealthcareGate>(
        `/api/projects/${projectId}/ai/healthcare-gate`,
      ),
  });

  const conversationQuery = useQuery({
    queryKey: ["ai-conversation", activeConversationId],
    enabled: activeConversationId != null,
    queryFn: async () =>
      await customFetch<ConversationDetail>(
        `/api/ai/conversations/${activeConversationId}`,
      ),
  });

  // Auto-select the most recent conversation, or auto-create the first one.
  useEffect(() => {
    if (activeConversationId != null) return;
    const list = conversationsQuery.data?.data ?? [];
    if (list.length) {
      setActiveConversationId(list[0].id);
    }
  }, [conversationsQuery.data, activeConversationId]);

  const createConversationMut = useMutation({
    mutationFn: async () =>
      await customFetch<Conversation>(
        `/api/projects/${projectId}/ai/conversations`,
        { method: "POST", body: JSON.stringify({ title: "New conversation" }) },
      ),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["ai-conversations", projectId] });
      setActiveConversationId(c.id);
    },
  });

  async function streamSend(vars: {
    conversationId: number;
    content: string;
    category: Category;
  }) {
    setIsStreaming(true);
    setStreamingText("");
    try {
      const r = await fetch(
        `/api/ai/conversations/${vars.conversationId}/messages/stream`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content: vars.content,
            category: vars.category,
          }),
        },
      );
      if (!r.ok || !r.body) {
        const text = await r.text().catch(() => "");
        throw new Error(text || `Stream failed: ${r.status}`);
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let finalPayload: {
        result: SendResult;
        proposedChanges: ProposedChange[];
      } | null = null;
      let errorMessage: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let evtName = "message";
          let dataLine = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) evtName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          let parsed: unknown;
          try { parsed = JSON.parse(dataLine); } catch { continue; }
          if (!parsed || typeof parsed !== "object") continue;
          const evt = parsed as Record<string, unknown>;
          if (evtName === "delta") {
            const t = typeof evt.text === "string" ? evt.text : "";
            acc += t;
            setStreamingText(acc);
          } else if (evtName === "done") {
            finalPayload = evt as unknown as {
              result: SendResult;
              proposedChanges: ProposedChange[];
            };
          } else if (evtName === "error") {
            errorMessage =
              typeof evt.message === "string" ? evt.message : "stream error";
          }
        }
      }
      if (errorMessage) throw new Error(errorMessage);
      qc.invalidateQueries({ queryKey: ["ai-conversation", activeConversationId] });
      qc.invalidateQueries({ queryKey: ["ai-conversations", projectId] });
      setDraft("");
      if (finalPayload) {
        const result = finalPayload.result;
        if (result.status === "insufficient_tokens") {
          toast({
            title: "Insufficient tokens",
            description: result.blockReason?.message ?? "Top up to continue.",
            variant: "destructive",
          });
        } else if (result.mocked) {
          toast({
            title: "Mock provider",
            description:
              "No AI providers are enabled. Enable one in /admin/ai-models for live responses.",
          });
        } else if (!result.ok) {
          toast({
            title: result.blockReason?.code ?? "AI error",
            description:
              result.blockReason?.message ?? "The AI call did not succeed.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
      setStreamingText("");
    }
  }

  const acceptChangeMut = useMutation({
    mutationFn: async (vars: { id: number; asChangeRequest: boolean }) =>
      await customFetch<{
        change: ProposedChange;
        commit: { branch: string; commitSha: string } | null;
        commitWarning: string | null;
        changeRequestId?: number;
      }>(`/api/ai/proposed-changes/${vars.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ asChangeRequest: vars.asChangeRequest }),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: ["ai-conversation", activeConversationId],
      });
      if (data.changeRequestId) {
        toast({
          title: "Opened as change request",
          description: `Change request #${data.changeRequestId} created.`,
        });
      } else if (data.commit) {
        toast({
          title: "Committed",
          description: `${data.commit.branch} @ ${data.commit.commitSha.slice(0, 7)}`,
        });
      } else if (data.commitWarning) {
        toast({
          title: "Saved (no GitHub commit)",
          description: data.commitWarning,
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Accept failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const rejectChangeMut = useMutation({
    mutationFn: async (id: number) =>
      await customFetch<{ change: ProposedChange }>(
        `/api/ai/proposed-changes/${id}/reject`,
        { method: "POST" },
      ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["ai-conversation", activeConversationId],
      }),
  });

  const conversations = conversationsQuery.data?.data ?? [];
  const detail = conversationQuery.data ?? null;
  const cats = categoriesQuery.data?.data ?? [];
  const healthcareGate = healthcareGateQuery.data;
  // Show the mock-mode banner when the server reports no providers are
  // enabled in the registry. We can't infer this from `cats.every(!configured)`
  // because `auto` is always reported as configured (it falls back to mock
  // server-side).
  const noProvidersConfigured =
    categoriesQuery.data?.anyProviderEnabled === false;

  async function ensureConversationAndSend() {
    if (!draft.trim()) return;
    let cid = activeConversationId;
    if (cid == null) {
      const created = await createConversationMut.mutateAsync();
      cid = created.id;
    }
    await streamSend({
      conversationId: cid,
      content: draft.trim(),
      category,
    });
  }

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Left rail: conversations */}
      <aside className="w-56 shrink-0 border-r border-border/30 bg-background/40 flex flex-col">
        <div className="p-2 border-b border-border/30">
          <Button
            size="sm"
            variant="outline"
            className="w-full font-mono text-xs"
            onClick={() => createConversationMut.mutate()}
            disabled={createConversationMut.isPending}
            data-testid="button-ai-new-conversation"
          >
            {createConversationMut.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : null}
            + New conversation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground font-mono">
              No conversations yet.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveConversationId(c.id)}
                data-testid={`button-ai-conversation-${c.id}`}
                className={`w-full text-left px-3 py-2 text-xs font-mono border-b border-border/20 hover:bg-muted/30 ${
                  c.id === activeConversationId ? "bg-muted/40" : ""
                }`}
              >
                <div className="truncate text-foreground/90">{c.title}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {c.lastCategory}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Center: thread */}
      <section className="flex-1 min-w-0 flex flex-col">
        {noProvidersConfigured ? (
          <div className="px-3 py-2 text-xs font-mono bg-amber-500/10 text-amber-200 border-b border-amber-500/30 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            No AI providers enabled — running in mock mode. Admins can enable
            providers at <code className="ml-1">/admin/ai-models</code>.
          </div>
        ) : null}
        <div className="px-3 py-2 border-b border-border/30 flex items-center gap-2 flex-wrap shrink-0">
          {cats.map((c) => {
            const isHc = c.id === "healthcare_safe";
            const locked = isHc && healthcareGate && !healthcareGate.ok;
            const disabled = !c.configured || locked;
            return (
              <button
                key={c.id}
                onClick={() => !disabled && setCategory(c.id)}
                disabled={disabled}
                title={
                  locked
                    ? `Locked: ${healthcareGate?.failedPreconditions.join("; ")}`
                    : !c.configured
                      ? "No model configured for this lane"
                      : `${c.providerSlug}/${c.modelKey} • ~${c.estimatedCostPerCall} tokens/call`
                }
                data-testid={`button-ai-category-${c.id}`}
                className={`text-[11px] font-mono px-2 py-1 rounded ring-1 transition flex items-center gap-1 ${
                  category === c.id
                    ? "bg-primary/20 ring-primary/60 text-primary-foreground"
                    : "ring-border/30 hover:bg-muted/40"
                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {locked ? <Lock className="h-3 w-3" /> : null}
                {c.label}
              </button>
            );
          })}
        </div>

        <ThreadView
          detail={detail}
          loading={conversationQuery.isLoading}
          streamingText={isStreaming ? streamingText : ""}
          onAccept={(id) =>
            acceptChangeMut.mutate({ id, asChangeRequest: acceptAsChangeRequest })
          }
          onReject={(id) => rejectChangeMut.mutate(id)}
          accepting={acceptChangeMut.isPending}
          rejecting={rejectChangeMut.isPending}
        />

        <div className="border-t border-border/30 p-3 shrink-0 bg-background/60">
          <div className="flex items-center gap-2 mb-2">
            <label className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={acceptAsChangeRequest}
                onChange={(e) => setAcceptAsChangeRequest(e.target.checked)}
                data-testid="checkbox-ai-as-cr"
              />
              <GitPullRequest className="h-3 w-3" />
              Accept as change request (instead of direct commit)
            </label>
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  ensureConversationAndSend();
                }
              }}
              placeholder="Ask the AI to plan, refactor, or write code… (Cmd/Ctrl+Enter to send)"
              rows={3}
              className="flex-1 font-mono text-xs"
              data-testid="textarea-ai-prompt"
            />
            <Button
              onClick={ensureConversationAndSend}
              disabled={
                !draft.trim() ||
                isStreaming ||
                createConversationMut.isPending
              }
              data-testid="button-ai-send"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ThreadView({
  detail,
  loading,
  streamingText,
  onAccept,
  onReject,
  accepting,
  rejecting,
}: {
  detail: ConversationDetail | null;
  loading: boolean;
  streamingText: string;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  accepting: boolean;
  rejecting: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [detail?.messages.length, streamingText]);

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted-foreground text-xs font-mono">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading conversation…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-muted-foreground text-xs font-mono">
        Start a new conversation to begin.
      </div>
    );
  }
  const changesByMessage = new Map<number, ProposedChange[]>();
  for (const c of detail.proposedChanges) {
    const arr = changesByMessage.get(c.messageId) ?? [];
    arr.push(c);
    changesByMessage.set(c.messageId, arr);
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      {detail.messages.map((m) => (
        <MessageBlock
          key={m.id}
          message={m}
          changes={changesByMessage.get(m.id) ?? []}
          onAccept={onAccept}
          onReject={onReject}
          accepting={accepting}
          rejecting={rejecting}
        />
      ))}
      {streamingText ? (
        <div
          className="rounded-lg ring-1 ring-primary/30 bg-primary/5 p-3"
          data-testid="ai-streaming-block"
        >
          <div className="flex items-center gap-2 text-[11px] font-mono text-primary mb-1">
            <Bot className="h-3 w-3" />
            <span>assistant • streaming…</span>
            <Loader2 className="h-3 w-3 animate-spin" />
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/90">
            {streamingText}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function MessageBlock({
  message,
  changes,
  onAccept,
  onReject,
  accepting,
  rejecting,
}: {
  message: Message;
  changes: ProposedChange[];
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  accepting: boolean;
  rejecting: boolean;
}) {
  const isUser = message.role === "user";
  const meta = message.metadata as { mocked?: boolean; blockReason?: { code: string; message: string } | null } | null;
  return (
    <div
      className={`rounded-lg ring-1 p-3 ${
        isUser
          ? "ring-primary/30 bg-primary/5 ml-12"
          : "ring-border/30 bg-background/60 mr-12"
      }`}
      data-testid={`ai-message-${message.id}`}
    >
      <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground mb-1.5">
        {isUser ? <UserIcon className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
        <span className="uppercase">{message.role}</span>
        {message.modelKey ? (
          <span className="opacity-70">• {message.providerSlug}/{message.modelKey}</span>
        ) : null}
        {message.category ? <span className="opacity-70">• {message.category}</span> : null}
        {message.tokenCost > 0 ? (
          <span className="opacity-70">• {message.tokenCost} tokens</span>
        ) : null}
        {meta?.mocked ? (
          <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200">
            mock
          </span>
        ) : null}
      </div>
      <div className="font-mono text-xs whitespace-pre-wrap break-words text-foreground/90">
        {message.content}
      </div>
      {meta?.blockReason ? (
        <div className="mt-2 text-[11px] font-mono text-amber-200 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {meta.blockReason.code}:{" "}
          {meta.blockReason.message}
        </div>
      ) : null}
      {changes.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
            Proposed changes ({changes.length})
          </div>
          {changes.map((c) => (
            <ProposedChangeBlock
              key={c.id}
              change={c}
              onAccept={onAccept}
              onReject={onReject}
              accepting={accepting}
              rejecting={rejecting}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProposedChangeBlock({
  change,
  onAccept,
  onReject,
  accepting,
  rejecting,
}: {
  change: ProposedChange;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  accepting: boolean;
  rejecting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const opColor: Record<ProposedChange["op"], string> = {
    create: "bg-green-500/20 text-green-300 ring-green-500/40",
    update: "bg-blue-500/20 text-blue-300 ring-blue-500/40",
    delete: "bg-red-500/20 text-red-300 ring-red-500/40",
    rename: "bg-purple-500/20 text-purple-300 ring-purple-500/40",
  };
  const statusColor: Record<ProposedChange["status"], string> = {
    pending: "bg-yellow-500/20 text-yellow-200",
    accepted: "bg-green-500/20 text-green-300",
    rejected: "bg-red-500/20 text-red-300",
    applied: "bg-green-500/20 text-green-300",
    failed: "bg-red-500/20 text-red-300",
  };
  return (
    <div
      className="rounded ring-1 ring-border/30 bg-background/40"
      data-testid={`proposed-change-${change.id}`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-2 py-1.5 flex items-center gap-2 text-left hover:bg-muted/30"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ring-1 ${opColor[change.op]}`}
        >
          {change.op}
        </span>
        <span className="font-mono text-[11px] text-foreground/90 truncate">
          {change.path}
          {change.newPath ? ` → ${change.newPath}` : ""}
        </span>
        <span
          className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono ${statusColor[change.status]}`}
        >
          {change.status}
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-border/30 p-2 space-y-2">
          <DiffView
            previous={change.previousContents}
            next={change.contents}
            op={change.op}
          />
          {change.status === "pending" ? (
            <div className="flex items-center gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onReject(change.id)}
                disabled={rejecting}
                data-testid={`button-reject-${change.id}`}
              >
                <X className="h-3 w-3 mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() => onAccept(change.id)}
                disabled={accepting}
                data-testid={`button-accept-${change.id}`}
              >
                <Check className="h-3 w-3 mr-1" /> Accept
              </Button>
            </div>
          ) : change.status === "accepted" || change.status === "applied" ? (
            <div className="text-[11px] font-mono text-green-300">
              {change.appliedAs === "change_request"
                ? `Opened as change request #${change.appliedChangeRequestId}`
                : "Committed to workspace branch."}
            </div>
          ) : change.status === "rejected" ? (
            <div className="text-[11px] font-mono text-muted-foreground">
              Rejected.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DiffView({
  previous,
  next,
  op,
}: {
  previous: string | null;
  next: string | null;
  op: ProposedChange["op"];
}) {
  if (op === "delete") {
    return (
      <pre className="text-[10px] font-mono whitespace-pre-wrap bg-red-500/10 p-2 rounded max-h-72 overflow-auto">
        {previous ?? "(no snapshot of previous contents)"}
      </pre>
    );
  }
  if (op === "create") {
    return (
      <pre className="text-[10px] font-mono whitespace-pre-wrap bg-green-500/10 p-2 rounded max-h-72 overflow-auto">
        {next ?? ""}
      </pre>
    );
  }
  // update / rename — render side-by-side line diff
  const prevLines = (previous ?? "").split("\n");
  const nextLines = (next ?? "").split("\n");
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
      <div>
        <div className="text-muted-foreground mb-1">Before</div>
        <pre className="whitespace-pre-wrap bg-red-500/10 p-2 rounded max-h-72 overflow-auto">
          {prevLines.join("\n") || "(empty)"}
        </pre>
      </div>
      <div>
        <div className="text-muted-foreground mb-1">After</div>
        <pre className="whitespace-pre-wrap bg-green-500/10 p-2 rounded max-h-72 overflow-auto">
          {nextLines.join("\n") || "(empty)"}
        </pre>
      </div>
    </div>
  );
}
