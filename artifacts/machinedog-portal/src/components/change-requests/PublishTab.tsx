import { Rocket, FileCode2, Sparkles } from "lucide-react";
import type { ChangeRequest } from "@workspace/api-client-react";
import { PublishCard } from "./AgentMessage";

interface PatchFile {
  path: string;
  contents: string;
}

const ACTIONABLE_STATUSES: ChangeRequest["status"][] = [
  "patched",
  "awaiting_publish",
  "pr_open",
  "merged",
  "awaiting_deploy",
];

export function PublishTab({
  items,
  onPublish,
  onRollback,
  onMarkDeployed,
  publishPendingId,
  rollbackPendingId,
  markDeployedPendingId,
  canMarkDeployed,
  noteCopy,
}: {
  items: { changeRequest: ChangeRequest }[];
  onPublish: (id: number) => void;
  onRollback: (id: number) => void;
  onMarkDeployed: (id: number) => void;
  publishPendingId: number | null;
  rollbackPendingId: number | null;
  markDeployedPendingId: number | null;
  canMarkDeployed: boolean;
  noteCopy?: string | null;
}) {
  // Find the most recent actionable CR — that's what the user means to publish.
  const actionable = [...items]
    .reverse()
    .find((it) => ACTIONABLE_STATUSES.includes(it.changeRequest.status));

  const recentDeployed = [...items]
    .reverse()
    .filter((it) =>
      ["deployed", "rolled_back"].includes(it.changeRequest.status),
    )
    .slice(0, 5);

  if (!actionable && recentDeployed.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-3">
        <Rocket className="h-8 w-8 text-primary/40" />
        <div className="text-sm">Nothing to publish yet.</div>
        <div className="text-xs max-w-sm">
          Send a change request in the chat. Once the agent drafts it, the
          Publish controls show up here.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {actionable && (
        <PublishableCard
          cr={actionable.changeRequest}
          onPublish={() => onPublish(actionable.changeRequest.id)}
          onRollback={() => onRollback(actionable.changeRequest.id)}
          onMarkDeployed={() => onMarkDeployed(actionable.changeRequest.id)}
          publishPending={publishPendingId === actionable.changeRequest.id}
          rollbackPending={rollbackPendingId === actionable.changeRequest.id}
          markDeployedPending={
            markDeployedPendingId === actionable.changeRequest.id
          }
          canMarkDeployed={canMarkDeployed}
          noteCopy={noteCopy}
        />
      )}

      {recentDeployed.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-1">
            Recent deploys
          </div>
          {recentDeployed.map(({ changeRequest: cr }) => (
            <div
              key={cr.id}
              className="rounded-lg ring-1 ring-border/30 bg-muted/20 px-3 py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-foreground truncate">
                  {cr.title}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  {cr.status === "deployed" ? "DEPLOYED" : "ROLLED BACK"}
                  {cr.deployedAt
                    ? ` • ${new Date(cr.deployedAt).toLocaleString()}`
                    : cr.rolledBackAt
                    ? ` • ${new Date(cr.rolledBackAt).toLocaleString()}`
                    : ""}
                </div>
              </div>
              {canMarkDeployed && cr.status === "deployed" && (
                <button
                  onClick={() => onRollback(cr.id)}
                  className="text-[10px] font-mono text-muted-foreground hover:text-foreground"
                >
                  ROLLBACK
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PublishableCard({
  cr,
  onPublish,
  onRollback,
  onMarkDeployed,
  publishPending,
  rollbackPending,
  markDeployedPending,
  canMarkDeployed,
  noteCopy,
}: {
  cr: ChangeRequest;
  onPublish: () => void;
  onRollback: () => void;
  onMarkDeployed: () => void;
  publishPending: boolean;
  rollbackPending: boolean;
  markDeployedPending: boolean;
  canMarkDeployed: boolean;
  noteCopy?: string | null;
}) {
  const distilledSpec = cr.distilledSpec as
    | {
        intent?: string;
        files?: { path: string; why: string }[];
        acceptanceCriteria?: string[];
      }
    | null;
  const patchFiles = (cr.patchFiles ?? []) as unknown as PatchFile[];

  return (
    <div className="space-y-4">
      {/* Title + status */}
      <div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-primary mb-1">
          <Sparkles className="h-3 w-3" />
          Up next to publish
        </div>
        <div className="text-base font-bold text-foreground leading-tight">
          {cr.title}
        </div>
        {distilledSpec?.intent && (
          <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {distilledSpec.intent}
          </div>
        )}
      </div>

      {/* File summary */}
      {patchFiles.length > 0 && (
        <div className="rounded-lg ring-1 ring-border/40 bg-background/40 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <FileCode2 className="h-3 w-3" />
            {patchFiles.length} file change{patchFiles.length === 1 ? "" : "s"}
          </div>
          <ul className="space-y-1 text-xs font-mono">
            {patchFiles.map((f, i) => (
              <li key={i} className="text-primary truncate">
                {f.path}
              </li>
            ))}
          </ul>
          {cr.patchSummary && (
            <div className="text-xs text-muted-foreground italic pt-1 border-t border-border/30">
              {cr.patchSummary}
            </div>
          )}
        </div>
      )}

      {/* Acceptance criteria */}
      {!!distilledSpec?.acceptanceCriteria?.length && (
        <div className="rounded-lg ring-1 ring-border/40 bg-background/40 p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
            Acceptance criteria
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs">
            {distilledSpec.acceptanceCriteria.map((ac, i) => (
              <li key={i}>{ac}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Publish controls (reuse the inline card) */}
      <PublishCard
        changeRequest={cr}
        onPublish={onPublish}
        onRollback={onRollback}
        onMarkDeployed={onMarkDeployed}
        publishPending={publishPending}
        rollbackPending={rollbackPending}
        markDeployedPending={markDeployedPending}
        canMarkDeployed={canMarkDeployed}
        noteCopy={noteCopy}
      />
    </div>
  );
}
