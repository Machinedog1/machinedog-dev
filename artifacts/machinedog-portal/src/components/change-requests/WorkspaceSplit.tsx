import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

const MIN_PCT = 18;
const MAX_PCT = 75;
const DEFAULT_PCT = 42;

function readStored(storageKey: string): number {
  if (typeof window === "undefined") return DEFAULT_PCT;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return DEFAULT_PCT;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return DEFAULT_PCT;
  return Math.min(MAX_PCT, Math.max(MIN_PCT, n));
}

interface WorkspaceSplitProps {
  storageKey: string;
  left: ReactNode;
  right: ReactNode;
  /** Hide the right pane and the divider on screens narrower than `lg`. */
  rightDesktopOnly?: boolean;
}

export function WorkspaceSplit({
  storageKey,
  left,
  right,
  rightDesktopOnly = true,
}: WorkspaceSplitProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pct, setPct] = useState<number>(() => readStored(storageKey));
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setPct(readStored(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, String(pct));
  }, [storageKey, pct]);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const raw = ((clientX - rect.left) / rect.width) * 100;
    const next = Math.min(MAX_PCT, Math.max(MIN_PCT, raw));
    setPct(next);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      updateFromClientX(e.clientX);
    };
    const onUp = () => setDragging(false);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) updateFromClientX(e.touches[0].clientX);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onUp);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, updateFromClientX]);

  function onHandleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 5 : 2;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPct((p) => Math.max(MIN_PCT, p - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPct((p) => Math.min(MAX_PCT, p + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPct(MIN_PCT);
    } else if (e.key === "End") {
      e.preventDefault();
      setPct(MAX_PCT);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPct(DEFAULT_PCT);
    }
  }

  const rightHiddenClass = rightDesktopOnly ? "hidden lg:flex" : "flex";

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden gap-3 lg:gap-0"
    >
      <div
        className="min-h-0 overflow-hidden flex flex-col lg:basis-auto lg:min-w-0"
        style={{ flexBasis: `${pct}%`, flexGrow: 0, flexShrink: 0 }}
      >
        {left}
      </div>

      {/* Drag handle — desktop only */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize agent column"
        aria-valuemin={MIN_PCT}
        aria-valuemax={MAX_PCT}
        aria-valuenow={Math.round(pct)}
        tabIndex={0}
        onKeyDown={onHandleKeyDown}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onTouchStart={(e) => {
          if (e.touches[0]) updateFromClientX(e.touches[0].clientX);
          setDragging(true);
        }}
        onDoubleClick={() => setPct(DEFAULT_PCT)}
        className={[
          "hidden lg:flex shrink-0 items-center justify-center",
          "mx-1 w-1.5 cursor-col-resize group relative",
          "rounded transition-colors",
          dragging ? "bg-primary/40" : "bg-transparent hover:bg-primary/20",
          "focus:outline-none focus:ring-2 focus:ring-primary/50",
        ].join(" ")}
        data-testid="workspace-split-handle"
        title="Drag to resize. Double-click to reset."
      >
        <GripVertical
          className={[
            "h-4 w-4 transition-opacity",
            dragging
              ? "opacity-100 text-primary"
              : "opacity-0 group-hover:opacity-70 text-muted-foreground",
          ].join(" ")}
        />
      </div>

      <div
        className={`min-h-0 overflow-hidden flex-col ${rightHiddenClass}`}
        style={{ flex: "1 1 0%", minWidth: 0 }}
      >
        {right}
      </div>
    </div>
  );
}
