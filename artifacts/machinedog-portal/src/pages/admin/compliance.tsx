import { useMemo, useState } from "react";
import {
  useListAdminCompliance,
  getListAdminComplianceQueryKey,
  type ListAdminComplianceParams,
  type AdminOrganization,
} from "@workspace/api-client-react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";
import { format } from "date-fns";

const BAA_STATUSES = ["not_required", "required", "pending", "active", "expired"] as const;
const HIPAA_STATUSES = ["not_required", "required", "pending", "approved", "revoked"] as const;
const PAGE_SIZE = 50;

type Row = AdminOrganization;

export default function AdminCompliancePage() {
  const [baa, setBaa] = useState<string>("all");
  const [hipaa, setHipaa] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Row | null>(null);

  const params: ListAdminComplianceParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      baaStatus: baa === "all" ? undefined : (baa as "active"),
      hipaaDeploymentStatus: hipaa === "all" ? undefined : (hipaa as "approved"),
    }),
    [baa, hipaa, offset],
  );
  const { data, isLoading } = useListAdminCompliance(params, {
    query: { queryKey: getListAdminComplianceQueryKey(params) },
  });

  const columns: AdminTableColumn<Row>[] = [
    {
      key: "name",
      header: "Org",
      cell: (o) => (
        <div className="flex flex-col">
          <span className="font-mono">{o.name}</span>
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
      key: "baa",
      header: "BAA",
      cell: (o) => (
        <Badge
          variant={o.baaStatus === "active" ? "default" : o.baaStatus === "expired" ? "destructive" : "secondary"}
          className="font-mono uppercase"
        >
          {o.baaStatus}
        </Badge>
      ),
    },
    {
      key: "hipaa",
      header: "HIPAA Deploy",
      cell: (o) => (
        <Badge
          variant={o.hipaaDeploymentStatus === "approved" ? "default" : "secondary"}
          className="font-mono uppercase"
        >
          {o.hipaaDeploymentStatus}
        </Badge>
      ),
    },
    {
      key: "mfa",
      header: "MFA",
      cell: (o) => (
        <span className="font-mono text-xs">{o.mfaRequired ? "REQUIRED" : "—"}</span>
      ),
    },
    {
      key: "members",
      header: "Members",
      cell: (o) => <span className="font-mono">{o.memberCount}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      cell: (o) => (
        <span className="font-mono text-xs text-muted-foreground">
          {format(new Date(o.updatedAt), "MMM d, yyyy")}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> COMPLIANCE
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          BAA, HIPAA deployment posture, and MFA enforcement across orgs. Manage from the
          Organizations page.
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <Select value={baa} onValueChange={(v) => { setBaa(v); setOffset(0); }}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All BAA states</SelectItem>
            {BAA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={hipaa} onValueChange={(v) => { setHipaa(v); setOffset(0); }}>
          <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All HIPAA states</SelectItem>
            {HIPAA_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
        onRowClick={(o) => setDetail(o)}
        emptyMessage="NO_ORGANIZATIONS"
      />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>{detail?.primaryEmail}</DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-2 gap-3 text-sm font-mono">
              <F label="Plan" value={detail.planType} />
              <F label="Status" value={detail.status} />
              <F label="BAA" value={detail.baaStatus} />
              <F label="HIPAA deploy" value={detail.hipaaDeploymentStatus} />
              <F label="MFA required" value={detail.mfaRequired ? "yes" : "no"} />
              <F label="Members" value={String(detail.memberCount)} />
              <F label="Projects" value={String(detail.projectCount)} />
              <F
                label="Updated"
                value={format(new Date(detail.updatedAt), "MMM d, yyyy HH:mm")}
              />
            </dl>
          )}
          <DialogFooter>
            <Link href="/admin/organizations">
              <Button variant="outline">Manage in Organizations →</Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-foreground break-words">{value}</span>
    </div>
  );
}
