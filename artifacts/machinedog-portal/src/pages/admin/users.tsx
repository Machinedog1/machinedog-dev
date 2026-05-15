import { useMemo, useState } from "react";
import {
  useListAdminUsers,
  getListAdminUsersQueryKey,
  type ListAdminUsersParams,
  type AdminUser,
} from "@workspace/api-client-react";
import { Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";
import { format } from "date-fns";
import { Link } from "wouter";

const ROLES = ["owner", "admin", "developer", "viewer", "billing_admin"] as const;
const PAGE_SIZE = 50;

type UserRow = AdminUser;

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<UserRow | null>(null);

  const params: ListAdminUsersParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      search: search.trim() || undefined,
      role: role === "all" ? undefined : (role as "owner"),
    }),
    [search, role, offset],
  );
  const { data, isLoading } = useListAdminUsers(params, {
    query: { queryKey: getListAdminUsersQueryKey(params) },
  });

  const columns: AdminTableColumn<UserRow>[] = [
    {
      key: "email",
      header: "Email",
      cell: (u) => <span className="font-mono">{u.email}</span>,
    },
    {
      key: "org",
      header: "Organization",
      cell: (u) => (
        <Link href={`/admin/organizations`}>
          <span className="font-mono text-xs text-primary hover:underline cursor-pointer">
            {u.organizationName ?? `#${u.organizationId}`}
          </span>
        </Link>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => <Badge variant="outline" className="font-mono uppercase">{u.role}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => (
        <Badge
          variant={u.status === "active" ? "default" : u.status === "removed" ? "destructive" : "secondary"}
          className="font-mono uppercase"
        >
          {u.status}
        </Badge>
      ),
    },
    {
      key: "invited",
      header: "Invited",
      cell: (u) => (
        <span className="font-mono text-xs text-muted-foreground">
          {format(new Date(u.invitedAt), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      key: "accepted",
      header: "Accepted",
      cell: (u) => (
        <span className="font-mono text-xs text-muted-foreground">
          {u.acceptedAt ? format(new Date(u.acceptedAt), "MMM d, yyyy") : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> USERS
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Every organization member across the platform.
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            placeholder="Search by email"
            className="pl-9"
          />
        </div>
        <Select value={role} onValueChange={(v) => { setRole(v); setOffset(0); }}>
          <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
        rowKey={(u) => u.id}
        onRowClick={(u) => setDetail(u)}
        emptyMessage="NO_USERS"
      />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.email}</DialogTitle>
            <DialogDescription>
              Member of {detail?.organizationName ?? `org #${detail?.organizationId}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-2 gap-3 text-sm font-mono">
              <Field label="Role" value={detail.role} />
              <Field label="Status" value={detail.status} />
              <Field label="Clerk user" value={detail.clerkUserId ?? "—"} />
              <Field
                label="Invited"
                value={format(new Date(detail.invitedAt), "MMM d, yyyy HH:mm")}
              />
              <Field
                label="Accepted"
                value={detail.acceptedAt ? format(new Date(detail.acceptedAt), "MMM d, yyyy HH:mm") : "—"}
              />
              <Field label="Org id" value={String(detail.organizationId)} />
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-foreground break-words">{value}</span>
    </div>
  );
}
