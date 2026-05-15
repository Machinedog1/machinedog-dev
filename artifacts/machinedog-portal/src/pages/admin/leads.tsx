import { useMemo, useState } from "react";
import {
  useListAdminLeads,
  useUpdateAdminLead,
  getListAdminLeadsQueryKey,
  type ListAdminLeadsParams,
  type ListAdminLeadsStatus,
  type AdminLead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, Search, CheckCircle2, AlertTriangle, MailCheck, Mail } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AdminTable, type AdminTableColumn } from "@/components/admin/AdminTable";

const PAGE_SIZE = 25;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Request failed";
}

function deliveryBadge(l: AdminLead) {
  if (l.notifyError) {
    return (
      <Badge variant="destructive" className="font-mono uppercase">
        <AlertTriangle className="h-3 w-3 mr-1" /> ERROR
      </Badge>
    );
  }
  if (l.notifiedAt) {
    return (
      <Badge variant="default" className="font-mono uppercase">
        <MailCheck className="h-3 w-3 mr-1" /> NOTIFIED
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono uppercase">
      <Mail className="h-3 w-3 mr-1" /> PENDING
    </Badge>
  );
}

export default function AdminLeadsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<ListAdminLeadsStatus | "any">("any");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<AdminLead | null>(null);
  const [notes, setNotes] = useState("");

  const params: ListAdminLeadsParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset,
      search: appliedSearch.trim() || undefined,
      status: status === "any" ? undefined : status,
    }),
    [offset, appliedSearch, status],
  );

  const { data, isLoading } = useListAdminLeads(params, {
    query: { queryKey: getListAdminLeadsQueryKey(params) },
  });

  const update = useUpdateAdminLead();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminLeadsQueryKey() });

  const openDetail = (l: AdminLead) => {
    setDetail(l);
    setNotes(l.operatorNotes ?? "");
  };

  const submitNotes = () => {
    if (!detail) return;
    update.mutate(
      { id: detail.id, data: { operatorNotes: notes } },
      {
        onSuccess: (updated) => {
          toast({ title: "Notes saved", description: `Lead #${updated.id}` });
          refresh();
          setDetail(updated);
        },
        onError: (e) =>
          toast({ variant: "destructive", title: "Error", description: errorMessage(e) }),
      },
    );
  };

  const toggleContacted = () => {
    if (!detail) return;
    const next = !detail.contactedAt;
    update.mutate(
      { id: detail.id, data: { contacted: next } },
      {
        onSuccess: (updated) => {
          toast({
            title: next ? "Marked contacted" : "Cleared contacted flag",
            description: `Lead #${updated.id}`,
          });
          refresh();
          setDetail(updated);
        },
        onError: (e) =>
          toast({ variant: "destructive", title: "Error", description: errorMessage(e) }),
      },
    );
  };

  const submitSearch = () => {
    setAppliedSearch(search);
    setOffset(0);
  };

  const columns: AdminTableColumn<AdminLead>[] = [
    {
      key: "person",
      header: "Lead",
      cell: (l) => (
        <div className="flex flex-col min-w-0">
          <span className="font-mono font-bold text-foreground truncate">{l.name}</span>
          <span className="text-xs font-mono text-muted-foreground truncate">{l.email}</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            #{l.id} · {l.source}
          </span>
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      cell: (l) => (
        <span className="font-mono text-xs">{l.company?.trim() || "—"}</span>
      ),
    },
    {
      key: "delivery",
      header: "Delivery",
      cell: deliveryBadge,
    },
    {
      key: "contacted",
      header: "Contacted",
      cell: (l) =>
        l.contactedAt ? (
          <Badge variant="default" className="font-mono uppercase">
            <CheckCircle2 className="h-3 w-3 mr-1" /> {format(new Date(l.contactedAt), "MMM d")}
          </Badge>
        ) : (
          <span className="text-xs font-mono text-muted-foreground">—</span>
        ),
    },
    {
      key: "created",
      header: "Captured",
      cell: (l) => (
        <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(l.createdAt), "MMM d, yyyy HH:mm")}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6 overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Inbox className="h-6 w-6 text-primary" /> LEAD_INBOX
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Captured submissions from public contact forms. Notification status mirrors the SMTP send
          attempt.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={submitSearch}
            placeholder="Search name, email, or company (press enter)"
            className="pl-9"
          />
        </form>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as ListAdminLeadsStatus | "any");
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any state</SelectItem>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="notified">Notified</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
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
        rowKey={(l) => l.id}
        onRowClick={openDetail}
        emptyMessage="NO_LEADS"
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lead #{detail?.id} — {detail?.name}</DialogTitle>
            <DialogDescription>
              {detail && format(new Date(detail.createdAt), "MMM d, yyyy HH:mm:ss")} ·{" "}
              {detail?.source}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="flex flex-col gap-4 text-sm font-mono">
              <dl className="grid grid-cols-2 gap-3">
                <F
                  label="Email"
                  value={
                    <a
                      href={`mailto:${detail.email}`}
                      className="text-primary underline break-all"
                    >
                      {detail.email}
                    </a>
                  }
                />
                <F label="Company" value={detail.company ?? "—"} />
                <F
                  label="Notified at"
                  value={
                    detail.notifiedAt
                      ? format(new Date(detail.notifiedAt), "MMM d, yyyy HH:mm")
                      : "—"
                  }
                />
                <F label="Notify error" value={detail.notifyError ?? "—"} />
                <F
                  label="Contacted at"
                  value={
                    detail.contactedAt
                      ? format(new Date(detail.contactedAt), "MMM d, yyyy HH:mm")
                      : "—"
                  }
                />
                <F label="Contacted by" value={detail.contactedByEmail ?? "—"} />
                <F label="IP" value={detail.ipAddress ?? "—"} />
                <F label="User agent" value={detail.userAgent ?? "—"} />
              </dl>

              <div className="flex flex-col gap-1">
                <Label className="text-xs uppercase text-muted-foreground">Message</Label>
                <pre className="glass-subtle rounded p-3 text-[12px] whitespace-pre-wrap break-words">
                  {detail.notes?.trim() || "(empty)"}
                </pre>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs uppercase text-muted-foreground">Operator notes</Label>
                <Textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes (visible to admins only)"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between gap-2 sm:justify-between">
            {detail && (
              <Button
                variant={detail.contactedAt ? "outline" : "default"}
                onClick={toggleContacted}
                disabled={update.isPending}
              >
                {detail.contactedAt ? "Clear contacted" : "Mark contacted"}
              </Button>
            )}
            <Button onClick={submitNotes} disabled={update.isPending}>
              Save notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-foreground break-words">{value}</span>
    </div>
  );
}
