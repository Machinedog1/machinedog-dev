import { useEffect, useRef, useState } from "react";
import { useSubmitPrompt, useGetMe, usePublishPrompt } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Terminal,
  Loader2,
  Zap,
  AlertTriangle,
  Globe2,
  Check,
  Coins,
  Plus,
  Eye,
  Send,
  History as HistoryIcon,
  Lock,
  Sparkles,
  X,
  ArrowUp,
  Paperclip,
  Cpu,
  CheckCircle2,
  CircleDot,
  Hammer,
  RotateCcw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, getListMyPromptsQueryKey } from "@workspace/api-client-react";

type ActiveTab = "preview" | "publish";

export default function PromptConsole() {
  const [prompt, setPrompt] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const submitPrompt = useSubmitPrompt();
  const publishPrompt = usePublishPrompt();

  const [output, setOutput] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedAt, setPublishedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("preview");
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Tracks the currently-displayed run so async publish callbacks can detect
  // when the user has moved on to a new submission and ignore stale results.
  const sessionIdRef = useRef<number | null>(null);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const handlePublish = () => {
    if (!sessionId || publishPrompt.isPending) return;
    const next = !isPublished;
    const targetSessionId = sessionId;
    publishPrompt.mutate(
      { id: sessionId, data: { published: next } },
      {
        onSuccess: (data) => {
          if (sessionIdRef.current !== targetSessionId) return;
          setIsPublished(data.isPublished);
          setPublishedAt(data.publishedAt ? new Date(data.publishedAt) : null);
          queryClient.invalidateQueries({ queryKey: getListMyPromptsQueryKey() });
          toast({
            title: data.isPublished ? "Prompt published" : "Prompt unpublished",
            description: data.isPublished
              ? "This prompt is now marked as published."
              : "This prompt is no longer published.",
          });
        },
        onError: (err: unknown) => {
          const message =
            (err && typeof err === "object" && "error" in err
              ? String((err as { error?: unknown }).error ?? "")
              : "") || "Could not update publish state.";
          toast({
            variant: "destructive",
            title: "Publish failed",
            description: message,
          });
        },
      }
    );
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = prompt.trim();
    if (!text || submitPrompt.isPending) return;

    setOutput(null);
    setTokensUsed(null);
    setSessionId(null);
    setIsPublished(false);
    setPublishedAt(null);
    setActiveTab("preview");
    setLastSubmitted(text);
    setSubmittedAt(new Date());
    setCompletedAt(null);

    submitPrompt.mutate(
      { data: { prompt: text } },
      {
        onSuccess: (data) => {
          setOutput(data.output);
          setTokensUsed(data.tokensUsed);
          setSessionId(data.id);
          setIsPublished(data.isPublished);
          setPublishedAt(data.publishedAt ? new Date(data.publishedAt) : null);
          setCompletedAt(new Date());
          setPrompt("");
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListMyPromptsQueryKey() });
          toast({
            title: "Execution complete",
            description: `Used ${data.tokensUsed} tokens`,
          });
        },
        onError: (err: unknown) => {
          const errObj =
            err && typeof err === "object" ? (err as Record<string, unknown>) : {};
          const errorMsg = typeof errObj.error === "string" ? errObj.error : "";
          const hasTokenBalance = "tokenBalance" in errObj;
          if (errorMsg === "Insufficient token balance" || hasTokenBalance) {
            toast({
              variant: "destructive",
              title: "Insufficient Balance",
              description: "You don't have enough tokens to run this prompt.",
            });
            setLocation("/tokens");
          } else {
            toast({
              variant: "destructive",
              title: "Error",
              description: errorMsg || "Failed to execute prompt",
            });
          }
        },
      }
    );
  };

  const balance = me?.tokenBalance ?? 0;
  const empty = balance <= 0;
  const low = !empty && balance <= 50_000;
  const tokenChipColor = empty
    ? "text-destructive ring-destructive/40"
    : low
    ? "text-amber-300 ring-amber-400/40"
    : "text-primary ring-primary/30";

  function clearRun() {
    setOutput(null);
    setTokensUsed(null);
    setSessionId(null);
    setIsPublished(false);
    setPublishedAt(null);
    setLastSubmitted(null);
    setSubmittedAt(null);
    setCompletedAt(null);
  }

  return (
    <div className="h-[calc(100vh-4.5rem)] flex flex-col p-3 md:p-5 gap-3 max-w-[1600px] mx-auto w-full min-h-0">
      {/* ─── Top workspace tab bar (Replit-style) ─────────────────────────── */}
      <div className="glass rounded-xl ring-1 ring-border/30 px-2 h-11 flex items-center gap-1 shrink-0 overflow-x-auto">
        <WorkspaceTab
          icon={<Terminal className="h-3.5 w-3.5" />}
          label="Console"
          active
          actionCount={
            submitPrompt.isPending ? "•" : output ? "1" : null
          }
        />
        <WorkspaceTab
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Preview"
          active={false}
          onClick={() => setActiveTab("preview")}
        />
        <WorkspaceTab
          icon={<Send className="h-3.5 w-3.5" />}
          label="Publishing"
          active={false}
          onClick={() => setActiveTab("publish")}
          disabled={!sessionId}
          dot={isPublished}
        />
        <WorkspaceTab
          icon={<HistoryIcon className="h-3.5 w-3.5" />}
          label="History"
          active={false}
          onClick={() => setLocation("/history")}
        />
        <button
          type="button"
          onClick={clearRun}
          disabled={!output && !submitPrompt.isPending}
          title="New tab"
          className="ml-1 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition disabled:opacity-40"
          data-testid="button-new-tab"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1" />

        {/* Token chip + top up */}
        {me && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setLocation("/tokens")}
              data-testid="button-token-chip"
              className={
                "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md ring-1 bg-background/60 font-mono text-[11px] hover:bg-background/80 transition " +
                tokenChipColor
              }
              title="Token balance — click to top up"
            >
              <Coins className="h-3 w-3" />
              <span className="font-bold">{balance.toLocaleString()}</span>
              <span className="text-muted-foreground/80">TKNS</span>
              {(low || empty) && (
                <AlertTriangle className="h-3 w-3 ml-0.5 opacity-80" />
              )}
            </button>
            <Button
              size="sm"
              onClick={() => setLocation("/tokens")}
              className="h-7 px-2.5 font-mono text-[11px] bg-gradient-to-r from-[#3FB1F0] to-[#7C7BF7] hover:opacity-95 text-white font-bold shadow-md shadow-primary/20 border-0"
              data-testid="button-top-up"
            >
              <Plus className="h-3 w-3 mr-1" />
              Top up
            </Button>
          </div>
        )}
      </div>

      {/* ─── Two-pane workspace ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-3 flex-1 min-h-0">
        {/* LEFT: Thread + composer */}
        <div className="flex flex-col glass rounded-xl ring-1 ring-border/30 overflow-hidden min-h-0 relative">
          <div className="flex items-center justify-between px-3 h-10 border-b border-border/30 bg-muted/20 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/60 ring-1 ring-primary/40 flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <h3 className="font-mono text-[12px] uppercase tracking-wider truncate">
                Console Thread
              </h3>
            </div>
            {submitPrompt.isPending ? (
              <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-blue-300 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                Running
              </div>
            ) : output ? (
              <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-emerald-300/80 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Done
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                Idle
              </div>
            )}
          </div>

          {/* Thread scroller */}
          <div
            className="flex-1 overflow-y-auto px-3 py-4 min-h-0 space-y-4"
            data-testid="console-thread-scroller"
          >
            {!lastSubmitted && !submitPrompt.isPending && (
              <div className="text-center text-muted-foreground py-12 px-6">
                <div className="h-12 w-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                  <Terminal className="h-5 w-5 text-primary" />
                </div>
                <div className="text-[14px] text-foreground/90 font-medium">
                  Initialize a task
                </div>
                <div className="text-[12px] mt-1 max-w-xs mx-auto">
                  Drop in system parameters or a codebase snippet. Output renders in the preview to the right.
                </div>
              </div>
            )}

            {lastSubmitted && (
              <>
                {/* User prompt bubble */}
                <UserPromptBubble
                  text={lastSubmitted}
                  email={me?.email ?? null}
                  createdAt={submittedAt}
                />

                {/* Agent header */}
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/60 ring-1 ring-primary/40 flex items-center justify-center shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Machinedog
                  </span>
                  {submittedAt && (
                    <span className="text-[10px] font-mono text-muted-foreground/60">
                      · {formatTime(submittedAt)}
                    </span>
                  )}
                </div>

                {/* Action rows */}
                <ActionRow
                  icon={CircleDot}
                  text="Routing prompt to Claude"
                  state={submitPrompt.isPending ? "working" : "done"}
                />
                <ActionRow
                  icon={Cpu}
                  text={
                    submitPrompt.isPending
                      ? "Generating response…"
                      : `Generated response${
                          tokensUsed ? ` · ${tokensUsed.toLocaleString()} tokens` : ""
                        }`
                  }
                  state={submitPrompt.isPending ? "working" : "done"}
                />
                {output && (
                  <ActionRow
                    icon={Hammer}
                    text={`Output ready · ${output.length.toLocaleString()} chars`}
                    state="done"
                  />
                )}
                {output && (
                  <ActionRow
                    icon={isPublished ? Globe2 : Lock}
                    text={
                      isPublished
                        ? `Published${
                            publishedAt ? ` · ${formatTime(publishedAt)}` : ""
                          }`
                        : "Draft — open Publishing to ship this run"
                    }
                    state={isPublished ? "published" : "default"}
                  />
                )}

                {/* Inline summary chip when done */}
                {output && completedAt && (
                  <div className="flex items-center gap-2 pl-8 pt-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/30 ring-1 ring-border/30 text-[10px] font-mono text-muted-foreground">
                      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                      Run #{sessionId} · finished {formatTime(completedAt)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Composer (Replit-style chrome) */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-border/30 p-3 bg-muted/10 shrink-0"
          >
            <div className="rounded-xl ring-1 ring-border/40 bg-background focus-within:ring-2 focus-within:ring-primary/40 transition-shadow overflow-hidden">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={
                  submitPrompt.isPending
                    ? "Working on it…"
                    : "Make, test, iterate…"
                }
                disabled={submitPrompt.isPending}
                className="min-h-[68px] max-h-[200px] resize-none font-mono text-[13px] bg-transparent border-0 ring-0 focus-visible:ring-0 focus-visible:outline-none px-3 py-2.5"
                data-testid="input-prompt"
                rows={2}
              />
              <div className="flex items-center justify-between px-2 pb-2">
                <div className="flex items-center gap-1">
                  <ComposerChip icon={Zap} label="Power" tooltip="Higher-quality model" />
                  <ComposerChip icon={Paperclip} label="Plan" tooltip="Attach a plan or context" />
                  {tokensUsed && (
                    <span className="ml-1 inline-flex items-center gap-1 px-2 h-6 rounded-md bg-primary/10 ring-1 ring-primary/20 text-[10px] font-mono text-primary">
                      <Coins className="h-2.5 w-2.5" />
                      −{tokensUsed.toLocaleString()}
                    </span>
                  )}
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!prompt.trim() || submitPrompt.isPending || empty}
                  className="h-8 px-3 font-mono bg-gradient-to-r from-[#3FB1F0] to-[#7C7BF7] hover:opacity-95 text-white font-bold shadow-md shadow-primary/20 border-0"
                  data-testid="button-submit-prompt"
                >
                  {submitPrompt.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5 text-[11px]">Run</span>
                </Button>
              </div>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/70 mt-1.5 px-1 flex items-center justify-between gap-2">
              <span>Cmd/Ctrl + Enter to run.</span>
              {empty && (
                <span className="text-destructive">Out of tokens — top up to keep going.</span>
              )}
            </div>
          </form>
        </div>

        {/* RIGHT: Browser-chrome wrapped output / publishing */}
        <div className="flex flex-col glass rounded-xl ring-1 ring-border/30 overflow-hidden min-h-0">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-3 h-11 border-b border-border/30 bg-muted/20 shrink-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
            </div>
            <button
              type="button"
              onClick={clearRun}
              disabled={!output && !submitPrompt.isPending}
              title="Reset console"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition disabled:opacity-40"
              data-testid="button-reset-console"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* URL pill */}
            <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 h-7 rounded-md bg-background/60 ring-1 ring-border/30">
              <Lock className="h-3 w-3 text-emerald-400/80 shrink-0" />
              <span className="font-mono text-[11.5px] text-foreground/90 truncate flex-1">
                machinedog.dev/console
                {sessionId ? `/run/${sessionId}` : ""}
                {activeTab === "publish" ? "/publish" : ""}
              </span>
              <span className="shrink-0 text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ring-primary/30 text-primary bg-primary/10">
                Console
              </span>
            </div>

            {/* Inline tab toggles (mirrors top tab bar but scoped to this pane) */}
            <div className="flex items-center gap-0.5 rounded-md ring-1 ring-border/30 bg-background/40 p-0.5 shrink-0">
              <PaneTabButton
                active={activeTab === "preview"}
                onClick={() => setActiveTab("preview")}
                icon={Eye}
                label="Preview"
                testId="pane-tab-preview"
              />
              <PaneTabButton
                active={activeTab === "publish"}
                onClick={() => setActiveTab("publish")}
                disabled={!sessionId}
                icon={Send}
                label="Publish"
                testId="pane-tab-publish"
                dot={isPublished}
              />
            </div>
          </div>

          {/* Pane content */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,_hsl(220_15%_15%),_hsl(220_15%_8%))]">
            {activeTab === "preview" ? (
              <div className="p-5 md:p-6">
                {submitPrompt.isPending ? (
                  <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm animate-pulse">
                    <Terminal className="h-4 w-4" />
                    PROCESSING_REQUEST…
                  </div>
                ) : output ? (
                  <div className="prose prose-invert max-w-none font-sans prose-pre:glass-strong prose-pre:border-0 prose-pre:shadow-inner">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || "");
                          return !inline && match ? (
                            <div className="glass-strong rounded-md overflow-hidden my-4 border border-border/10 shadow-inner">
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{ margin: 0, background: "transparent" }}
                                {...props}
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code
                              className="glass-subtle px-1.5 py-0.5 rounded text-primary font-mono text-sm"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {output}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <PreviewEmptyState />
                )}
              </div>
            ) : (
              <div className="p-5 md:p-6">
                <div className="max-w-2xl mx-auto flex flex-col gap-5">
                  {/* Status card */}
                  <div
                    className={
                      "glass-subtle rounded-xl p-5 border " +
                      (isPublished ? "border-primary/30" : "border-border/30")
                    }
                  >
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      {isPublished ? (
                        <Globe2 className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                      Status
                    </div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className={
                          "text-2xl font-bold font-mono tracking-tight " +
                          (isPublished ? "text-primary" : "text-foreground")
                        }
                        data-testid="text-publish-status"
                      >
                        {isPublished ? "PUBLISHED" : "DRAFT"}
                      </span>
                      {isPublished && publishedAt && (
                        <span className="text-xs font-mono text-muted-foreground">
                          since {publishedAt.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      {isPublished
                        ? "This run is marked as published — it appears in your published history and can be referenced from other projects."
                        : "Publishing flags this run as a finished output. It stays in your private history either way; publishing just elevates it for reuse and reference."}
                    </p>
                  </div>

                  {/* Action button */}
                  <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={!sessionId || publishPrompt.isPending || submitPrompt.isPending}
                    className={
                      isPublished
                        ? "font-mono w-full glass-subtle border border-primary/30 text-primary hover:bg-primary/10 bg-transparent"
                        : "font-mono w-full bg-gradient-to-r from-[#3FB1F0] to-[#7C7BF7] hover:opacity-95 text-white font-bold shadow-lg shadow-primary/20 border-0"
                    }
                    data-testid="button-publish-prompt"
                  >
                    {publishPrompt.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : isPublished ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    {isPublished ? "UNPUBLISH" : "PUBLISH THIS RUN"}
                  </Button>

                  {/* Detail rows */}
                  <div className="glass-subtle rounded-xl divide-y divide-border/20 border border-border/20">
                    <DetailRow label="Run ID" value={sessionId ? `#${sessionId}` : "—"} />
                    <DetailRow
                      label="Tokens used"
                      value={tokensUsed ? tokensUsed.toLocaleString() : "—"}
                    />
                    <DetailRow
                      label="Output length"
                      value={output ? `${output.length.toLocaleString()} chars` : "—"}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setLocation("/history")}
                    className="font-mono text-xs text-muted-foreground hover:text-foreground self-start"
                  >
                    <HistoryIcon className="h-3.5 w-3.5 mr-1.5" />
                    View all published runs
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function WorkspaceTab({
  icon,
  label,
  active,
  actionCount,
  onClick,
  disabled,
  dot,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  actionCount?: string | null;
  onClick?: () => void;
  disabled?: boolean;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={`workspace-tab-${label.toLowerCase()}`}
      className={
        "group inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md font-mono text-[11.5px] transition-colors shrink-0 " +
        (active
          ? "bg-background ring-1 ring-border/40 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed")
      }
    >
      <span className={active ? "text-primary" : ""}>{icon}</span>
      <span>{label}</span>
      {actionCount && (
        <span
          className={
            "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-bold " +
            (active ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground")
          }
        >
          {actionCount}
        </span>
      )}
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      {active && (
        <X
          className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function PaneTabButton({
  active,
  onClick,
  disabled,
  icon: Icon,
  label,
  testId,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  testId: string;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1 px-2 h-6 rounded text-[10.5px] font-mono uppercase tracking-wider transition " +
        (active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed")
      }
    >
      <Icon className="h-3 w-3" />
      {label}
      {dot && <span className="h-1 w-1 rounded-full bg-primary" />}
    </button>
  );
}

function ComposerChip({
  icon: Icon,
  label,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip: string;
}) {
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      className="inline-flex items-center gap-1 px-2 h-6 rounded-md text-[10.5px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function UserPromptBubble({
  text,
  email,
  createdAt,
}: {
  text: string;
  email: string | null;
  createdAt: Date | null;
}) {
  const initials = (email ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="flex justify-end gap-2.5">
      <div className="flex flex-col items-end max-w-[80%] min-w-0">
        <div className="text-[10px] font-mono text-muted-foreground/70 mb-1 px-1">
          {email ?? "you"} · {createdAt ? formatTime(createdAt) : ""}
        </div>
        <div className="bg-primary/15 text-foreground rounded-2xl rounded-tr-md px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ring-1 ring-primary/20">
          {text}
        </div>
      </div>
      <div
        className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-mono font-bold text-white shrink-0 ring-1 ring-border/40"
        style={{
          background:
            "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
        }}
      >
        {initials}
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  text,
  state,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  state: "working" | "done" | "default" | "published";
}) {
  const ringColor =
    state === "working"
      ? "ring-blue-500/20 bg-blue-500/[0.04]"
      : state === "done"
      ? "ring-emerald-500/20 bg-emerald-500/[0.04]"
      : state === "published"
      ? "ring-primary/30 bg-primary/[0.06]"
      : "ring-border/30 bg-muted/[0.04]";
  const textColor =
    state === "working"
      ? "text-blue-300"
      : state === "done"
      ? "text-emerald-300"
      : state === "published"
      ? "text-primary"
      : "text-muted-foreground";
  const ResolvedIcon = state === "working" ? Loader2 : Icon;
  return (
    <div className={`ml-8 flex items-start gap-2 rounded-md px-2.5 py-1.5 ring-1 ${ringColor}`}>
      <ResolvedIcon
        className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${textColor} ${
          state === "working" ? "animate-spin" : ""
        }`}
      />
      <div className="flex-1 min-w-0 text-[12.5px] leading-snug text-foreground/90">
        {text}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function PreviewEmptyState() {
  return (
    <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center text-muted-foreground gap-3 py-16">
      <div className="h-12 w-12 rounded-xl bg-muted/30 ring-1 ring-border/30 flex items-center justify-center">
        <Eye className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <div className="text-sm text-foreground/90 font-medium">No output yet</div>
        <div className="text-xs max-w-xs">
          Submit a task on the left to see the rendered output here.
        </div>
      </div>
    </div>
  );
}

function formatTime(d: Date): string {
  try {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}
