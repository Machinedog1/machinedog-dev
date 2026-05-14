import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTemplates,
  useCreateProject,
  getListMyProjectsQueryKey,
  type Template,
  type CreateProjectBody,
} from "@workspace/api-client-react";
import {
  FilePlus2,
  Github,
  LayoutTemplate,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
  Stethoscope,
  ShieldCheck,
  Code2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Origin = "blank" | "template" | "github";

const ORIGIN_OPTIONS: {
  id: Origin;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "blank",
    title: "Blank project",
    description: "Start fresh — no scaffolding, just a workspace shell.",
    icon: FilePlus2,
  },
  {
    id: "template",
    title: "From template",
    description:
      "Pick from curated starters: SaaS, landing page, internal tools, healthcare-ready, and more.",
    icon: LayoutTemplate,
  },
  {
    id: "github",
    title: "Import from GitHub",
    description:
      "Connect an existing GitHub repository as a Machinedog project.",
    icon: Github,
  },
];

function readQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export default function ProjectNewPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createProject = useCreateProject();
  const { data: templatesResp } = useListTemplates();
  const templates = useMemo(() => templatesResp?.data ?? [], [templatesResp]);

  // If we landed here from /templates with ?templateSlug=..., jump straight
  // to step 2 with the template preselected.
  const presetSlug = readQueryParam("templateSlug");
  const [origin, setOrigin] = useState<Origin>(presetSlug ? "template" : "blank");
  const [step, setStep] = useState<1 | 2 | 3>(presetSlug ? 2 : 1);

  // Step 1 state — origin choice plus its source-specific config (template
  // selection or GitHub coordinates) all live in the same step so step 2 is
  // purely name+description and step 3 is a confirm review.
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(
    presetSlug,
  );
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");

  // Step 2 state
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");

  // Pre-fill title from template name / repo name when entering step 2.
  useEffect(() => {
    if (step !== 2 || title.trim()) return;
    if (origin === "template" && selectedTemplate) {
      const t = templates.find((x) => x.slug === selectedTemplate);
      if (t) setTitle(t.name);
    } else if (origin === "github" && githubRepo.trim()) {
      const pretty = githubRepo
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setTitle(pretty);
    }
  }, [step, origin, selectedTemplate, githubRepo, templates, title]);

  const canProceedFromStep1 = (() => {
    if (origin === "blank") return true;
    if (origin === "template") return !!selectedTemplate;
    return githubOwner.trim().length > 0 && githubRepo.trim().length > 0;
  })();

  const canProceedFromStep2 = title.trim().length > 0;

  const selectedTemplateRecord = useMemo(
    () => templates.find((t) => t.slug === selectedTemplate) ?? null,
    [templates, selectedTemplate],
  );

  const handleCreate = () => {
    if (!title.trim()) return;
    const body: CreateProjectBody = {
      title: title.trim(),
      description: description.trim(),
      summary: summary.trim(),
      ...(origin === "template" && selectedTemplate
        ? { templateSlug: selectedTemplate }
        : {}),
      ...(origin === "github"
        ? {
            githubOwner: githubOwner.trim(),
            githubRepo: githubRepo.trim(),
            githubDefaultBranch: githubBranch.trim() || "main",
          }
        : {}),
    };
    createProject.mutate(
      { data: body },
      {
        onSuccess: (project) => {
          queryClient.invalidateQueries({ queryKey: getListMyProjectsQueryKey() });
          toast({ title: "Project created" });
          setLocation(`/projects/${project.id}`);
        },
        onError: (err: unknown) => {
          const data =
            err && typeof err === "object" && "data" in err
              ? (err as { data?: { error?: string; code?: string } }).data
              : undefined;
          toast({
            variant: "destructive",
            title:
              data?.code === "plan_upgrade_required"
                ? "Plan upgrade required"
                : data?.code === "insufficient_tokens"
                  ? "Insufficient tokens"
                  : "Could not create project",
            description:
              data?.error ?? "Something went wrong. Try again or contact support.",
          });
        },
      },
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-4xl mx-auto w-full gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold font-mono tracking-tight">
            NEW_PROJECT
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Step {step} of 3 · {origin === "blank" ? "Blank" : origin === "template" ? "Template" : "GitHub import"}
          </p>
        </div>
        <Link href="/projects">
          <Button variant="ghost" size="sm" className="font-mono">
            <ArrowLeft className="h-4 w-4 mr-2" /> Cancel
          </Button>
        </Link>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ORIGIN_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = origin === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOrigin(opt.id)}
                  data-testid={`button-origin-${opt.id}`}
                  className={`text-left glass-interactive p-5 rounded-xl flex flex-col gap-3 ring-1 transition-colors ${
                    active
                      ? "ring-primary/60 bg-primary/5"
                      : "ring-border/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-primary" />
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <h3 className="font-mono font-bold text-base">{opt.title}</h3>
                  <p className="text-xs text-muted-foreground leading-5">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>

          {origin === "blank" && (
            <div className="glass-subtle rounded-xl p-5 text-sm text-muted-foreground font-mono">
              A blank project starts with an empty workspace + a starter
              README. Continue to name your project.
            </div>
          )}

          {origin === "template" && (
            <TemplatePicker
              templates={templates}
              selected={selectedTemplate}
              onSelect={setSelectedTemplate}
              isLoading={!templatesResp}
            />
          )}

          {origin === "github" && (
            <div className="glass-subtle rounded-xl p-5 flex flex-col gap-4 max-w-xl">
              <div className="flex items-center gap-2 text-sm font-mono">
                <Github className="h-4 w-4" /> github.com /
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Owner
                  </label>
                  <Input
                    value={githubOwner}
                    onChange={(e) => setGithubOwner(e.target.value)}
                    placeholder="Machinedog1"
                    className="font-mono"
                    data-testid="input-github-owner"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Repo
                  </label>
                  <Input
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="my-repo"
                    className="font-mono"
                    data-testid="input-github-repo"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Default branch
                  </label>
                  <Input
                    value={githubBranch}
                    onChange={(e) => setGithubBranch(e.target.value)}
                    placeholder="main"
                    className="font-mono"
                    data-testid="input-github-branch"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/80 font-mono">
                We'll wire this project to <code>{githubOwner || "owner"}/{githubRepo || "repo"}</code>.
                Change-request PRs will land on the branch above.
              </p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="glass-subtle rounded-xl p-6 flex flex-col gap-4 max-w-2xl">
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Beekeeping Operations"
              className="font-mono"
              data-testid="input-project-title"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              One-line summary
            </label>
            <Input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What does this project do?"
              maxLength={160}
              className="font-mono"
              data-testid="input-project-summary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, goals, constraints…"
              className="font-mono min-h-[120px]"
              data-testid="input-project-description"
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div
          data-testid="wizard-confirm-panel"
          className="glass-subtle rounded-xl p-6 flex flex-col gap-4 max-w-2xl"
        >
          <h2 className="text-base font-mono font-bold tracking-tight">
            Review &amp; create
          </h2>
          <p className="text-xs text-muted-foreground font-mono">
            Confirm everything below before we provision your project. You can
            still edit anything afterwards from the project page.
          </p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <ConfirmRow
              label="Origin"
              value={
                origin === "blank"
                  ? "Blank project"
                  : origin === "template"
                    ? "From template"
                    : "GitHub import"
              }
            />
            {origin === "template" && selectedTemplateRecord && (
              <>
                <ConfirmRow
                  label="Template"
                  value={selectedTemplateRecord.name}
                />
                <ConfirmRow
                  label="Framework"
                  value={selectedTemplateRecord.framework}
                />
                {selectedTemplateRecord.tokenCost > 0 && (
                  <ConfirmRow
                    label="Token cost"
                    value={`${selectedTemplateRecord.tokenCost} tokens`}
                    accent="amber"
                  />
                )}
                {selectedTemplateRecord.isHealthcare && (
                  <ConfirmRow
                    label="Compliance"
                    value="HIPAA-aware (BAA required)"
                    accent="emerald"
                  />
                )}
              </>
            )}
            {origin === "github" && (
              <>
                <ConfirmRow
                  label="Repository"
                  value={`${githubOwner}/${githubRepo}`}
                />
                <ConfirmRow label="Branch" value={githubBranch || "main"} />
              </>
            )}
            <ConfirmRow label="Title" value={title || "(missing)"} />
            {summary && <ConfirmRow label="Summary" value={summary} />}
            {description && (
              <div className="md:col-span-2 flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Description
                </span>
                <p className="text-xs leading-5 whitespace-pre-wrap break-words text-foreground/90">
                  {description}
                </p>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
          disabled={step === 1}
          data-testid="button-wizard-back"
          className="font-mono"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        {step < 3 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => ((s + 1) as 1 | 2 | 3))}
            disabled={
              (step === 1 && !canProceedFromStep1) ||
              (step === 2 && !canProceedFromStep2)
            }
            data-testid="button-wizard-next"
            className="font-mono bg-primary text-primary-foreground"
          >
            Next <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleCreate}
            disabled={!title.trim() || createProject.isPending}
            data-testid="button-wizard-create"
            className="font-mono bg-primary text-primary-foreground"
          >
            {createProject.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
              </>
            ) : (
              "Confirm & create"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function ConfirmRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber";
}) {
  const tone =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
        ? "text-amber-300"
        : "text-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm font-mono ${tone}`}>{value}</span>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Origin", "Details", "Confirm"] as const;
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const idx = (i + 1) as 1 | 2 | 3;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-mono ring-1 ${
                active
                  ? "bg-primary text-primary-foreground ring-primary"
                  : done
                  ? "bg-primary/20 text-primary ring-primary/40"
                  : "bg-background/40 text-muted-foreground ring-border/30"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : idx}
            </div>
            <span
              className={`text-[11px] font-mono uppercase tracking-wider ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
            {idx < 3 && <div className="w-8 h-px bg-border/40" />}
          </div>
        );
      })}
    </div>
  );
}

function TemplatePicker({
  templates,
  selected,
  onSelect,
  isLoading,
}: {
  templates: Template[];
  selected: string | null;
  onSelect: (slug: string) => void;
  isLoading: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "general" | "healthcare">("all");
  const filtered = filter === "all" ? templates : templates.filter((t) => t.category === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {(["all", "general", "healthcare"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider ring-1 transition-colors ${
              filter === f
                ? "bg-primary/15 text-primary ring-primary/30"
                : "bg-background/40 text-muted-foreground ring-border/30 hover:bg-muted/30"
            }`}
            data-testid={`tab-wizard-templates-${f}`}
          >
            {f}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full glass rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((tpl) => {
            const active = selected === tpl.slug;
            return (
              <button
                key={tpl.slug}
                type="button"
                onClick={() => onSelect(tpl.slug)}
                data-testid={`button-pick-template-${tpl.slug}`}
                className={`text-left glass-interactive p-4 rounded-xl flex flex-col gap-2 ring-1 ${
                  active ? "ring-primary/60 bg-primary/5" : "ring-border/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {tpl.isHealthcare ? (
                      <Stethoscope className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <h4 className="font-mono font-bold text-sm truncate">{tpl.name}</h4>
                  </div>
                  {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-4 line-clamp-2">
                  {tpl.description}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                  <span className="inline-flex items-center gap-1 text-muted-foreground bg-background/40 ring-1 ring-border/30 px-1.5 py-0.5 rounded">
                    <Code2 className="h-3 w-3" /> {tpl.framework}
                  </span>
                  {tpl.isHealthcare && (
                    <span className="inline-flex items-center gap-1 text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 px-1.5 py-0.5 rounded">
                      <ShieldCheck className="h-3 w-3" /> HIPAA
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
