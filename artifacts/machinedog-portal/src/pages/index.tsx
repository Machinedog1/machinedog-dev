import { useState } from "react";
import { useSubmitPrompt, useGetMe, usePublishPrompt } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Terminal, Loader2, Zap, AlertTriangle, Globe2, Check, Coins, TrendingUp, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, getListMyPromptsQueryKey } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";

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

  const handlePublish = () => {
    if (!sessionId || publishPrompt.isPending) return;
    const next = !isPublished;
    publishPrompt.mutate(
      { id: sessionId, data: { published: next } },
      {
        onSuccess: (data) => {
          setIsPublished(data.isPublished);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setOutput(null);
    setTokensUsed(null);
    setSessionId(null);
    setIsPublished(false);

    submitPrompt.mutate(
      { data: { prompt } },
      {
        onSuccess: (data) => {
          setOutput(data.output);
          setTokensUsed(data.tokensUsed);
          setSessionId(data.id);
          setIsPublished(data.isPublished);
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
        }
      }
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-5xl mx-auto w-full gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Terminal className="h-6 w-6 text-primary" />
          CONSOLE
        </h1>
        <p className="text-muted-foreground text-sm font-mono flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded glass-subtle text-primary border-primary/20">MACHINEDOG</span>
          Enter system parameters or codebase snippets below.
        </p>
      </div>

      {me && (() => {
        const balance = me.tokenBalance ?? 0;
        const lifetime = me.totalTokensUsed ?? 0;
        const lifetimeTotal = balance + lifetime;
        const usedPct = lifetimeTotal > 0 ? Math.round((lifetime / lifetimeTotal) * 100) : 0;
        const low = balance > 0 && balance <= 50_000;
        const empty = balance <= 0;
        const ringColor = empty
          ? "ring-destructive/40"
          : low
          ? "ring-amber-400/40"
          : "ring-primary/30";
        const numColor = empty
          ? "text-destructive"
          : low
          ? "text-amber-300"
          : "text-primary";
        return (
          <div className={`glass rounded-2xl p-5 md:p-6 ring-1 ${ringColor} relative overflow-hidden`}>
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 blur-[80px] rounded-full pointer-events-none" />
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
              <div className="space-y-3 min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <Coins className="h-3.5 w-3.5 text-primary" />
                  Token balance
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-4xl md:text-5xl font-bold font-mono tracking-tighter ${numColor}`} data-testid="text-token-balance">
                    {balance.toLocaleString()}
                  </span>
                  <span className="text-sm md:text-base font-mono text-muted-foreground">TKNS</span>
                  {empty && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded glass-subtle text-destructive border border-destructive/30">
                      <AlertTriangle className="h-3 w-3" />
                      Empty
                    </span>
                  )}
                  {low && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded glass-subtle text-amber-300 border border-amber-400/30">
                      <AlertTriangle className="h-3 w-3" />
                      Low
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        empty
                          ? "bg-destructive"
                          : low
                          ? "bg-amber-400"
                          : "bg-gradient-to-r from-[#3FB1F0] to-[#7C7BF7]"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(2, 100 - usedPct))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" />
                      Lifetime used: {lifetime.toLocaleString()}
                    </span>
                    {lifetimeTotal > 0 && (
                      <span>{usedPct}% spent</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex md:flex-col gap-2 md:items-end shrink-0">
                <Button
                  size="sm"
                  onClick={() => setLocation("/tokens")}
                  className="font-mono bg-gradient-to-r from-[#3FB1F0] to-[#7C7BF7] hover:opacity-95 text-white font-bold shadow-lg shadow-primary/20 border-0 w-full md:w-auto"
                  data-testid="button-top-up"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Top up
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLocation("/history")}
                  className="font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  Usage history
                </Button>
              </div>
            </div>
            {empty && (
              <div className="relative z-10 mt-4 pt-4 border-t border-destructive/20 text-xs font-mono text-destructive/90">
                You're out of tokens — top up to keep using the console.
              </div>
            )}
          </div>
        );
      })()}

      <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 shrink-0">
          <div className="relative group glass rounded-xl">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Initialize task..."
              className="min-h-[160px] font-mono resize-y border-0 bg-transparent shadow-none focus-visible:ring-0 p-4 pb-12"
              disabled={submitPrompt.isPending}
              data-testid="input-prompt"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono opacity-0 group-focus-within:opacity-100 transition-opacity">
                CMD+ENTER to run
              </span>
              <Button 
                type="submit" 
                disabled={!prompt.trim() || submitPrompt.isPending}
                size="sm"
                className="font-mono bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20"
                data-testid="button-submit-prompt"
              >
                {submitPrompt.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                EXECUTE
              </Button>
            </div>
          </div>
        </form>

        <AnimatePresence>
          {(output || submitPrompt.isPending) && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-hidden flex flex-col glass rounded-xl"
            >
              <div className="h-12 border-b border-border/20 glass-subtle flex items-center justify-between px-4 gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-bold text-muted-foreground">PREVIEW</span>
                  {tokensUsed && (
                    <span className="font-mono text-[10px] text-primary font-semibold glass-subtle px-2 py-0.5 rounded">
                      -{tokensUsed} TKNS
                    </span>
                  )}
                </div>
                {sessionId && !submitPrompt.isPending && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handlePublish}
                    disabled={publishPrompt.isPending}
                    variant={isPublished ? "secondary" : "default"}
                    className={
                      isPublished
                        ? "font-mono text-xs glass-subtle border border-primary/30 text-primary hover:bg-primary/10"
                        : "font-mono text-xs bg-gradient-to-r from-[#3FB1F0] to-[#7C7BF7] hover:opacity-95 text-white font-bold shadow-lg shadow-primary/20 border-0"
                    }
                    data-testid="button-publish-prompt"
                  >
                    {publishPrompt.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : isPublished ? (
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <Globe2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {isPublished ? "PUBLISHED" : "PUBLISH"}
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-6 prose prose-invert max-w-none font-sans prose-pre:glass-strong prose-pre:border-0 prose-pre:shadow-inner">
                {submitPrompt.isPending ? (
                  <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm animate-pulse">
                    <Terminal className="h-4 w-4" />
                    PROCESSING_REQUEST...
                  </div>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || "");
                        return !inline && match ? (
                          <div className="glass-strong rounded-md overflow-hidden my-4 border border-border/10 shadow-inner">
                            <SyntaxHighlighter
                              style={vscDarkPlus as any}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{ margin: 0, background: 'transparent' }}
                              {...props}
                            >
                              {String(children).replace(/\n$/, "")}
                            </SyntaxHighlighter>
                          </div>
                        ) : (
                          <code className="glass-subtle px-1.5 py-0.5 rounded text-primary font-mono text-sm" {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {output || ""}
                  </ReactMarkdown>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
