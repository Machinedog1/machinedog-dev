import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  getGetMeQueryKey,
  useListTemplates,
  useCreateProject,
  type CreateProjectBody,
} from "@workspace/api-client-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Building2,
  CreditCard,
  Coins,
  FolderGit2,
  Rocket,
  Sparkles,
} from "lucide-react";

const TOTAL_STEPS = 6;

const STEP_LABELS = [
  "Welcome",
  "Organization",
  "Plan",
  "Tokens",
  "First project",
  "Workspace",
];

const CLIENT_TYPES: Array<{ value: string; label: string; hint: string }> = [
  { value: "agency", label: "Agency", hint: "Building for clients" },
  { value: "startup", label: "Startup", hint: "Building our own product" },
  { value: "enterprise", label: "Enterprise", hint: "Internal tools at scale" },
  { value: "healthcare", label: "Healthcare", hint: "PHI / clinical workflows" },
  { value: "consultancy", label: "Consultancy", hint: "Advisory + delivery" },
  { value: "other", label: "Other", hint: "Something else" },
];

const PLAN_CARDS = [
  { id: "starter", name: "Starter", price: "$49/mo", tokens: "1M tokens" },
  { id: "pro", name: "Pro", price: "$199/mo", tokens: "5M tokens", featured: true },
  { id: "business", name: "Business", price: "$599/mo", tokens: "20M tokens" },
  { id: "healthcare", name: "Healthcare", price: "Contact us", tokens: "Custom + BAA" },
  { id: "enterprise", name: "Enterprise", price: "Contact us", tokens: "Custom" },
];

async function patchOnboarding(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/auth/me/onboarding", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: templates } = useListTemplates();
  const createProject = useCreateProject();

  const initialStep = me?.member?.onboardingStep ?? 0;
  const [step, setStep] = useState<number>(initialStep);
  useEffect(() => {
    if (typeof initialStep === "number" && initialStep !== step) {
      setStep(initialStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.organization?.id]);

  const memberOnboardingCompletedAt = me?.member?.onboardingCompletedAt;
  // If onboarding is already complete for this member, get out.
  useEffect(() => {
    if (memberOnboardingCompletedAt) {
      setLocation("/");
    }
  }, [memberOnboardingCompletedAt, setLocation]);

  const [orgName, setOrgName] = useState<string>(me?.organization?.name ?? "");
  const [website, setWebsite] = useState<string>(me?.organization?.website ?? "");
  const [industry, setIndustry] = useState<string>(me?.organization?.industry ?? "");
  const [clientType, setClientType] = useState<string>(me?.organization?.clientType ?? "");
  useEffect(() => {
    setOrgName((v) => v || me?.organization?.name || "");
    setWebsite((v) => v || me?.organization?.website || "");
    setIndustry((v) => v || me?.organization?.industry || "");
    setClientType((v) => v || me?.organization?.clientType || "");
  }, [me?.organization?.id]);

  const memberState = (me?.member?.onboardingState ?? null) as
    | {
        plan?: string;
        firstProjectId?: number | null;
        projectMode?: "blank" | "template" | "github";
      }
    | null;

  const [selectedPlan, setSelectedPlan] = useState<string>(memberState?.plan ?? "pro");

  const [projectMode, setProjectMode] = useState<"blank" | "template" | "github">(
    memberState?.projectMode ?? "blank",
  );
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [projectSummary, setProjectSummary] = useState<string>("");
  const [templateSlug, setTemplateSlug] = useState<string>("");
  const [githubOwner, setGithubOwner] = useState<string>("");
  const [githubRepo, setGithubRepo] = useState<string>("");
  // Hydrate the previously-created project id so a user resuming at the
  // workspace handoff step is routed to the right project, not "/".
  const [createdProjectId, setCreatedProjectId] = useState<number | null>(
    memberState?.firstProjectId ?? null,
  );
  useEffect(() => {
    if (memberState?.firstProjectId != null && createdProjectId == null) {
      setCreatedProjectId(memberState.firstProjectId);
    }
    if (memberState?.plan && selectedPlan === "pro") {
      setSelectedPlan(memberState.plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberState?.firstProjectId, memberState?.plan]);
  const [savingStep, setSavingStep] = useState(false);

  const templateList = templates?.data ?? [];

  const canAdvance = useMemo(() => {
    if (step === 1) return orgName.trim().length > 0 && clientType.length > 0;
    if (step === 2) return !!selectedPlan;
    if (step === 4) {
      if (createdProjectId) return true;
      if (projectMode === "blank") return projectTitle.trim().length > 0;
      if (projectMode === "template") return !!templateSlug && projectTitle.trim().length > 0;
      if (projectMode === "github")
        return githubOwner.trim().length > 0 && githubRepo.trim().length > 0;
    }
    return true;
  }, [
    step,
    orgName,
    clientType,
    selectedPlan,
    projectMode,
    projectTitle,
    templateSlug,
    githubOwner,
    githubRepo,
    createdProjectId,
  ]);

  async function persistAndAdvance(payload: Record<string, unknown> = {}) {
    setSavingStep(true);
    try {
      await patchOnboarding({ ...payload, step: Math.min(step + 1, TOTAL_STEPS) });
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't save progress",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSavingStep(false);
    }
  }

  async function handleNext() {
    if (step === 0) {
      await persistAndAdvance();
      return;
    }
    if (step === 1) {
      await persistAndAdvance({
        name: orgName.trim(),
        website: website.trim() || null,
        industry: industry.trim() || null,
        clientType,
      });
      return;
    }
    if (step === 2) {
      await persistAndAdvance({ state: { plan: selectedPlan } });
      return;
    }
    if (step === 3) {
      // Tokens initialized step — purely informational. Persist acknowledgement.
      await persistAndAdvance({ state: { tokensAcknowledged: true } });
      return;
    }
    if (step === 4) {
      if (createdProjectId) {
        await persistAndAdvance({ state: { firstProjectId: createdProjectId } });
        return;
      }
      try {
        setSavingStep(true);
        const summary = projectSummary.trim();
        const body: CreateProjectBody = {
          title: projectTitle.trim() || `${orgName || "My"} project`,
          description: summary || `${orgName || "First"} project created during onboarding.`,
          ...(summary ? { summary } : {}),
          ...(projectMode === "template" && templateSlug ? { templateSlug } : {}),
          ...(projectMode === "github"
            ? { githubOwner: githubOwner.trim(), githubRepo: githubRepo.trim() }
            : {}),
        };
        const res = await createProject.mutateAsync({ data: body });
        const id = (res as { id?: number })?.id ?? null;
        setCreatedProjectId(id);
        await patchOnboarding({
          step: 5,
          state: { firstProjectId: id, projectMode },
        });
        await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setStep(5);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Couldn't create project",
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setSavingStep(false);
      }
      return;
    }
    if (step === 5) {
      // Final — mark complete and route to workspace.
      try {
        setSavingStep(true);
        await patchOnboarding({ complete: true });
        await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
        if (createdProjectId) {
          setLocation(`/projects/${createdProjectId}/workspace`);
        } else {
          setLocation("/");
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Couldn't finish setup",
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setSavingStep(false);
      }
    }
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div
      className="dark min-h-screen w-full text-white"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(900px 700px at 80% -10%, hsla(254,95%,75%,0.18), transparent 60%), radial-gradient(700px 600px at -10% 30%, hsla(200,90%,60%,0.18), transparent 55%)",
        }}
      />

      <header className="flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
        <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-white/60">
          Step {step + 1} of {TOTAL_STEPS} · {STEP_LABELS[step]}
        </div>
      </header>

      <div className="px-5 sm:px-8 lg:px-12 mt-6">
        <div className="max-w-3xl mx-auto">
          <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-white/45">
            {STEP_LABELS.map((label, i) => (
              <span key={label} className={i <= step ? "text-white/80" : ""}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <main className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        <div
          className="max-w-3xl mx-auto rounded-[28px] p-6 sm:p-10"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {step === 0 && <StepWelcome orgName={me?.organization?.name ?? "your org"} />}
          {step === 1 && (
            <StepOrganization
              orgName={orgName}
              setOrgName={setOrgName}
              website={website}
              setWebsite={setWebsite}
              industry={industry}
              setIndustry={setIndustry}
              clientType={clientType}
              setClientType={setClientType}
            />
          )}
          {step === 2 && (
            <StepPlan selectedPlan={selectedPlan} setSelectedPlan={setSelectedPlan} />
          )}
          {step === 3 && (
            <StepTokens balance={me?.tokenBalance ?? 0} />
          )}
          {step === 4 && (
            <StepFirstProject
              mode={projectMode}
              setMode={setProjectMode}
              projectTitle={projectTitle}
              setProjectTitle={setProjectTitle}
              projectSummary={projectSummary}
              setProjectSummary={setProjectSummary}
              templateSlug={templateSlug}
              setTemplateSlug={setTemplateSlug}
              templates={templateList}
              githubOwner={githubOwner}
              setGithubOwner={setGithubOwner}
              githubRepo={githubRepo}
              setGithubRepo={setGithubRepo}
              createdProjectId={createdProjectId}
            />
          )}
          {step === 5 && <StepDone projectId={createdProjectId} orgName={orgName} />}

          <div className="mt-10 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={step === 0 || savingStep}
              className="text-white/70 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canAdvance || savingStep}
              className="h-11 px-6 text-sm font-bold border-0 text-white"
              style={{
                background:
                  "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
              }}
              data-testid="button-onboarding-next"
            >
              {savingStep ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : step === TOTAL_STEPS - 1 ? (
                <>
                  Open workspace
                  <Rocket className="h-4 w-4 ml-2" />
                </>
              ) : step === 4 && !createdProjectId ? (
                <>
                  Create project
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>

      </main>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-md"
          style={{
            background:
              "linear-gradient(135deg, hsla(200,90%,60%,0.2), hsla(254,95%,75%,0.2))",
          }}
        >
          <Icon className="h-3.5 w-3.5 text-primary" />
        </span>
        <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-primary">
          {eyebrow}
        </span>
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
        {title}
      </h1>
      <p className="text-sm text-white/65 mt-2 max-w-xl">{subtitle}</p>
    </div>
  );
}

function StepWelcome({ orgName }: { orgName: string }) {
  return (
    <>
      <SectionHeader
        icon={Sparkles}
        eyebrow="Welcome"
        title={`Let's set up ${orgName}.`}
        subtitle="Six quick steps and you'll be in the workspace. You can pause and come back — we'll save your progress."
      />
      <ul className="space-y-2 text-sm text-white/75">
        {[
          "Tell us about your organization",
          "Pick a starting plan",
          "We'll initialize your token balance",
          "Create your first project (blank, template, or GitHub)",
          "Open the workspace and start building",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function StepOrganization(props: {
  orgName: string;
  setOrgName: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  clientType: string;
  setClientType: (v: string) => void;
}) {
  return (
    <>
      <SectionHeader
        icon={Building2}
        eyebrow="Organization"
        title="Tell us about your team."
        subtitle="This shows up in the workspace, on invites, and on billing receipts. You can change it later in settings."
      />
      <div className="space-y-5">
        <div>
          <Label className="text-white/80">Organization name *</Label>
          <Input
            value={props.orgName}
            onChange={(e) => props.setOrgName(e.target.value)}
            placeholder="Acme Studio"
            className="mt-1 bg-white/5 border-white/15 text-white"
            data-testid="input-org-name"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-white/80">Website</Label>
            <Input
              value={props.website}
              onChange={(e) => props.setWebsite(e.target.value)}
              placeholder="https://acme.com"
              className="mt-1 bg-white/5 border-white/15 text-white"
              data-testid="input-org-website"
            />
          </div>
          <div>
            <Label className="text-white/80">Industry</Label>
            <Input
              value={props.industry}
              onChange={(e) => props.setIndustry(e.target.value)}
              placeholder="Healthcare, fintech, e-commerce…"
              className="mt-1 bg-white/5 border-white/15 text-white"
              data-testid="input-org-industry"
            />
          </div>
        </div>
        <div>
          <Label className="text-white/80 mb-2 block">What kind of team are you? *</Label>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {CLIENT_TYPES.map((t) => {
              const selected = props.clientType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => props.setClientType(t.value)}
                  data-testid={`button-client-type-${t.value}`}
                  className={`text-left rounded-xl px-4 py-3 transition ${
                    selected ? "ring-2 ring-primary" : "ring-1 ring-white/10 hover:ring-white/25"
                  }`}
                  style={{ background: selected ? "rgba(63,177,240,0.12)" : "rgba(255,255,255,0.03)" }}
                >
                  <div className="text-sm font-semibold text-white">{t.label}</div>
                  <div className="text-[11px] text-white/55 mt-0.5">{t.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function StepPlan({
  selectedPlan,
  setSelectedPlan,
}: {
  selectedPlan: string;
  setSelectedPlan: (v: string) => void;
}) {
  return (
    <>
      <SectionHeader
        icon={CreditCard}
        eyebrow="Plan"
        title="Choose a starting plan."
        subtitle="You can change plans or top up tokens any time. Healthcare and Enterprise require a sales conversation."
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PLAN_CARDS.map((p) => {
          const selected = selectedPlan === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlan(p.id)}
              data-testid={`button-plan-${p.id}`}
              className={`text-left rounded-2xl p-5 transition ${
                selected ? "ring-2 ring-primary" : "ring-1 ring-white/10 hover:ring-white/25"
              }`}
              style={{
                background: selected ? "rgba(63,177,240,0.12)" : "rgba(255,255,255,0.03)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-white">{p.name}</div>
                {p.featured && (
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                    Popular
                  </span>
                )}
              </div>
              <div className="text-2xl font-extrabold text-white">{p.price}</div>
              <div className="text-[11px] text-white/60 mt-1">{p.tokens}</div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-white/40 mt-4">
        We won't charge you yet. You'll confirm in checkout when you upgrade from the
        billing page.
      </p>
    </>
  );
}

function StepTokens({ balance }: { balance: number }) {
  return (
    <>
      <SectionHeader
        icon={Coins}
        eyebrow="Tokens"
        title="Your token balance is ready."
        subtitle="Tokens power every prompt and build. Your starter balance is initialized — top up any time from the Tokens page."
      />
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          background:
            "linear-gradient(135deg, hsla(200,90%,60%,0.12), hsla(254,95%,75%,0.12))",
          border: "1px solid hsla(200,90%,60%,0.25)",
        }}
      >
        <div className="text-[11px] font-mono uppercase tracking-widest text-primary">
          Current balance
        </div>
        <div className="text-5xl font-extrabold text-white mt-2 mb-1">
          {balance.toLocaleString()}
        </div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-white/50">
          tokens
        </div>
      </div>
      <ul className="text-sm text-white/70 mt-5 space-y-2">
        <li className="flex items-start gap-2">
          <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <span>Three pack sizes available (small, medium, large) on the Tokens page.</span>
        </li>
        <li className="flex items-start gap-2">
          <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <span>Subscription plans renew tokens monthly.</span>
        </li>
        <li className="flex items-start gap-2">
          <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <span>Per-prompt usage and ledger history are visible in real time.</span>
        </li>
      </ul>
    </>
  );
}

function StepFirstProject(props: {
  mode: "blank" | "template" | "github";
  setMode: (m: "blank" | "template" | "github") => void;
  projectTitle: string;
  setProjectTitle: (v: string) => void;
  projectSummary: string;
  setProjectSummary: (v: string) => void;
  templateSlug: string;
  setTemplateSlug: (v: string) => void;
  templates: Array<{ slug: string; name: string; description?: string | null }>;
  githubOwner: string;
  setGithubOwner: (v: string) => void;
  githubRepo: string;
  setGithubRepo: (v: string) => void;
  createdProjectId: number | null;
}) {
  const modes: Array<{ id: "blank" | "template" | "github"; label: string; hint: string }> = [
    { id: "blank", label: "Blank project", hint: "Start with an empty workspace" },
    { id: "template", label: "Template", hint: "Copy a starter we maintain" },
    { id: "github", label: "GitHub import", hint: "Pull an existing repo" },
  ];
  return (
    <>
      <SectionHeader
        icon={FolderGit2}
        eyebrow="First project"
        title="Spin up your first project."
        subtitle="Pick how to start. You can always add more projects later from the dashboard."
      />
      {props.createdProjectId ? (
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: "rgba(63,177,240,0.1)",
            border: "1px solid hsla(200,90%,60%,0.3)",
          }}
        >
          <Check className="h-6 w-6 text-primary mx-auto mb-2" />
          <div className="text-white font-semibold">
            Project #{props.createdProjectId} is ready.
          </div>
          <div className="text-[12px] text-white/60 mt-1">
            Continue to open the workspace.
          </div>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-2 mb-5">
            {modes.map((m) => {
              const selected = props.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => props.setMode(m.id)}
                  data-testid={`button-mode-${m.id}`}
                  className={`text-left rounded-xl px-4 py-3 transition ${
                    selected ? "ring-2 ring-primary" : "ring-1 ring-white/10 hover:ring-white/25"
                  }`}
                  style={{
                    background: selected ? "rgba(63,177,240,0.12)" : "rgba(255,255,255,0.03)",
                  }}
                >
                  <div className="text-sm font-semibold text-white">{m.label}</div>
                  <div className="text-[11px] text-white/55 mt-0.5">{m.hint}</div>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-white/80">Project title *</Label>
              <Input
                value={props.projectTitle}
                onChange={(e) => props.setProjectTitle(e.target.value)}
                placeholder="My first build"
                className="mt-1 bg-white/5 border-white/15 text-white"
                data-testid="input-project-title"
              />
            </div>
            <div>
              <Label className="text-white/80">Short description</Label>
              <Textarea
                value={props.projectSummary}
                onChange={(e) => props.setProjectSummary(e.target.value)}
                rows={2}
                placeholder="A one-line summary of what you're building."
                className="mt-1 bg-white/5 border-white/15 text-white"
              />
            </div>
            {props.mode === "template" && (
              <div>
                <Label className="text-white/80">Pick a template *</Label>
                <div className="mt-1 grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {props.templates.map((t) => {
                    const selected = props.templateSlug === t.slug;
                    return (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => props.setTemplateSlug(t.slug)}
                        data-testid={`button-template-${t.slug}`}
                        className={`text-left rounded-lg p-3 transition ${
                          selected ? "ring-2 ring-primary" : "ring-1 ring-white/10 hover:ring-white/25"
                        }`}
                        style={{
                          background: selected
                            ? "rgba(63,177,240,0.12)"
                            : "rgba(255,255,255,0.03)",
                        }}
                      >
                        <div className="text-sm font-semibold text-white">{t.name}</div>
                        {t.description && (
                          <div className="text-[11px] text-white/55 mt-0.5 line-clamp-2">
                            {t.description}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {props.templates.length === 0 && (
                    <div className="text-[12px] text-white/50 col-span-full">
                      No templates available yet — try blank or GitHub import.
                    </div>
                  )}
                </div>
              </div>
            )}
            {props.mode === "github" && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/80">GitHub owner *</Label>
                  <Input
                    value={props.githubOwner}
                    onChange={(e) => props.setGithubOwner(e.target.value)}
                    placeholder="my-org"
                    className="mt-1 bg-white/5 border-white/15 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white/80">Repository *</Label>
                  <Input
                    value={props.githubRepo}
                    onChange={(e) => props.setGithubRepo(e.target.value)}
                    placeholder="my-repo"
                    className="mt-1 bg-white/5 border-white/15 text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

function StepDone({ projectId, orgName }: { projectId: number | null; orgName: string }) {
  return (
    <>
      <SectionHeader
        icon={Rocket}
        eyebrow="You're set"
        title={`${orgName || "Your team"} is ready to build.`}
        subtitle="Open the workspace to start prompting. You can come back to settings any time to invite teammates, change plans, or top up tokens."
      />
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { label: "Workspace", hint: projectId ? `Project #${projectId}` : "Console" },
          { label: "Tokens", hint: "Top up any time" },
          { label: "Team", hint: "Invite from settings" },
        ].map((b) => (
          <div
            key={b.label}
            className="rounded-xl p-4"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div className="text-sm font-semibold text-white">{b.label}</div>
            <div className="text-[11px] text-white/55 mt-1">{b.hint}</div>
          </div>
        ))}
      </div>
    </>
  );
}
