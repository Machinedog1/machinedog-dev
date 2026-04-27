import { useState } from "react";
import { useListMyPrompts } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Terminal, Calendar, Code, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function HistoryPage() {
  const { data, isLoading } = useListMyPrompts();
  const [selectedPrompt, setSelectedPrompt] = useState<any | null>(null);

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-5xl mx-auto w-full gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Terminal className="h-6 w-6 text-primary" />
          EXECUTION_HISTORY
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Log of all console interactions and token usage.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-full glass rounded-xl" />
            ))}
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 glass-subtle border-dashed rounded-xl text-muted-foreground font-mono">
            <Terminal className="h-8 w-8 mb-4 opacity-50" />
            <p>NO_EXECUTION_LOGS_FOUND</p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.data.map((session, index) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={session.id}
                onClick={() => setSelectedPrompt(session)}
                className="glass-interactive p-4 rounded-xl cursor-pointer"
              >
                <div className="flex justify-between items-start mb-3 relative z-10">
                  <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(session.createdAt), "MMM d, yyyy HH:mm")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Code className="h-3 w-3" />
                      {session.model}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-primary font-semibold glass-subtle px-2 py-1 rounded">
                    -{session.tokensUsed} TKNS
                  </span>
                </div>
                <p className="font-mono text-sm line-clamp-2 text-foreground/80 group-hover:text-foreground transition-colors relative z-10">
                  {session.prompt}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedPrompt} onOpenChange={(open) => !open && setSelectedPrompt(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-0">
          {selectedPrompt && (
            <>
              <DialogHeader className="px-6 py-4 border-b border-border/20 glass-strong shrink-0">
                <DialogTitle className="font-mono flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-primary" />
                    EXECUTION_DETAIL
                  </span>
                  <span className="text-xs glass-subtle text-primary px-2 py-1 rounded">
                    {selectedPrompt.tokensUsed} TKNS
                  </span>
                </DialogTitle>
                <div className="text-xs font-mono text-muted-foreground flex gap-4 mt-2">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(new Date(selectedPrompt.createdAt), "PPpp")}</span>
                  <span className="flex items-center gap-1"><Code className="h-3 w-3" /> {selectedPrompt.model}</span>
                </div>
              </DialogHeader>
              
              <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
                <div className="p-6 glass-subtle border-b border-border/20">
                  <div className="text-xs font-mono text-muted-foreground font-bold mb-2">INPUT</div>
                  <div className="font-mono text-sm whitespace-pre-wrap text-foreground">{selectedPrompt.prompt}</div>
                </div>
                <div className="p-6 flex-1">
                  <div className="text-xs font-mono text-muted-foreground font-bold mb-2">OUTPUT</div>
                  <div className="prose prose-invert max-w-none font-sans text-sm">
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
                      {selectedPrompt.output}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
