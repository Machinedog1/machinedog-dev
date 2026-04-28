import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjectChangeRequests,
  useCreateChangeRequest,
  useGetChangeRequest,
  useDistillChangeRequest,
  useGenerateChangePatch,
  useRequestChangePublish,
  useMarkChangeDeployed,
  useRollbackChangeRequest,
  getListProjectChangeRequestsQueryKey,
  getGetChangeRequestQueryKey,
  type ChangeRequest,
  type ChangeRequestDetail,
  type ChangeRequestEvent,
} from "@workspace/api-client-react";
import {
  Loader2,
  GitPullRequest,
  Send,
  Sparkles,
  FileCode2,
  CheckCircle2,
  Undo2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type ChangeRequestSummary = ChangeRequest;
type ChangeRequestStatus = ChangeRequest["status"];

const STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  draft: "Draft",
  distilling: "Distilling…",
  distilled: "Spec ready",
  generating_patch: "Generating patch…",
  patched: "Patch ready",
  snapshot_taken: "Snapshot taken",
  pr_open: "PR open",
  awaiting_publish: "Awaiting publish",
  merged: "Merged",
  awaiting_deploy: "Awaiting deploy",
  deployed: "Deployed",
  rolled_back: "Rolled back",
  failed: "Failed",
};

const STATUS_COLORS: Record<ChangeRequestStatus, string> = {
  draft: "bg-muted text-foreground",
  distilling: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  distilled: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  generating_patch: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  patched: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  snapshot_taken: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  pr_open: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  awaiting_publish: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  merged: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  awaiting_deploy: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  deployed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rolled_back: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
};

function StatusBadge({ status }: { status: ChangeRequestStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "data" in err) {
    const d = (err as { data?: { error?: { message?: string } | string } }).data;
    if (typeof d?.error === "string") return d.error;
    if (d?.error && typeof d.error === "object" && d.error.message) {
      return d.error.message;
    }
  }
  return fallback;
}

export function ProjectChangeRequestsPanel({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftRequest, setDraftRequest] = useState("");

  const listQuery = useListProjectChangeRequests(projectId, {
    query: {
      queryKey: getListProjectChangeRequestsQueryKey(projectId),
      enabled: Number.isFinite(projectId),
    },
  });
  const create = useCreateChangeRequest();

  const items = listQuery.data?.data ?? [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftRequest.trim();
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount < 6) {
      toast({
        title: "Tell us a bit more",
        description: "Describe the change in more than five words so Claude has enough to work with.",
        variant: "destructive",
      });
      return;
    }
    create.mutate(
      {
        id: projectId,
        data: {
          title: draftTitle.trim() || undefined,
          rawRequest: trimmed,
        },
      },
      {
        onSuccess: (created) => {
          setDraftTitle("");
          setDraftRequest("");
          setExpandedId(created.id);
          queryClient.invalidateQueries({
            queryKey: getListProjectChangeRequestsQueryKey(projectId),
          });
        },
        onError: (err) =>
          toast({
            title: "Could not submit",
            description: errorMessage(err, "Try again in a moment."),
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="glass rounded-2xl p-6 sm:p-8 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <GitPullRequest className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-mono font-bold uppercase tracking-wider">
          Change requests
        </h2>
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <Input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="Optional short title (we'll generate one if blank)"
          maxLength={200}
        />
        <Textarea
          value={draftRequest}
          onChange={(e) => setDraftRequest(e.target.value)}
          placeholder="Describe what you want to change. Plain English. We turn it into a spec, code, and a PR."
          rows={4}
          className="resize-y"
          minLength={4}
          maxLength={8000}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={create.isPending} className="font-mono">
            {create.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-2" /> SUBMITTING…
              </>
            ) : (
              <>
                <Send className="h-3 w-3 mr-2" /> REQUEST CHANGE
              </>
            )}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        {listQuery.isLoading ? (
          <p className="text-xs font-mono text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground">
            No change requests yet. Submit one above to get started.
          </p>
        ) : (
          items.map((item) => (
            <ChangeRequestRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() =>
                setExpandedId((current) => (current === item.id ? null : item.id))
              }
              projectId={projectId}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChangeRequestRow({
  item,
  expanded,
  onToggle,
  projectId,
}: {
  item: ChangeRequestSummary;
  expanded: boolean;
  onToggle: () => void;
  projectId: number;
}) {
  return (
    <div className="rounded-xl glass-subtle overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition"
      >
        <div className="flex flex-col items-start min-w-0 gap-1">
          <span className="text-sm font-medium truncate text-left">
            {item.title || "Untitled change"}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {item.requesterEmail ?? `client #${item.requesterClientId}`} ·{" "}
            {format(new Date(item.createdAt), "MMM d, HH:mm")}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={item.status} />
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/5 p-4">
          <ChangeRequestDetail changeRequestId={item.id} projectId={projectId} />
        </div>
      )}
    </div>
  );
}

function ChangeRequestDetail({
  changeRequestId,
  projectId,
}: {
  changeRequestId: number;
  projectId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const detailQuery = useGetChangeRequest(changeRequestId, {
    query: { queryKey: getGetChangeRequestQueryKey(changeRequestId) },
  });

  const distill = useDistillChangeRequest();
  const generate = useGenerateChangePatch();
  const requestPublish = useRequestChangePublish();
  const markDeployed = useMarkChangeDeployed();
  const rollback = useRollbackChangeRequest();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getGetChangeRequestQueryKey(changeRequestId),
    });
    queryClient.invalidateQueries({
      queryKey: getListProjectChangeRequestsQueryKey(projectId),
    });
  };

  const onError = (err: unknown, fallback: string) =>
    toast({
      title: "Action failed",
      description: errorMessage(err, fallback),
      variant: "destructive",
    });

  const runDistill = () =>
    distill.mutate(
      { id: changeRequestId },
      { onSuccess: invalidate, onError: (e) => onError(e, "Distill failed.") },
    );
  const runGenerate = () =>
    generate.mutate(
      { id: changeRequestId },
      { onSuccess: invalidate, onError: (e) => onError(e, "Patch generation failed.") },
    );
  const runRequestPublish = () =>
    requestPublish.mutate(
      { id: changeRequestId },
      { onSuccess: invalidate, onError: (e) => onError(e, "Publish request failed.") },
    );
  const runMarkDeployed = () =>
    markDeployed.mutate(
      { id: changeRequestId },
      { onSuccess: invalidate, onError: (e) => onError(e, "Could not mark deployed.") },
    );
  const runRollback = () =>
    rollback.mutate(
      { id: changeRequestId },
      { onSuccess: invalidate, onError: (e) => onError(e, "Rollback failed.") },
    );

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading detail…
      </div>
    );
  }

  const detail: ChangeRequestDetail = detailQuery.data;
  const cr = detail.changeRequest;
  const events = detail.events;
  const project = detail.project;

  const anyPending =
    distill.isPending ||
    generate.isPending ||
    requestPublish.isPending ||
    markDeployed.isPending ||
    rollback.isPending;

  return (
    <div className="flex flex-col gap-5">
      {cr.errorMessage && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-200">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{cr.errorMessage}</span>
        </div>
      )}

      <Section title="REQUEST">
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{cr.rawRequest}</p>
      </Section>

      {cr.distilledSpec && <SpecBlock spec={cr.distilledSpec} />}

      {cr.patchSummary && (
        <Section title="PATCH SUMMARY">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{cr.patchSummary}</p>
        </Section>
      )}

      {cr.patchFiles && cr.patchFiles.length > 0 && (
        <Section title={`PROPOSED FILES (${cr.patchFiles.length})`}>
          <div className="flex flex-col gap-3">
            {cr.patchFiles.map((file: Record<string, unknown>, idx: number) => (
              <FileCard key={idx} file={file} />
            ))}
          </div>
        </Section>
      )}

      {cr.previewUrl && (
        <Section title="LIVE PREVIEW">
          <div className="rounded-lg overflow-hidden border border-white/10 bg-black">
            <iframe
              src={isSafeHttpUrl(cr.previewUrl) ? cr.previewUrl : "about:blank"}
              title={`Preview ${cr.title}`}
              className="w-full h-[480px] bg-white"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
              referrerPolicy="no-referrer"
            />
          </div>
          <a
            href={cr.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-primary inline-flex items-center gap-1 mt-2"
          >
            Open in new tab <ExternalLink className="h-3 w-3" />
          </a>
        </Section>
      )}

      {cr.githubPrUrl && (
        <Section title="PULL REQUEST">
          <a
            href={cr.githubPrUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono text-primary inline-flex items-center gap-1"
          >
            #{cr.githubPrNumber} on GitHub <ExternalLink className="h-3 w-3" />
          </a>
        </Section>
      )}

      <Section title="TIMELINE">
        <div className="flex flex-col gap-2">
          {events.length === 0 ? (
            <p className="text-xs font-mono text-muted-foreground">No events yet.</p>
          ) : (
            events.map((evt: ChangeRequestEvent) => (
              <div
                key={evt.id}
                className="flex items-start gap-3 text-xs px-3 py-2 rounded-md bg-white/3"
              >
                <span className="font-mono uppercase tracking-wider text-muted-foreground shrink-0 w-32">
                  {evt.kind.replace(/_/g, " ")}
                </span>
                <span className="flex-1">{evt.message}</span>
                <span className="font-mono text-muted-foreground shrink-0">
                  {format(new Date(evt.createdAt), "MMM d, HH:mm")}
                </span>
              </div>
            ))
          )}
        </div>
      </Section>

      <ActionBar
        status={cr.status}
        githubConfigured={project.githubConfigured}
        anyPending={anyPending}
        pending={{
          distill: distill.isPending,
          generate: generate.isPending,
          publish: requestPublish.isPending,
          deployed: markDeployed.isPending,
          rollback: rollback.isPending,
        }}
        onDistill={runDistill}
        onGenerate={runGenerate}
        onRequestPublish={runRequestPublish}
        onMarkDeployed={runMarkDeployed}
        onRollback={runRollback}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function SpecBlock({ spec }: { spec: Record<string, unknown> }) {
  const intent = typeof spec.intent === "string" ? spec.intent : null;
  const files = Array.isArray(spec.files)
    ? (spec.files as Array<{ path?: string; why?: string }>)
    : [];
  const acceptance = Array.isArray(spec.acceptanceCriteria)
    ? (spec.acceptanceCriteria as string[])
    : [];
  const risks = Array.isArray(spec.risks) ? (spec.risks as string[]) : [];
  return (
    <Section title="DISTILLED SPEC">
      {intent && (
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{intent}</p>
      )}
      {files.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Files to touch
          </span>
          <ul className="text-xs font-mono space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex flex-col">
                <span className="text-primary">{f.path}</span>
                {f.why && <span className="text-muted-foreground">— {f.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {acceptance.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Acceptance
          </span>
          <ul className="text-xs list-disc list-inside space-y-0.5">
            {acceptance.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {risks.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Risks
          </span>
          <ul className="text-xs list-disc list-inside space-y-0.5 text-amber-200/90">
            {risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function FileCard({ file }: { file: Record<string, unknown> }) {
  const path = typeof file.path === "string" ? file.path : "(unknown)";
  const contents = typeof file.contents === "string" ? file.contents : "";
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-white/10 bg-black/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-white/5 transition"
      >
        <span className="font-mono text-xs text-primary truncate text-left">{path}</span>
        <div className="flex items-center gap-2 shrink-0">
          <FileCode2 className="h-3 w-3 text-muted-foreground" />
          {open ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <pre className="text-[11px] leading-relaxed font-mono p-3 overflow-x-auto whitespace-pre max-h-[480px] overflow-y-auto border-t border-white/5">
          {contents}
        </pre>
      )}
    </div>
  );
}

function ActionBar({
  status,
  githubConfigured,
  anyPending,
  pending,
  onDistill,
  onGenerate,
  onRequestPublish,
  onMarkDeployed,
  onRollback,
}: {
  status: ChangeRequestStatus;
  githubConfigured: boolean;
  anyPending: boolean;
  pending: {
    distill: boolean;
    generate: boolean;
    publish: boolean;
    deployed: boolean;
    rollback: boolean;
  };
  onDistill: () => void;
  onGenerate: () => void;
  onRequestPublish: () => void;
  onMarkDeployed: () => void;
  onRollback: () => void;
}) {
  const canDistill = status === "draft" || status === "distilled" || status === "failed";
  const canGenerate =
    status === "distilled" || status === "patched" || status === "failed";
  const canRequestPublish =
    status === "patched" ||
    status === "pr_open" ||
    status === "merged" ||
    status === "awaiting_publish";
  const canMarkDeployed = status === "awaiting_deploy" || status === "merged";
  const canRollback =
    status === "deployed" ||
    status === "awaiting_deploy" ||
    status === "merged";

  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canDistill || anyPending}
        onClick={onDistill}
        className="font-mono"
      >
        {pending.distill ? (
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
        ) : (
          <Sparkles className="h-3 w-3 mr-2" />
        )}
        DISTILL
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canGenerate || anyPending}
        onClick={onGenerate}
        className="font-mono"
      >
        {pending.generate ? (
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
        ) : (
          <FileCode2 className="h-3 w-3 mr-2" />
        )}
        GENERATE PATCH
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!canRequestPublish || anyPending}
        onClick={onRequestPublish}
        className="font-mono"
      >
        {pending.publish ? (
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
        ) : (
          <Send className="h-3 w-3 mr-2" />
        )}
        PUBLISH
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={!canMarkDeployed || anyPending}
        onClick={onMarkDeployed}
        className="font-mono"
      >
        {pending.deployed ? (
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
        ) : (
          <CheckCircle2 className="h-3 w-3 mr-2" />
        )}
        MARK DEPLOYED
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!canRollback || anyPending}
        onClick={onRollback}
        className="font-mono text-red-300"
      >
        {pending.rollback ? (
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
        ) : (
          <Undo2 className="h-3 w-3 mr-2" />
        )}
        ROLLBACK
      </Button>
      {!githubConfigured && (
        <p className="basis-full text-[10px] font-mono uppercase tracking-wider text-amber-300/80 mt-1">
          GitHub repo not yet wired up — Publish only emails the operator. The
          PR/preview integration arrives in the next release.
        </p>
      )}
    </div>
  );
}
