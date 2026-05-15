import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListTemplates,
  useGetMe,
  type Template,
} from "@workspace/api-client-react";
import {
  LayoutTemplate,
  Stethoscope,
  Sparkles,
  ShieldCheck,
  Lock,
  Code2,
  Coins,
  ArrowRight,
} from "lucide-react";
import { PHI_MODE_LOCKED_WARNING } from "@/lib/compliance-warnings";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const PROJECT_TYPE_LABELS: Record<Template["projectType"], string> = {
  web_app: "Web app",
  mobile_app: "Mobile app",
  api: "API",
  internal_tool: "Internal tool",
  healthcare_template: "Healthcare",
  other: "Other",
};

type Filter = "all" | "general" | "healthcare";

export default function TemplatesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<Template | null>(null);
  const { data, isLoading } = useListTemplates();
  // Plan-tier enforcement happens server-side at create time, but we also
  // gate the CTA client-side so non-Healthcare/Enterprise orgs see the
  // restriction up front instead of failing inside the wizard.
  const { data: me } = useGetMe();
  const planType = me?.organization?.planType ?? null;
  const healthcareAllowed =
    planType === "healthcare" || planType === "enterprise";

  const items = useMemo(() => {
    const all = data?.data ?? [];
    if (filter === "all") return all;
    return all.filter((t) => t.category === filter);
  }, [data, filter]);

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-6xl mx-auto w-full gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <LayoutTemplate className="h-6 w-6 text-primary" />
          TEMPLATES
        </h1>
        <p className="text-sm text-muted-foreground font-mono">
          Start a new project from a curated baseline. Healthcare-tier
          templates are gated by your workspace plan.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "general", "healthcare"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            data-testid={`tab-templates-${f}`}
            className={`px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider ring-1 transition-colors ${
              filter === f
                ? "bg-primary/15 text-primary ring-primary/30"
                : "bg-background/40 text-muted-foreground ring-border/30 hover:bg-muted/30"
            }`}
          >
            {f === "all" ? "All" : f === "general" ? "General" : "Healthcare"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 w-full glass rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="glass-subtle rounded-xl p-10 text-center font-mono text-muted-foreground">
          NO_TEMPLATES_IN_FILTER
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((tpl) => {
            const blocked = tpl.isHealthcare && !healthcareAllowed;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setDetail(tpl)}
                data-testid={`card-template-${tpl.slug}`}
                className="text-left glass-interactive p-5 rounded-xl flex flex-col gap-3 h-full ring-1 ring-border/30 hover:ring-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {tpl.isHealthcare ? (
                      <Stethoscope className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <h3 className="font-bold text-base font-mono truncate">
                      {tpl.name}
                    </h3>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-background/40 ring-1 ring-border/30">
                    {PROJECT_TYPE_LABELS[tpl.projectType]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/90 leading-5 line-clamp-3">
                  {tpl.description}
                </p>
                <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
                  <span className="inline-flex items-center gap-1 text-muted-foreground bg-background/40 ring-1 ring-border/30 px-1.5 py-0.5 rounded">
                    <Code2 className="h-3 w-3" /> {tpl.framework}
                  </span>
                  {tpl.isHealthcare && (
                    <span className="inline-flex items-center gap-1 text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 px-1.5 py-0.5 rounded">
                      <ShieldCheck className="h-3 w-3" /> HIPAA-aware
                    </span>
                  )}
                  {tpl.tokenCost > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30 px-1.5 py-0.5 rounded">
                      <Coins className="h-3 w-3" /> {tpl.tokenCost}
                    </span>
                  )}
                </div>
                {blocked && (
                  <p
                    className="text-[10px] text-amber-300/90 font-mono leading-snug"
                    title={PHI_MODE_LOCKED_WARNING}
                  >
                    <Lock className="h-3 w-3 inline mr-1" />
                    {PHI_MODE_LOCKED_WARNING}
                  </p>
                )}
                <div className="mt-auto pt-2 text-[11px] font-mono uppercase tracking-wider text-primary inline-flex items-center gap-1">
                  View details <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <TemplateDetailDialog
        template={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        healthcareAllowed={healthcareAllowed}
      />
    </div>
  );
}

function TemplateDetailDialog({
  template,
  onOpenChange,
  healthcareAllowed,
}: {
  template: Template | null;
  onOpenChange: (open: boolean) => void;
  healthcareAllowed: boolean;
}) {
  const open = !!template;
  const blocked =
    !!template && template.isHealthcare && !healthcareAllowed;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="template-detail-dialog"
        className="max-w-xl"
      >
        {template && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono flex items-center gap-2">
                {template.isHealthcare ? (
                  <Stethoscope className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary" />
                )}
                {template.name}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {template.description}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
                <span className="inline-flex items-center gap-1 text-muted-foreground bg-background/40 ring-1 ring-border/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  {PROJECT_TYPE_LABELS[template.projectType]}
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground bg-background/40 ring-1 ring-border/30 px-1.5 py-0.5 rounded">
                  <Code2 className="h-3 w-3" /> {template.framework}
                </span>
                {template.isHealthcare && (
                  <span className="inline-flex items-center gap-1 text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 px-1.5 py-0.5 rounded">
                    <ShieldCheck className="h-3 w-3" /> HIPAA-aware
                  </span>
                )}
                {template.tokenCost > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30 px-1.5 py-0.5 rounded">
                    <Coins className="h-3 w-3" /> {template.tokenCost} tokens
                  </span>
                )}
              </div>

              {template.complianceNotes && (
                <div
                  data-testid="template-compliance-notes"
                  className="rounded-md ring-1 ring-border/40 bg-muted/30 p-3 text-xs leading-5 text-muted-foreground/90 font-mono"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Compliance notes
                  </div>
                  {template.complianceNotes}
                </div>
              )}

              {blocked && (
                <div className="rounded-md ring-1 ring-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-300 font-mono inline-flex items-start gap-2">
                  <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{PHI_MODE_LOCKED_WARNING}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                data-testid="button-template-detail-close"
                className="font-mono text-[11px] uppercase"
              >
                Close
              </Button>
              {blocked ? (
                <Button
                  disabled
                  title={PHI_MODE_LOCKED_WARNING}
                  data-testid={`button-use-template-${template.slug}`}
                  className="font-mono text-[11px] uppercase"
                >
                  <Lock className="h-3 w-3 mr-1.5" /> PHI mode locked
                </Button>
              ) : (
                <Link
                  href={`/projects/new?templateSlug=${encodeURIComponent(template.slug)}`}
                >
                  <Button
                    data-testid={`button-use-template-${template.slug}`}
                    className="font-mono text-[11px] uppercase bg-primary text-primary-foreground"
                  >
                    Use template <ArrowRight className="h-3 w-3 ml-1.5" />
                  </Button>
                </Link>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
