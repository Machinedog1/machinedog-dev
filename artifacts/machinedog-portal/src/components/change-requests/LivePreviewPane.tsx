import { useState } from "react";
import { ExternalLink, RefreshCw, Globe2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const p = new URL(url);
    return p.protocol === "https:" || p.protocol === "http:";
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
    : "NO PREVIEW";

  return (
    <div className="flex flex-col h-full glass rounded-2xl overflow-hidden ring-1 ring-border/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Globe2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {sourceLabel}
          </span>
          {url && (
            <span className="text-xs font-mono text-foreground truncate">{url}</span>
          )}
        </div>
        {url && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setReloadKey((k) => k + 1)}
              className="h-7 px-2 text-xs font-mono"
              title="Refresh preview"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-7 px-2 text-xs font-mono inline-flex items-center gap-1 hover:text-primary"
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 bg-background">
        {url ? (
          <iframe
            key={reloadKey}
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-2">
            <AlertTriangle className="h-6 w-6" />
            <div className="text-sm">No preview available yet.</div>
            <div className="text-xs">
              Add a Production URL on the project to see your live site here.
            </div>
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 text-[10px] font-mono text-muted-foreground border-t border-border/30 shrink-0">
        Some sites block iframes (X-Frame-Options or CSP). Use OPEN if blank.
      </div>
    </div>
  );
}
