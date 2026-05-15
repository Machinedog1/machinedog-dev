import { useMemo, useState } from "react";
import {
  useListAdminOrganizations,
  useSetAdminOrganizationStatus,
  useSetAdminOrganizationPlan,
  useSetAdminOrganizationCompliance,
  useAdjustClientBalance,
  getListAdminOrganizationsQueryKey,
  getGetAdminMetricsQueryKey,
  type ListAdminOrganizationsParams,
  type AdminOrganization,
  type SetOrgPlanBodyPlanType,
  type SetOrgComplianceBodyBaaStatus,
  type SetOrgComplianceBodyHipaaDeploymentStatus,
  type ListAdminOrganizationsStatus,
  type ListAdminOrganizationsPlanType,
  type SetOrgPlanResponse,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Building2, Search, Pause, Play, Settings2, Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";
import { format } from "date-fns";

const PLAN_TYPES = [
  "free",
  "starter",
  "pro",
  "business",
  "team",
  "enterprise",
  "healthcare",
] as const;
const STATUSES = ["active", "suspended", "invited"] as const;
const BAA_STATUSES = ["not_required", "required", "pending", "active", "expired"] as const;
const HIPAA_STATUSES = ["not_required", "required", "pending", "approved", "revoked"] as const;
const PAGE_SIZE = 25;

type OrgRow = AdminOrganization;

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "error" in err) {
    const e = (err as { error?: unknown }).error;
    if (typeof e === "string") return e;
  }
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export default function AdminOrganizationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);

  const params: ListAdminOrganizationsParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      search: search.trim() || undefined,
      status:
        statusFilter === "all"
          ? undefined
          : (statusFilter as ListAdminOrganizationsStatus),
      planType:
        planFilter === "all"
          ? undefined
          : (planFilter as ListAdminOrganizationsPlanType),
    }),
    [search, statusFilter, planFilter, offset],
  );

  const { data, isLoading } = useListAdminOrganizations(params, {
    query: { queryKey: getListAdminOrganizationsQueryKey(params) },
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const setStatus = useSetAdminOrganizationStatus();
  const setPlan = useSetAdminOrganizationPlan();
  const setCompliance = useSetAdminOrganizationCompliance();

  const [statusTarget, setStatusTarget] = useState<OrgRow | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [planTarget, setPlanTarget] = useState<OrgRow | null>(null);
  const [planValue, setPlanValue] = useState<SetOrgPlanBodyPlanType>("starter");
  const [planReason, setPlanReason] = useState("");
  const [complianceTarget, setComplianceTarget] = useState<OrgRow | null>(null);
  const [baaStatus, setBaaStatus] =
    useState<SetOrgComplianceBodyBaaStatus>("not_required");
  const [hipaaStatus, setHipaaStatus] =
    useState<SetOrgComplianceBodyHipaaDeploymentStatus>("not_required");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [balanceTarget, setBalanceTarget] = useState<OrgRow | null>(null);
  const [balanceDelta, setBalanceDelta] = useState("");
  const [balanceReason, setBalanceReason] = useState("");
  const adjustBalance = useAdjustClientBalance();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminOrganizationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminMetricsQueryKey() });
  };

  const submitStatus = (next: "active" | "suspended") => {
    if (!statusTarget) return;
    setStatus.mutate(
      { id: statusTarget.id, data: { status: next, reason: statusReason || null } },
      {
        onSuccess: () => {
          toast({ title: "Organization updated", description: `${statusTarget.name} → ${next}` });
          refresh();
          setStatusTarget(null);
          setStatusReason("");
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Error", description: errorMessage(err) }),
      },
    );
  };

  const submitPlan = () => {
    if (!planTarget) return;
    setPlan.mutate(
      {
        id: planTarget.id,
        data: { planType: planValue, reason: planReason || null },
      },
      {
        onSuccess: (res: SetOrgPlanResponse) => {
          toast({
            title: "Plan updated",
            description: res?.warning ?? `${planTarget.name} now on ${planValue}`,
            variant: res?.warning ? "destructive" : undefined,
          });
          refresh();
          setPlanTarget(null);
          setPlanReason("");
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Error", description: errorMessage(err) }),
      },
    );
  };

  const submitBalance = () => {
    if (!balanceTarget) return;
    const delta = Number(balanceDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Enter a non-zero token delta (positive to grant, negative to deduct).",
      });
      return;
    }
    adjustBalance.mutate(
      {
        id: balanceTarget.id,
        data: { delta, reason: balanceReason || undefined },
      },
      {
        onSuccess: () => {
          toast({
            title: "Balance adjusted",
            description: `${balanceTarget.name}: ${delta > 0 ? "+" : ""}${delta.toLocaleString()} tokens`,
          });
          refresh();
          setBalanceTarget(null);
          setBalanceDelta("");
          setBalanceReason("");
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Error", description: errorMessage(err) }),
      },
    );
  };

  const submitCompliance = () => {
    if (!complianceTarget) return;
    setCompliance.mutate(
      {
        id: complianceTarget.id,
        data: {
          baaStatus,
          hipaaDeploymentStatus: hipaaStatus,
          mfaRequired,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Compliance updated", description: complianceTarget.name });
          refresh();
          setComplianceTarget(null);
        },
        onError: (err) =>
          toast({ variant: "destructive", title: "Error", description: errorMessage(err) }),
      },
    );
  };

  const columns: AdminTableColumn<OrgRow>[] = [
    {
      key: "name",
      header: "Org",
      cell: (o) => (
        <div className="flex flex-col">
          <span className="font-mono text-foreground">{o.name}</span>
          <span className="text-xs text-muted-foreground">{o.primaryEmail}</span>
        </div>
      ),
    },
    {
      key: "plan",
      header: "Plan",
      cell: (o) => <Badge variant="outline" className="font-mono uppercase">{o.planType}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      cell: (o) => (
        <Badge
          variant={o.status === "suspended" ? "destructive" : o.status === "active" ? "default" : "secondary"}
          className="font-mono uppercase"
        >
          {o.status}
        </Badge>
      ),
    },
    {
      key: "members",
      header: "Members",
      cell: (o) => <span className="font-mono">{o.memberCount}</span>,
    },
    {
      key: "projects",
      header: "Projects",
      cell: (o) => <span className="font-mono">{o.projectCount}</span>,
    },
    {
      key: "tokens",
      header: "Tokens",
      cell: (o) => <span className="font-mono">{o.tokenBalance.toLocaleString()}</span>,
    },
    {
      key: "baa",
      header: "BAA",
      cell: (o) => <span className="font-mono text-xs uppercase">{o.baaStatus}</span>,
    },
    {
      key: "created",
      header: "Created",
      cell: (o) => (
        <span className="font-mono text-xs text-muted-foreground">
          {format(new Date(o.createdAt), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (o) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBalanceTarget(o);
              setBalanceDelta("");
              setBalanceReason("");
            }}
            title="Adjust token balance"
          >
            <Coins className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPlanTarget(o);
              setPlanValue(o.planType as SetOrgPlanBodyPlanType);
            }}
            title="Change plan"
          >
            <Settings2 className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setComplianceTarget(o);
              setBaaStatus(o.baaStatus as SetOrgComplianceBodyBaaStatus);
              setHipaaStatus(
                o.hipaaDeploymentStatus as SetOrgComplianceBodyHipaaDeploymentStatus,
              );
              setMfaRequired(Boolean(o.mfaRequired));
            }}
            title="Compliance"
          >
            <ShieldAlert className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant={o.status === "suspended" ? "outline" : "destructive"}
            onClick={() => setStatusTarget(o)}
            title={o.status === "suspended" ? "Reactivate" : "Suspend"}
          >
            {o.status === "suspended" ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
        </div>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" /> ORGANIZATIONS
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Suspend, change plans, and update compliance posture across every workspace.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
          <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setOffset(0); }}>
          <SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {PLAN_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <AdminTable
        columns={columns}
        rows={data?.data}
        total={data?.total}
        isLoading={isLoading}
        limit={PAGE_SIZE}
        offset={offset}
        onPageChange={setOffset}
        rowKey={(o) => o.id}
        emptyMessage="NO_ORGANIZATIONS"
      />

      <Dialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.status === "suspended" ? "Reactivate" : "Suspend"} {statusTarget?.name}
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.status === "suspended"
                ? "Restore access to AI prompts, builds, and deploys."
                : "Suspending immediately blocks new prompts, builds, and deploys for everyone in the org."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (logged in audit)</Label>
            <Input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>Cancel</Button>
            <Button
              variant={statusTarget?.status === "suspended" ? "default" : "destructive"}
              onClick={() => submitStatus(statusTarget?.status === "suspended" ? "active" : "suspended")}
              disabled={setStatus.isPending}
            >
              {statusTarget?.status === "suspended" ? "Reactivate" : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!planTarget} onOpenChange={(o) => !o && setPlanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan — {planTarget?.name}</DialogTitle>
            <DialogDescription>
              Updates the workspace plan tier. Stripe billing is not modified; cancel and re-checkout
              the subscription separately if you want billing to follow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select
                value={planValue}
                onValueChange={(v) => setPlanValue(v as SetOrgPlanBodyPlanType)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={planReason} onChange={(e) => setPlanReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanTarget(null)}>Cancel</Button>
            <Button onClick={submitPlan} disabled={setPlan.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!balanceTarget} onOpenChange={(o) => !o && setBalanceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust token balance — {balanceTarget?.name}</DialogTitle>
            <DialogDescription>
              Routed through the canonical token service: writes a `tokens_adjusted` audit event
              and a ledger row, and prevents the balance from going negative. Current balance:{" "}
              <span className="font-mono">{balanceTarget?.tokenBalance.toLocaleString()}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Delta (positive grants, negative deducts)</Label>
              <Input
                type="number"
                value={balanceDelta}
                onChange={(e) => setBalanceDelta(e.target.value)}
                placeholder="e.g. 50000 or -10000"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason (logged in audit)</Label>
              <Input
                value={balanceReason}
                onChange={(e) => setBalanceReason(e.target.value)}
                placeholder="e.g. enterprise top-up"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBalanceTarget(null)}>Cancel</Button>
            <Button onClick={submitBalance} disabled={adjustBalance.isPending}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!complianceTarget} onOpenChange={(o) => !o && setComplianceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compliance — {complianceTarget?.name}</DialogTitle>
            <DialogDescription>
              Records a compliance audit event. Phase 8 enforces these flags on PHI workloads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>BAA status</Label>
              <Select
                value={baaStatus}
                onValueChange={(v) => setBaaStatus(v as SetOrgComplianceBodyBaaStatus)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BAA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>HIPAA deployment</Label>
              <Select
                value={hipaaStatus}
                onValueChange={(v) =>
                  setHipaaStatus(v as SetOrgComplianceBodyHipaaDeploymentStatus)
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HIPAA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2">
              <Checkbox checked={mfaRequired} onCheckedChange={(v) => setMfaRequired(Boolean(v))} />
              <span className="text-sm">Require MFA for all members</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setComplianceTarget(null)}>Cancel</Button>
            <Button onClick={submitCompliance} disabled={setCompliance.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
