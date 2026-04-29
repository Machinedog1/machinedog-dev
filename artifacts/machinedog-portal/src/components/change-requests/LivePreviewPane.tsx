import { useState } from "react";
import {
  ExternalLink,
  RefreshCw,
  Globe2,
  AlertTriangle,
  Monitor,
  Tablet,
  Smartphone,
  Lock,
} from "lucide-react";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<Viewport, number | null> = {
  desktop: null, // 100%
  tablet: 768,
  mobile: 390,
};

function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const p = new URL(url);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
}

function prettyHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

function isSecure(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function LivePreviewPane({
  previewUrl,
  productionUrl,
  liveUrl,
}: {
  previewUrl: string | null | undefined;
  productionUrl: string | null | undefined;
  liveUrl: string | null | undefined;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [viewport, setViewport] = useState<Viewport>("desktop");

  const url = isSafeHttpUrl(previewUrl)
    ? previewUrl
    : isSafeHttpUrl(productionUrl)
    ? productionUrl
    : isSafeHttpUrl(liveUrl)
    ? liveUrl
    : null;

  const sourceLabel = isSafeHttpUrl(previewUrl)
    ? "PR PREVIEW"
    : isSafeHttpUrl(productionUrl)
    ? "PRODUCTION"
    : isSafeHttpUrl(liveUrl)
    ? "LIVE"
    : null;

  const sourceTone = isSafeHttpUrl(previewUrl)
    ? "text-amber-300 ring-amber-500/30 bg-amber-500/10"
    : "text-emerald-300 ring-emerald-500/30 bg-emerald-500/10";

  const frameWidth = VIEWPORT_WIDTHS[viewport];
  const frameStyle: React.CSSProperties =
    frameWidth === null
      ? { width: "100%", height: "100%" }
      : {
          width: `${frameWidth}px`,
          height: "100%",
          maxWidth: "100%",
        };

  return (
    <div className="flex flex-col h-full glass rounded-2xl overflow-hidden ring-1 ring-border/30">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border/30 bg-muted/20 shrink-0">
        {/* Traffic-light dots */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={() => url && setReloadKey((k) => k + 1)}
          disabled={!url}
          title="Reload preview"
          data-testid="button-preview-reload"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>

        {/* URL pill */}
        <div className="flex-1 min-w-0 flex items-center gap-2 px-2.5 h-7 rounded-md bg-background/60 ring-1 ring-border/30">
          {url ? (
            isSecure(url) ? (
              <Lock className="h-3 w-3 text-emerald-400/80 shrink-0" />
            ) : (
              <Globe2 className="h-3 w-3 text-muted-foreground shrink-0" />
            )
          ) : (
            <Globe2 className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          )}
          <span className="font-mono text-[11.5px] text-foreground/90 truncate flex-1">
            {url ? prettyHost(url) : "no preview url"}
          </span>
          {sourceLabel && (
            <span
              className={`shrink-0 text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${sourceTone}`}
            >
              {sourceLabel}
            </span>
          )}
        </div>

        {/* Viewport selector */}
        <div className="hidden sm:flex items-center gap-0.5 rounded-md ring-1 ring-border/30 bg-background/40 p-0.5 shrink-0">
          {(
            [
              { id: "desktop", icon: Monitor, label: "Desktop" },
              { id: "tablet", icon: Tablet, label: "Tablet" },
              { id: "mobile", icon: Smartphone, label: "Mobile" },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            const active = viewport === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setViewport(opt.id)}
                title={opt.label}
                data-testid={`button-viewport-${opt.id}`}
                className={
                  "p-1 rounded transition-colors " +
                  (active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40")
                }
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        {/* Open in new tab */}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            data-testid="link-preview-open"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Preview surface */}
      <div className="flex-1 min-h-0 bg-[radial-gradient(circle_at_50%_0%,_hsl(220_15%_15%),_hsl(220_15%_8%))] flex items-center justify-center overflow-auto">
        {url ? (
          <div
            className="bg-background shadow-2xl shadow-black/40 ring-1 ring-border/40 transition-[width] duration-300 overflow-hidden"
            style={frameStyle}
          >
            <iframe
              key={reloadKey}
              src={url}
              title="Live preview"
              className="w-full h-full border-0 block"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              data-testid="iframe-preview"
            />
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-3">
            <div className="h-12 w-12 rounded-full bg-muted/30 ring-1 ring-border/30 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="text-sm text-foreground/90 font-medium">
                No preview yet
              </div>
              <div className="text-xs max-w-xs">
                Add a Production URL on the project to preview the site here, or wait
                for a PR preview to come online.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 text-[10px] font-mono text-muted-foreground/80 border-t border-border/30 shrink-0 flex items-center justify-between gap-2">
        <span className="truncate">
          Some sites block iframes (X-Frame-Options / CSP). Use the open-in-new-tab
          button if the frame stays blank.
        </span>
        {url && (
          <span className="font-mono shrink-0 text-muted-foreground/60">
            {viewport === "desktop"
              ? "FLUID"
              : viewport === "tablet"
              ? "768 px"
              : "390 px"}
          </span>
        )}
      </div>
    </div>
  );
}
