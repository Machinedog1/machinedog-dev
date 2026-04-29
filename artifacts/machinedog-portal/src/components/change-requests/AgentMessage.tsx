import { useState } from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Send,
  Undo2,
  Mail,
  Rocket,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import type {
  ChangeRequest,
  ChangeRequestEvent,
} from "@workspace/api-client-react";

type ChangeRequestStatus = ChangeRequest["status"];

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

function relTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return format(new Date(d), "h:mm a");
  } catch {
    return "";
  }
}

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
    <div className="flex justify-end gap-3">
      <div className="flex flex-col items-end max-w-[80%]">
        <div className="text-[10px] font-mono text-muted-foreground mb-1">
          {email ?? "you"} • {relTime(createdAt)}
        </div>
        <div className="bg-primary/10 ring-1 ring-primary/20 rounded-2xl rounded-tr-sm px-4 py-3 text-sm whitespace-pre-wrap">
          {text}
        </div>
      </div>
      <div className="h-8 w-8 rounded-full bg-primary/20 ring-1 ring-primary/30 flex items-center justify-center text-xs font-mono text-primary shrink-0">
        {initials}
      </div>
    </div>
  );
}

function AgentBubble({
  children,
  tone = "default",
  timeLabel,
}: {
  children: React.ReactNode;
  tone?: "default" | "working" | "success" | "error";
  timeLabel?: string;
}) {
  const toneClasses =
    tone === "error"
      ? "bg-red-500/5 ring-red-500/30"
      : tone === "success"
      ? "bg-emerald-500/5 ring-emerald-500/30"
      : tone === "working"
      ? "bg-blue-500/5 ring-blue-500/30"
      : "bg-muted/30 ring-border/30";
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-xs font-mono text-primary-foreground shrink-0 ring-1 ring-primary/40">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex flex-col max-w-[80%] flex-1 min-w-0">
        <div className="text-[10px] font-mono text-muted-foreground mb-1">
          MACHINEDOG AGENT{timeLabel ? ` • ${timeLabel}` : ""}
        </div>
        <div
          className={`rounded-2xl rounded-tl-sm px-4 py-3 text-sm ring-1 ${toneClasses} space-y-3`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function StatusMessage({
  text,
  tone,
  createdAt,
}: {
  text: string;
  tone: "default" | "working" | "success" | "error";
  createdAt: Date | string;
}) {
  const Icon =
    tone === "working"
      ? Loader2
      : tone === "success"
      ? CheckCircle2
      : tone === "error"
      ? AlertTriangle
      : Sparkles;
  return (
    <AgentBubble tone={tone} timeLabel={relTime(createdAt)}>
      <div className="flex items-start gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 mt-0.5 ${
            tone === "working" ? "animate-spin text-blue-300" : ""
          } ${tone === "success" ? "text-emerald-300" : ""} ${
            tone === "error" ? "text-red-300" : ""
          }`}
        />
        <div className="text-foreground">{text}</div>
      </div>
    </AgentBubble>
  );
}

export function PlanCard({ spec }: { spec: DistilledSpec }) {
  const [open, setOpen] = useState(false);
  const fileCount = spec.files?.length ?? 0;
  const acCount = spec.acceptanceCriteria?.length ?? 0;
  return (
    <div className="rounded-lg ring-1 ring-border/40 bg-background/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono"
      >
        <span className="flex items-center gap-2 text-foreground">
          <FileCode2 className="h-3.5 w-3.5" />
          PLAN — {fileCount} file(s){acCount ? ` • ${acCount} acceptance criteria` : ""}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="border-t border-border/30 p-3 space-y-3 text-xs">
          {spec.intent && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Intent
              </div>
              <div className="text-foreground">{spec.intent}</div>
            </div>
          )}
          {!!spec.files?.length && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Files to touch
              </div>
              <ul className="space-y-1">
                {spec.files.map((f, i) => (
                  <li key={i} className="font-mono">
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
              <ul className="list-disc list-inside space-y-0.5">
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
    <div className="rounded-lg ring-1 ring-border/40 bg-background/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono"
      >
        <span className="flex items-center gap-2 text-foreground">
          <FileCode2 className="h-3.5 w-3.5" />
          CODE CHANGES — {files.length} file(s)
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="border-t border-border/30 p-3 space-y-2 text-xs">
          {summary && (
            <div className="text-foreground italic mb-2">{summary}</div>
          )}
          {files.map((f, i) => (
            <div key={i} className="rounded ring-1 ring-border/40 bg-background/60">
              <button
                onClick={() => setOpenFile(openFile === i ? null : i)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-left"
              >
                <span className="font-mono text-primary truncate">{f.path}</span>
                {openFile === i ? (
                  <ChevronUp className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                )}
              </button>
              {openFile === i && (
                <pre className="border-t border-border/30 p-2 overflow-x-auto text-[11px] font-mono whitespace-pre bg-black/30 rounded-b">
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

export function eventTone(kind: ChangeRequestEvent["kind"]): "default" | "working" | "success" | "error" {
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
