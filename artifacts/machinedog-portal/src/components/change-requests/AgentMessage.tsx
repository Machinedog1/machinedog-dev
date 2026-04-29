import { useState } from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Send,
  Undo2,
  Mail,
  Rocket,
  Wrench,
  Search,
  GitBranch,
  Hammer,
} from "lucide-react";
import { format, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import type {
  ChangeRequest,
  ChangeRequestEvent,
} from "@workspace/api-client-react";

type ChangeRequestStatus = ChangeRequest["status"];
type EventKind = ChangeRequestEvent["kind"];

interface DistilledFile {
  path: string;
  why: string;
}

interface DistilledSpec {
  title?: string;
  intent?: string;
  files?: DistilledFile[];
  acceptanceCriteria?: string[];
  risks?: string[];
}

interface PatchFile {
  path: string;
  contents: string;
}

const IN_PROGRESS_STATUSES: ChangeRequestStatus[] = [
  "draft",
  "distilling",
  "distilled",
  "generating_patch",
];

export function isInProgress(status: ChangeRequestStatus): boolean {
  return IN_PROGRESS_STATUSES.includes(status);
}

function timeLabel(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    const date = new Date(d);
    return isToday(date) ? format(date, "h:mm a") : format(date, "MMM d, h:mm a");
  } catch {
    return "";
  }
}

/* -------------------------------------------------------------------------- */
/* User message (right-aligned bubble)                                         */
/* -------------------------------------------------------------------------- */

export function UserMessage({
  email,
  text,
  createdAt,
}: {
  email: string | null;
  text: string;
  createdAt: Date | string;
}) {
  const initials = (email ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="flex justify-end gap-2.5 group">
      <div className="flex flex-col items-end max-w-[78%] min-w-0">
        <div className="text-[10px] font-mono text-muted-foreground/70 mb-1 px-1">
          {email ?? "you"} · {timeLabel(createdAt)}
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

/* -------------------------------------------------------------------------- */
/* Agent header — shown once per group of agent activity                       */
/* -------------------------------------------------------------------------- */

export function AgentHeader({ time }: { time?: Date | string | null }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-primary/60 ring-1 ring-primary/40 flex items-center justify-center shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
      </div>
      <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
        Machinedog Agent
      </span>
      {time && (
        <span className="text-[10px] font-mono text-muted-foreground/60">
          · {timeLabel(time)}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline tool-call style status row (Replit-flavored)                         */
/* -------------------------------------------------------------------------- */

function iconForKind(kind: EventKind | undefined) {
  switch (kind) {
    case "distill_started":
    case "distill_succeeded":
    case "distill_failed":
      return Search;
    case "patch_started":
    case "patch_succeeded":
    case "patch_failed":
      return Hammer;
    case "snapshot_created":
    case "branch_pushed":
    case "pr_opened":
    case "pr_merged":
      return GitBranch;
    case "deploy_marked":
      return Rocket;
    case "rolled_back":
      return Undo2;
    case "error":
      return AlertTriangle;
    default:
      return Wrench;
  }
}

export function StatusMessage({
  text,
  tone,
  createdAt,
  kind,
}: {
  text: string;
  tone: "default" | "working" | "success" | "error";
  createdAt: Date | string;
  kind?: EventKind;
}) {
  const Icon =
    tone === "working"
      ? Loader2
      : tone === "success"
      ? CheckCircle2
      : tone === "error"
      ? AlertTriangle
      : iconForKind(kind);

  const toneText =
    tone === "error"
      ? "text-red-300"
      : tone === "success"
      ? "text-emerald-300"
      : tone === "working"
      ? "text-blue-300"
      : "text-muted-foreground";

  const toneRing =
    tone === "error"
      ? "ring-red-500/20 bg-red-500/[0.04]"
      : tone === "success"
      ? "ring-emerald-500/20 bg-emerald-500/[0.04]"
      : tone === "working"
      ? "ring-blue-500/20 bg-blue-500/[0.04]"
      : "ring-border/30 bg-muted/[0.04]";

  return (
    <div className={`ml-8 flex items-start gap-2 rounded-md px-2.5 py-1.5 ring-1 ${toneRing}`}>
      <Icon
        className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${toneText} ${
          tone === "working" ? "animate-spin" : ""
        }`}
      />
      <div className="flex-1 min-w-0 text-[12.5px] leading-snug text-foreground/90">
        {text}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground/60 shrink-0 mt-0.5">
        {timeLabel(createdAt)}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Plan card — Replit-style collapsible action result                          */
/* -------------------------------------------------------------------------- */

export function PlanCard({ spec }: { spec: DistilledSpec }) {
  const [open, setOpen] = useState(false);
  const fileCount = spec.files?.length ?? 0;
  const acCount = spec.acceptanceCriteria?.length ?? 0;
  return (
    <div className="ml-8 rounded-md ring-1 ring-border/30 bg-muted/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/20 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <FileCode2 className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Plan
        </span>
        <span className="text-[12px] text-foreground/90 truncate">
          {spec.title ?? "Distilled spec"}
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/70 shrink-0">
          {fileCount} file{fileCount === 1 ? "" : "s"}
          {acCount ? ` · ${acCount} criteria` : ""}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/30 p-3 space-y-3 text-[12px]">
          {spec.intent && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Intent
              </div>
              <div className="text-foreground/90 leading-relaxed">{spec.intent}</div>
            </div>
          )}
          {!!spec.files?.length && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Files
              </div>
              <ul className="space-y-1">
                {spec.files.map((f, i) => (
                  <li key={i} className="font-mono text-[11.5px]">
                    <span className="text-primary">{f.path}</span>
                    <span className="text-muted-foreground"> — {f.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!spec.acceptanceCriteria?.length && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Acceptance criteria
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-foreground/90">
                {spec.acceptanceCriteria.map((ac, i) => (
                  <li key={i}>{ac}</li>
                ))}
              </ul>
            </div>
          )}
          {!!spec.risks?.length && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Risks
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                {spec.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Patch card — Replit-style file-list result                                  */
/* -------------------------------------------------------------------------- */

export function PatchCard({
  files,
  summary,
}: {
  files: PatchFile[];
  summary: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [openFile, setOpenFile] = useState<number | null>(null);
  return (
    <div className="ml-8 rounded-md ring-1 ring-border/30 bg-muted/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/20 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Hammer className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Edits
        </span>
        <span className="text-[12px] text-foreground/90 truncate">
          {summary ?? `${files.length} file${files.length === 1 ? "" : "s"} updated`}
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/70 shrink-0">
          {files.length} file{files.length === 1 ? "" : "s"}
        </span>
      </button>
      {open && (
        <div className="border-t border-border/30 p-2 space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="rounded ring-1 ring-border/30 bg-background/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenFile(openFile === i ? null : i)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/20 transition-colors"
              >
                {openFile === i ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <FileCode2 className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-mono text-[11.5px] text-primary truncate">
                  {f.path}
                </span>
              </button>
              {openFile === i && (
                <pre className="border-t border-border/30 p-2 overflow-x-auto text-[11px] font-mono whitespace-pre bg-black/40">
                  {f.contents}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline publish hint (full controls live on the Publish tab)                 */
/* -------------------------------------------------------------------------- */

export function InlinePublishHint({ status }: { status: ChangeRequestStatus }) {
  const text =
    status === "deployed"
      ? "Live in production."
      : status === "rolled_back"
      ? "Rolled back."
      : status === "awaiting_deploy" || status === "merged"
      ? "Operator notified — open the Publish tab to track or roll back."
      : "Ready to ship — open the Publish tab to review and publish.";
  const icon =
    status === "deployed" ? CheckCircle2 : status === "rolled_back" ? Undo2 : Rocket;
  const Icon = icon;
  const color =
    status === "deployed"
      ? "text-emerald-300 ring-emerald-500/30 bg-emerald-500/[0.06]"
      : status === "rolled_back"
      ? "text-muted-foreground ring-border/30 bg-muted/10"
      : "text-primary ring-primary/30 bg-primary/[0.06]";
  return (
    <div className={`ml-8 flex items-center gap-2 rounded-md px-2.5 py-1.5 ring-1 ${color}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-[12px] text-foreground/90">{text}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PublishCard (legacy big card — still exported, used elsewhere)              */
/* -------------------------------------------------------------------------- */

export function PublishCard({
  changeRequest,
  onPublish,
  onRollback,
  onMarkDeployed,
  publishPending,
  rollbackPending,
  markDeployedPending,
  noteCopy,
  canMarkDeployed,
}: {
  changeRequest: ChangeRequest;
  onPublish: () => void;
  onRollback: () => void;
  onMarkDeployed: () => void;
  publishPending: boolean;
  rollbackPending: boolean;
  markDeployedPending: boolean;
  noteCopy?: string | null;
  canMarkDeployed: boolean;
}) {
  const status = changeRequest.status;
  const canPublish =
    status === "patched" || status === "pr_open" || status === "merged" || status === "awaiting_publish";
  const canRollback =
    status === "deployed" || status === "awaiting_deploy" || status === "merged";
  const isAwaiting = status === "awaiting_deploy";
  const isDeployed = status === "deployed";
  const isRolledBack = status === "rolled_back";

  return (
    <div className="rounded-lg ring-1 ring-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
        <Rocket className="h-3.5 w-3.5" />
        Ready to ship
      </div>
      {canPublish && (
        <>
          <div className="text-xs text-muted-foreground">
            Click Publish to lock this change in. The operator will get an email and roll it out.
          </div>
          {noteCopy && (
            <div className="rounded bg-amber-500/10 ring-1 ring-amber-500/30 px-2 py-1.5 text-[11px] text-amber-200/90">
              <span className="font-mono uppercase tracking-wider mr-1">Note:</span>
              {noteCopy}
            </div>
          )}
          <Button
            onClick={onPublish}
            disabled={publishPending}
            className="w-full font-mono bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
          >
            {publishPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            {publishPending ? "PUBLISHING…" : "PUBLISH"}
          </Button>
        </>
      )}
      {isAwaiting && (
        <div className="text-xs text-amber-200">
          <Mail className="h-3 w-3 inline mr-1" />
          Operator notified. Waiting for deploy.
        </div>
      )}
      {isDeployed && (
        <div className="text-xs text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Live in production.
        </div>
      )}
      {isRolledBack && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Undo2 className="h-3.5 w-3.5" />
          Rolled back.
        </div>
      )}
      {canMarkDeployed && (status === "awaiting_deploy" || status === "merged") && (
        <Button
          variant="outline"
          onClick={onMarkDeployed}
          disabled={markDeployedPending}
          className="w-full font-mono text-xs h-8 ring-1 ring-emerald-500/30 hover:bg-emerald-500/10"
        >
          {markDeployedPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <CheckCircle2 className="h-3 w-3 mr-1" />
          )}
          {markDeployedPending ? "MARKING…" : "MARK DEPLOYED (OPERATOR)"}
        </Button>
      )}
      {canRollback && !isRolledBack && (
        <Button
          variant="outline"
          onClick={onRollback}
          disabled={rollbackPending}
          className="w-full font-mono text-xs h-8"
        >
          {rollbackPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Undo2 className="h-3 w-3 mr-1" />}
          {rollbackPending ? "ROLLING BACK…" : "ROLLBACK"}
        </Button>
      )}
    </div>
  );
}

export function eventTone(kind: EventKind): "default" | "working" | "success" | "error" {
  switch (kind) {
    case "distill_started":
    case "patch_started":
      return "working";
    case "distill_succeeded":
    case "patch_succeeded":
    case "deploy_marked":
    case "pr_merged":
    case "rolled_back":
      return "success";
    case "distill_failed":
    case "patch_failed":
    case "error":
      return "error";
    default:
      return "default";
  }
}
