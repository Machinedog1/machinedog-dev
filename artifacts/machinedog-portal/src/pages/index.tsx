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
import { Terminal, Loader2, Zap, AlertTriangle, Globe2, Check } from "lucide-react";
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
          <span className="text-xs px-2 py-0.5 rounded glass-subtle text-primary border-primary/20">CLAUDE-3.5-SONNET</span>
          Enter system parameters or codebase snippets below.
        </p>
      </div>

      {me && me.tokenBalance <= 0 && (
        <div className="glass border-destructive/50 text-destructive px-4 py-3 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Out of tokens</h3>
            <p className="text-sm opacity-90">Please purchase a token bundle to continue using the console.</p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setLocation("/tokens")}>
            Buy Tokens
          </Button>
        </div>
      )}

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
