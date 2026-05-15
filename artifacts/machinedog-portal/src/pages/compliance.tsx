import { useState } from "react";
import {
  useGetMyComplianceProfile,
  useUpdateMyComplianceProfile,
  useRequestComplianceReview,
  getGetMyComplianceProfileQueryKey,
  type MyComplianceProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const STATUSES = [
  "not_started",
  "in_progress",
  "approved",
  "needs_attention",
] as const;
type ItemStatus = (typeof STATUSES)[number];

function StatusBadge({ status }: { status: ItemStatus }) {
  const variant =
    status === "approved"
      ? "default"
      : status === "needs_attention"
        ? "destructive"
        : "secondary";
  return (
    <Badge variant={variant} className="font-mono uppercase">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function PreconditionRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border/30">
      <div className="flex items-center gap-2 min-w-0">
        {ok ? (
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
        )}
        <span className="font-mono text-sm truncate">{label}</span>
      </div>
      <Badge variant={ok ? "default" : "secondary"} className="font-mono uppercase">
        {value}
      </Badge>
    </div>
  );
}

export default function CompliancePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetMyComplianceProfile({
    query: { queryKey: getGetMyComplianceProfileQueryKey() },
  });
  const updateMut = useUpdateMyComplianceProfile({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetMyComplianceProfileQueryKey() });
        toast({ title: "Compliance posture updated." });
      },
      onError: (e) => toast({ title: "Update failed", description: String(e), variant: "destructive" }),
    },
  });
  const reviewMut = useRequestComplianceReview({
    mutation: {
      onSuccess: () => toast({ title: "Review requested. Our compliance team will reach out." }),
      onError: (e) => toast({ title: "Request failed", description: String(e), variant: "destructive" }),
    },
  });
  const [reviewMsg, setReviewMsg] = useState("");

  if (isLoading || !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const p: MyComplianceProfile = data;

  const setStatus = (
    field:
      | "riskAnalysisStatus"
      | "incidentResponseStatus"
      | "backupPolicyStatus"
      | "dataRetentionPolicyStatus",
    value: ItemStatus,
  ) => {
    updateMut.mutate({ data: { [field]: value } });
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> COMPLIANCE
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Healthcare/PHI readiness for your organization. Server-gated; toggling PHI mode on a project
          is locked until every precondition below is approved.
        </p>
      </header>

      {/* Standardized warning copy — verbatim from compliance-warnings.ts. */}
      <div
        role="alert"
        className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 flex gap-3"
      >
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-sm font-mono leading-relaxed">{p.warningCopy}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-base flex items-center justify-between gap-3">
            <span>PHI Mode Status</span>
            <Badge
              variant={p.phiModeUnlocked ? "default" : "secondary"}
              className="font-mono uppercase"
            >
              {p.phiModeUnlocked ? "Unlocked" : "Locked"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <PreconditionRow
            label="Plan: healthcare or enterprise"
            ok={p.planType === "healthcare" || p.planType === "enterprise"}
            value={p.planType}
          />
          <PreconditionRow
            label="Signed BAA active"
            ok={p.baaStatus === "active"}
            value={p.baaStatus}
          />
          <PreconditionRow
            label="HIPAA deployment approved"
            ok={p.hipaaDeploymentStatus === "approved"}
            value={p.hipaaDeploymentStatus}
          />
          <PreconditionRow
            label="MFA enforcement"
            ok={p.mfaRequired}
            value={p.mfaRequired ? "required" : "off"}
          />
          <PreconditionRow
            label="Audit logging enabled"
            ok={p.auditLoggingEnabled}
            value={p.auditLoggingEnabled ? "on" : "off"}
          />
          <PreconditionRow
            label="Audit retention required"
            ok={p.auditRequired}
            value={p.auditRequired ? "required" : "off"}
          />
          <PreconditionRow
            label="HIPAA deployment required"
            ok={p.hipaaDeploymentRequired}
            value={p.hipaaDeploymentRequired ? "required" : "off"}
          />
          <PreconditionRow
            label="AWS HIPAA environment"
            ok={p.awsHipaaEnvironmentStatus === "active"}
            value={p.awsHipaaEnvironmentStatus}
          />
          {!p.phiModeUnlocked && p.failedPreconditions.length > 0 && (
            <ul className="text-xs font-mono text-muted-foreground list-disc pl-5 mt-2 space-y-1">
              {p.failedPreconditions.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-base">Operational Checklist</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(
            [
              ["riskAnalysisStatus", "Risk analysis"],
              ["incidentResponseStatus", "Incident response plan"],
              ["backupPolicyStatus", "Backup policy"],
              ["dataRetentionPolicyStatus", "Data retention policy"],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-sm">{label}</span>
                <StatusBadge status={p[field]} />
              </div>
              <Select
                value={p[field]}
                onValueChange={(v) => setStatus(field, v as ItemStatus)}
                disabled={updateMut.isPending}
              >
                <SelectTrigger className="w-48 font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono text-xs">
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border/30 pt-4">
            <span className="font-mono text-sm">Audit logging</span>
            <Switch
              checked={p.auditLoggingEnabled}
              disabled={updateMut.isPending}
              onCheckedChange={(checked) =>
                updateMut.mutate({ data: { auditLoggingEnabled: checked } })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-base">Request Compliance Review</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground font-mono">
            Once your checklist is in order, request operator review to enable PHI mode. We will
            verify your BAA, HIPAA-deployment environment, and MFA enforcement before unlocking.
          </p>
          <Textarea
            value={reviewMsg}
            onChange={(e) => setReviewMsg(e.target.value)}
            placeholder="Optional — anything we should know before reviewing?"
            className="font-mono text-sm"
            rows={3}
          />
          <Button
            onClick={() => reviewMut.mutate({ data: { message: reviewMsg || null } })}
            disabled={reviewMut.isPending}
            className="self-start"
          >
            {reviewMut.isPending ? "Submitting…" : "Request review"}
          </Button>
          {p.lastReviewedAt && (
            <p className="text-xs font-mono text-muted-foreground">
              Last reviewed {new Date(p.lastReviewedAt).toLocaleString()}{" "}
              {p.lastReviewedByEmail ? `by ${p.lastReviewedByEmail}` : ""}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
