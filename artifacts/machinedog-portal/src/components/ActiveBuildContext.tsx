import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, Minus, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActiveBuild {
  projectId: number;
  buildId: number;
  label?: string;
}

interface ActiveBuildCtx {
  active: ActiveBuild | null;
  setActiveBuild: (b: ActiveBuild | null) => void;
}

const Ctx = createContext<ActiveBuildCtx | null>(null);

export function ActiveBuildProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveBuild | null>(null);
  const value = useMemo(
    () => ({ active, setActiveBuild: setActive }),
    [active],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <BuildLogBottomPanel />
    </Ctx.Provider>
  );
}

export function useActiveBuild(): ActiveBuildCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActiveBuild outside ActiveBuildProvider");
  return v;
}

/**
 * Workspace bottom log panel — fixed to the bottom of the viewport, scoped
 * to the most recently triggered build. Subscribes to the same SSE stream
 * the publish pane uses so logs follow the user across tabs (project
 * detail, change requests, settings) instead of being trapped on /publish.
 */
function BuildLogBottomPanel() {
  const { active, setActiveBuild } = useActiveBuild();
  const [lines, setLines] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const append = useCallback((line: string) => {
    setLines((prev) =>
      [...prev.slice(-300), `[${new Date().toLocaleTimeString()}] ${line}`],
    );
  }, []);

  useEffect(() => {
    if (!active) {
      setLines([]);
      return;
    }
    setLines([`[${new Date().toLocaleTimeString()}] Streaming build #${active.buildId}…`]);
    const url = `/api/projects/${active.projectId}/builds/${active.buildId}/logs/stream`;
    const es = new EventSource(url, { withCredentials: true });
    sourceRef.current = es;
    es.addEventListener("log", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { lines: string[] };
        for (const line of data.lines ?? []) append(line);
      } catch {
        append("(unparseable log frame)");
      }
    });
    es.addEventListener("status", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data);
        append(`status → ${d.status}${d.errorMessage ? ` (${d.errorMessage})` : ""}`);
      } catch {
        append("status update");
      }
    });
    es.addEventListener("done", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data);
        append(`done: ${d.status}`);
      } catch {
        append("done");
      }
      es.close();
      sourceRef.current = null;
    });
    es.onerror = () => {
      append("stream error — closed");
      es.close();
      sourceRef.current = null;
    };
    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [active, append]);

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, collapsed]);

  if (!active) return null;

  return (
    <div
      className="fixed bottom-0 right-0 left-0 md:left-64 z-40 border-t border-border/40 bg-background/95 backdrop-blur"
      data-testid="bottom-log-panel"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>
          Build #{active.buildId}
          {active.label ? ` — ${active.label}` : ""} · project {active.projectId}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setCollapsed((v) => !v)}
            data-testid="button-toggle-log-panel"
            aria-label={collapsed ? "Expand log panel" : "Collapse log panel"}
          >
            {collapsed ? <Maximize2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setActiveBuild(null)}
            data-testid="button-close-log-panel"
            aria-label="Close log panel"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div
          ref={scrollRef}
          className="h-40 overflow-y-auto bg-black/40 px-3 py-2 text-[11px] font-mono leading-snug text-emerald-300/90"
        >
          {lines.length === 0 ? (
            <div className="text-muted-foreground">Waiting for logs…</div>
          ) : (
            lines.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap">
                {l}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
