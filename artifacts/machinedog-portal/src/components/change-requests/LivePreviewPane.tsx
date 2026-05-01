import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  RefreshCw,
  Globe2,
  AlertTriangle,
  Monitor,
  Tablet,
  Smartphone,
  Lock,
  PictureInPicture2,
  Code2,
  Rocket,
  Plus,
  GitPullRequest,
} from "lucide-react";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<Viewport, number | null> = {
  desktop: null, // 100%
  tablet: 768,
  mobile: 390,
};

/** The three environments the workspace preview can target. */
type Env = "dev" | "prod" | "preview";

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
  onSetProductionUrl,
  onSetDevUrl,
}: {
  previewUrl: string | null | undefined;
  productionUrl: string | null | undefined;
  liveUrl: string | null | undefined;
  /** Optional callback to open a "set production URL" dialog when the user
   *  clicks Production in the env switcher and no URL is configured. */
  onSetProductionUrl?: () => void;
  /** Optional callback to open a "set dev URL" dialog when the user clicks
   *  Dev in the env switcher and no URL is configured. */
  onSetDevUrl?: () => void;
}) {
  const [reloadKey, setReloadKey] = useState(0);
  const [viewport, setViewport] = useState<Viewport>("desktop");

  // Available environments (only those with a URL configured count as
  // "available" for switching purposes — but Dev/Prod tabs always render so
  // the user can see what's missing and click to set it).
  const envs = useMemo(
    () => ({
      dev: isSafeHttpUrl(liveUrl) ? liveUrl : null,
      prod: isSafeHttpUrl(productionUrl) ? productionUrl : null,
      preview: isSafeHttpUrl(previewUrl) ? previewUrl : null,
    }),
    [liveUrl, productionUrl, previewUrl],
  );

  // Default selected env: prefer PR preview when present (most actionable),
  // then production (canonical live), then dev. The selection is sticky for
  // the session — but we re-default whenever the user's available envs change.
  const initialEnv: Env = envs.preview ? "preview" : envs.prod ? "prod" : "dev";
  const [selectedEnv, setSelectedEnv] = useState<Env>(initialEnv);

  // If the env the user picked stops having a URL (e.g. preview removed),
  // gracefully fall back so the iframe never points at a dangling state.
  useEffect(() => {
    if (!envs[selectedEnv]) {
      const fallback: Env = envs.preview
        ? "preview"
        : envs.prod
        ? "prod"
        : envs.dev
        ? "dev"
        : selectedEnv; // keep selection so the empty state can prompt to set it
      if (fallback !== selectedEnv) setSelectedEnv(fallback);
    }
  }, [envs, selectedEnv]);

  const url = envs[selectedEnv];

  const sourceLabel =
    selectedEnv === "preview" ? "PR PREVIEW" : selectedEnv === "prod" ? "PRODUCTION" : "DEV";
  const sourceTone =
    selectedEnv === "preview"
      ? "text-amber-300 ring-amber-500/30 bg-amber-500/10"
      : selectedEnv === "prod"
      ? "text-emerald-300 ring-emerald-500/30 bg-emerald-500/10"
      : "text-sky-300 ring-sky-500/30 bg-sky-500/10";

  function handleEnvClick(env: Env) {
    setSelectedEnv(env);
    if (env === "prod" && !envs.prod && onSetProductionUrl) onSetProductionUrl();
    if (env === "dev" && !envs.dev && onSetDevUrl) onSetDevUrl();
  }

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
      {/* Environment switcher — Dev / Production / PR Preview. Always renders
          Dev + Production so users can see what's missing and click to set it.
          PR Preview only appears when an active preview URL exists. */}
      <div
        className="flex items-center gap-1 px-3 h-9 border-b border-border/30 bg-muted/10 shrink-0 overflow-x-auto"
        role="tablist"
        aria-label="Preview environment"
        data-testid="preview-env-switcher"
      >
        <EnvTab
          icon={<Code2 className="h-3.5 w-3.5" />}
          label="Dev"
          host={envs.dev ? prettyHost(envs.dev) : "not set"}
          active={selectedEnv === "dev"}
          missing={!envs.dev}
          onClick={() => handleEnvClick("dev")}
          tone="sky"
          testId="env-tab-dev"
        />
        <EnvTab
          icon={<Rocket className="h-3.5 w-3.5" />}
          label="Production"
          host={envs.prod ? prettyHost(envs.prod) : "not set"}
          active={selectedEnv === "prod"}
          missing={!envs.prod}
          onClick={() => handleEnvClick("prod")}
          tone="emerald"
          testId="env-tab-prod"
        />
        {envs.preview && (
          <EnvTab
            icon={<GitPullRequest className="h-3.5 w-3.5" />}
            label="PR Preview"
            host={prettyHost(envs.preview)}
            active={selectedEnv === "preview"}
            missing={false}
            onClick={() => handleEnvClick("preview")}
            tone="amber"
            testId="env-tab-preview"
          />
        )}
        {/* Quick-add: only show "+" when a configurable env is missing AND we
            have a callback wired up. Keeps the row clean otherwise. */}
        {((!envs.dev && onSetDevUrl) || (!envs.prod && onSetProductionUrl)) && (
          <button
            type="button"
            onClick={() => {
              if (!envs.prod && onSetProductionUrl) onSetProductionUrl();
              else if (!envs.dev && onSetDevUrl) onSetDevUrl();
            }}
            title="Add a URL for the missing environment"
            aria-label="Add environment URL"
            data-testid="env-tab-add"
            className="ml-1 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

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

        {/* Pop out — open in a chrome-less popup window (great for second-monitor preview) */}
        <button
          type="button"
          onClick={() => {
            if (!url) return;
            window.open(
              url,
              `machinedog-preview-${url}`,
              "popup,width=1280,height=900,toolbar=0,location=0,menubar=0,status=0,resizable=1",
            );
          }}
          disabled={!url}
          aria-label="Pop preview out into a separate window"
          title="Pop out into a separate window"
          data-testid="button-preview-popout"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PictureInPicture2 className="h-3.5 w-3.5" />
        </button>

        {/* Open in new tab — always visible; disabled when no URL is set yet */}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            aria-label="Open preview in new tab"
            data-testid="link-preview-open"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Open preview in new tab (no URL set)"
            title="No preview URL set yet — add a Production URL on the project to enable"
            data-testid="link-preview-open"
            className="p-1.5 rounded-md text-muted-foreground/40 cursor-not-allowed shrink-0"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Auth/upload notice — matches Replit's preview pane chrome. Only shown
          when there's a real URL loaded; encourages users to test sensitive
          flows in a real browser tab where third-party cookies aren't blocked. */}
      {url && (
        <div
          className="px-3 py-1.5 text-[11px] flex items-center justify-between gap-2 shrink-0 bg-orange-500/15 text-orange-200 border-t border-b border-orange-500/30"
          data-testid="preview-auth-banner"
        >
          <span className="truncate">
            Open a new tab to test authentication and file uploads.
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-orange-100 hover:text-white shrink-0"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </a>
        </div>
      )}

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
                No {selectedEnv === "prod" ? "production" : selectedEnv === "dev" ? "dev" : "preview"} URL set
              </div>
              <div className="text-xs max-w-xs">
                {selectedEnv === "prod"
                  ? "Add a Production URL so this iframe loads your live site."
                  : selectedEnv === "dev"
                  ? "Add a Dev URL (e.g. your Replit .replit.dev domain) so this iframe loads your in-progress build."
                  : "Open a change request to generate a PR preview."}
              </div>
            </div>
            {selectedEnv === "prod" && onSetProductionUrl && (
              <button
                type="button"
                onClick={onSetProductionUrl}
                data-testid="empty-set-prod-url"
                className="mt-2 inline-flex items-center gap-1.5 px-3 h-8 rounded-md font-mono text-[11px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white"
              >
                <Rocket className="h-3.5 w-3.5" /> Set Production URL
              </button>
            )}
            {selectedEnv === "dev" && onSetDevUrl && (
              <button
                type="button"
                onClick={onSetDevUrl}
                data-testid="empty-set-dev-url"
                className="mt-2 inline-flex items-center gap-1.5 px-3 h-8 rounded-md font-mono text-[11px] font-bold bg-gradient-to-r from-sky-500 to-indigo-500 text-white"
              >
                <Code2 className="h-3.5 w-3.5" /> Set Dev URL
              </button>
            )}
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

/** A single tab in the Dev/Production/PR-Preview env switcher.
 *  - `active`  highlights the tab and shows a colored bottom-border accent.
 *  - `missing` renders the tab in a muted "set me" state so the user knows
 *    the URL isn't configured yet.
 */
function EnvTab({
  icon,
  label,
  host,
  active,
  missing,
  onClick,
  tone,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  host: string;
  active: boolean;
  missing: boolean;
  onClick: () => void;
  tone: "sky" | "emerald" | "amber";
  testId: string;
}) {
  const accent =
    tone === "sky"
      ? "border-sky-400 text-sky-300"
      : tone === "emerald"
      ? "border-emerald-400 text-emerald-300"
      : "border-amber-400 text-amber-300";
  const dot =
    tone === "sky" ? "bg-sky-400" : tone === "emerald" ? "bg-emerald-400" : "bg-amber-400";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      className={
        "h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors shrink-0 border-b-2 " +
        (active
          ? `bg-background/70 ${accent}`
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40")
      }
      title={missing ? `${label} URL not set — click to configure` : `${label}: ${host}`}
    >
      <span className={active ? "" : "opacity-70"}>{icon}</span>
      <span className="font-mono text-[11px] uppercase tracking-wider">{label}</span>
      {missing ? (
        <span className="font-mono text-[10px] text-muted-foreground/70 italic">set</span>
      ) : (
        <>
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          <span className="font-mono text-[10.5px] text-foreground/70 max-w-[140px] truncate hidden md:inline">
            {host}
          </span>
        </>
      )}
    </button>
  );
}
