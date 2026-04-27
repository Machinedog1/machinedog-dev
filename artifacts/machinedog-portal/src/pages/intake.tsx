import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import huskyPortrait from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777252211433.png";

const TIMELINE_OPTIONS = [
  { value: "asap", label: "ASAP — we need this now" },
  { value: "1-3-months", label: "Within 1–3 months" },
  { value: "3-6-months", label: "3–6 months out" },
  { value: "exploring", label: "Just exploring for now" },
] as const;

const BUDGET_OPTIONS = [
  { value: "under-5k", label: "Under $5,000" },
  { value: "5k-15k", label: "$5,000 – $15,000" },
  { value: "15k-50k", label: "$15,000 – $50,000" },
  { value: "50k-plus", label: "$50,000+" },
  { value: "not-sure", label: "Not sure yet" },
] as const;

type FormState = {
  name: string;
  email: string;
  company: string;
  projectDescription: string;
  timeline: string;
  budget: string;
  referralSource: string;
  successCriteria: string;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  company: "",
  projectDescription: "",
  timeline: "",
  budget: "",
  referralSource: "",
  successCriteria: "",
};

function apiUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}api${path}`;
}

const GLASS_CARD_STYLE: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)",
  border: "1px solid rgba(255,255,255,0.14)",
  backdropFilter: "blur(40px) saturate(180%)",
  WebkitBackdropFilter: "blur(40px) saturate(180%)",
  boxShadow:
    "0 30px 80px -20px rgba(0,0,0,0.55), 0 1px 0 0 rgba(255,255,255,0.18) inset, 0 -1px 0 0 rgba(255,255,255,0.04) inset",
};

const GLASS_INPUT_CLASS =
  "!bg-white/5 !border !border-white/15 !text-white placeholder:!text-white/40 focus-visible:!ring-2 focus-visible:!ring-primary/60 !backdrop-blur";

function HuskyBackdrop() {
  return (
    <>
      {/* DESKTOP full-bleed husky portrait — eye-focused crop, hidden on mobile */}
      <div
        className="hidden lg:block absolute inset-0 bg-cover bg-no-repeat lg:bg-[position:50%_32%]"
        style={{
          backgroundImage: `url(${huskyPortrait})`,
          filter: "saturate(1.18) contrast(1.06) brightness(0.82)",
        }}
      />

      {/* Desktop cyan halo behind the eyes */}
      <div
        className="hidden lg:block absolute inset-0 pointer-events-none mix-blend-screen"
        style={{
          background:
            "radial-gradient(ellipse 70% 35% at 52% 38%, hsla(200,95%,55%,0.30) 0%, transparent 60%)",
        }}
      />

      {/* Desktop vignette / bottom fade for legibility */}
      <div
        className="hidden lg:block absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, transparent 0%, hsla(220,45%,3%,0.35) 60%, hsla(220,45%,3%,0.85) 100%)",
        }}
      />
      <div
        className="hidden lg:block absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsla(220,45%,3%,0.55) 55%, hsla(220,45%,3%,0.95) 100%)",
        }}
      />
    </>
  );
}

function MobileHuskyHero() {
  return (
    <div className="lg:hidden relative w-full h-[42vh] min-h-[260px] max-h-[420px] overflow-hidden mt-3">
      <img
        src={huskyPortrait}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          objectPosition: "50% 30%",
          filter: "saturate(1.18) contrast(1.06) brightness(0.82)",
        }}
      />
      {/* Cyan halo over the eyes */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none mix-blend-screen"
        style={{
          background:
            "radial-gradient(ellipse 70% 35% at 50% 42%, hsla(200,95%,55%,0.30) 0%, transparent 60%)",
        }}
      />
      {/* Bottom fade so content underneath reads cleanly */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsla(220,45%,3%,0.55) 55%, hsla(220,45%,3%,1) 100%)",
        }}
      />
    </div>
  );
}

function PageHeader() {
  const signInHref = `${import.meta.env.BASE_URL}sign-in`.replace(/\/+/g, "/");
  const workHref = `${import.meta.env.BASE_URL}work`.replace(/\/+/g, "/");
  return (
    <header className="flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
      <Logo size="sm" />
      <nav className="flex items-center gap-2 sm:gap-3">
        <a
          href={workHref}
          className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white/80 transition hover:text-white"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
          }}
        >
          Projects
        </a>
        <a
          href={signInHref}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white/80 transition hover:text-white"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
          }}
        >
          <span aria-hidden>←</span> Sign in
        </a>
      </nav>
    </header>
  );
}

export default function IntakePage() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.timeline) {
      setError("Pick a timeline.");
      return;
    }
    if (!form.budget) {
      setError("Pick a budget range.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/intake"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data?.issues?.[0]?.message ??
            data?.error ??
            "Something went wrong. Please try again.",
        );
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div
        className="dark relative min-h-screen w-full overflow-hidden text-white"
        style={{ background: "hsl(220 45% 3%)" }}
      >
        <HuskyBackdrop />
        <div className="relative z-10 flex min-h-screen flex-col">
          <PageHeader />
          <MobileHuskyHero />
          <main className="flex-1 flex items-center justify-center px-5 sm:px-8 lg:px-12 pb-10 lg:pb-16 pt-6 lg:pt-0">
            <div className="w-full max-w-lg">
              <div
                className="relative rounded-[28px] p-8 sm:p-10 overflow-hidden text-center"
                style={GLASS_CARD_STYLE}
              >
                {/* Top rim highlight */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                  }}
                />
                {/* Soft cyan inner glow */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, hsla(200,95%,60%,0.35) 0%, transparent 70%)",
                    filter: "blur(8px)",
                  }}
                />
                <div className="relative">
                  <div
                    className="h-16 w-16 mx-auto mb-6 rounded-full flex items-center justify-center"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(200 95% 60%), hsl(254 95% 75%))",
                      boxShadow: "0 0 32px hsla(200,95%,60%,0.55)",
                    }}
                  >
                    <Check className="h-8 w-8 text-white" strokeWidth={3} />
                  </div>
                  <div className="mb-2 text-[11px] font-mono tracking-[0.24em] uppercase text-white/60">
                    Intake received
                  </div>
                  <h1 className="text-3xl font-extrabold uppercase tracking-tight mb-3 text-white">
                    Request received
                  </h1>
                  <p className="text-white/70 leading-relaxed mb-8">
                    Thanks{form.name ? `, ${form.name.split(" ")[0]}` : ""}.
                    We'll review your intake and reach out at{" "}
                    <span className="text-primary">{form.email}</span> within
                    two business days. Invites are issued in small cohorts.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      variant="outline"
                      className="!border-white/20 !bg-white/5 !text-white hover:!bg-white/10"
                      onClick={() => {
                        setForm(EMPTY);
                        setSuccess(false);
                      }}
                    >
                      Submit another
                    </Button>
                    <Button
                      onClick={() => setLocation("/pricing")}
                      className="!bg-gradient-to-r !from-[#3FB1F0] !to-[#7C7BF7] hover:!opacity-95 !text-white"
                    >
                      See pricing
                    </Button>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center text-[10px] tracking-[0.2em] uppercase font-mono text-white/35">
                Encrypted · Invite-only · No spam
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      <HuskyBackdrop />

      {/* Content layer */}
      <div className="relative z-10 flex min-h-screen flex-col">
        <PageHeader />
        <MobileHuskyHero />

        {/* Main grid: headline left, glass form card right (stacks on mobile) */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_minmax(480px,1fr)] items-start gap-6 lg:gap-10 px-5 sm:px-8 lg:px-12 pb-10 lg:pb-16 pt-6 lg:pt-12">
          {/* Headline glass card */}
          <div className="order-1 lg:order-1 w-full max-w-xl lg:sticky lg:top-12">
            <div
              className="relative rounded-[28px] p-5 sm:p-7 lg:p-8 overflow-hidden"
              style={GLASS_CARD_STYLE}
            >
              {/* Top rim highlight */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                }}
              />
              {/* Soft cyan inner glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, hsla(200,95%,60%,0.30) 0%, transparent 70%)",
                  filter: "blur(8px)",
                }}
              />

              <div className="relative">
                <div
                  className="mb-4 text-[11px] sm:text-xs font-mono tracking-[0.28em] uppercase"
                  style={{ color: "hsl(200 95% 70%)" }}
                >
                  Request an invite
                </div>
                <h1
                  className="text-white uppercase font-extrabold leading-[0.95] tracking-tight break-words"
                  style={{
                    fontSize: "clamp(1.5rem, 6vw, 3.75rem)",
                    textShadow: "0 4px 40px rgba(0,0,0,0.45)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Tell us about
                  <br />
                  the system you{" "}
                  <span
                    style={{
                      WebkitTextFillColor: "transparent",
                      WebkitBackgroundClip: "text",
                      backgroundImage:
                        "linear-gradient(135deg, hsl(200 95% 65%) 0%, hsl(254 95% 78%) 100%)",
                    }}
                  >
                    need built
                  </span>
                </h1>
                <p className="mt-5 max-w-md text-base sm:text-lg leading-relaxed text-white/75">
                  Machinedog.Dev is invite-only. Five quick questions help us
                  decide whether we're the right shop for your project — and
                  how fast we can get back to you.
                </p>
              </div>
            </div>
          </div>

          {/* Apple-style glass intake form card */}
          <div className="order-2 lg:order-2 w-full max-w-2xl mx-auto lg:mx-0 lg:ml-auto">
            <form
              onSubmit={handleSubmit}
              className="relative rounded-[28px] p-6 sm:p-8 overflow-hidden space-y-7"
              style={GLASS_CARD_STYLE}
            >
              {/* Top rim highlight */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                }}
              />
              {/* Soft cyan inner glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, hsla(200,95%,60%,0.35) 0%, transparent 70%)",
                  filter: "blur(8px)",
                }}
              />

              <div className="relative space-y-7">
                <div>
                  <div className="mb-1 text-[11px] font-mono tracking-[0.24em] uppercase text-white/60">
                    Intake form
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                    Five quick questions
                  </h2>
                </div>

                {/* Contact info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="name"
                      className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60"
                    >
                      Your name
                    </Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      required
                      placeholder="Jane Doe"
                      autoComplete="name"
                      className={GLASS_INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60"
                    >
                      Work email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      required
                      placeholder="you@company.com"
                      autoComplete="email"
                      className={GLASS_INPUT_CLASS}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="company"
                    className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60"
                  >
                    Company{" "}
                    <span className="opacity-60 normal-case tracking-normal text-[10px]">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="company"
                    value={form.company}
                    onChange={(e) => update("company", e.target.value)}
                    placeholder="Acme Inc."
                    autoComplete="organization"
                    className={GLASS_INPUT_CLASS}
                  />
                </div>

                <div className="border-t border-white/10" />

                {/* Q1 */}
                <div className="space-y-2">
                  <Label htmlFor="projectDescription" className="block">
                    <span className="text-primary font-mono text-xs mr-2">
                      01
                    </span>
                    <span className="text-base font-semibold text-white">
                      What system are you trying to build?
                    </span>
                  </Label>
                  <Textarea
                    id="projectDescription"
                    value={form.projectDescription}
                    onChange={(e) =>
                      update("projectDescription", e.target.value)
                    }
                    required
                    minLength={20}
                    rows={4}
                    placeholder="Internal tool? Customer-facing AI feature? Replatform? Tell us the goal in your own words."
                    className={GLASS_INPUT_CLASS}
                  />
                </div>

                {/* Q2 */}
                <div className="space-y-2">
                  <Label htmlFor="timeline" className="block">
                    <span className="text-primary font-mono text-xs mr-2">
                      02
                    </span>
                    <span className="text-base font-semibold text-white">
                      What's your timeline?
                    </span>
                  </Label>
                  <Select
                    value={form.timeline}
                    onValueChange={(v) => update("timeline", v)}
                  >
                    <SelectTrigger
                      id="timeline"
                      className="!bg-white/5 !border-white/15 !text-white !backdrop-blur"
                    >
                      <SelectValue placeholder="Pick one" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMELINE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Q3 */}
                <div className="space-y-2">
                  <Label htmlFor="budget" className="block">
                    <span className="text-primary font-mono text-xs mr-2">
                      03
                    </span>
                    <span className="text-base font-semibold text-white">
                      What's your budget range?
                    </span>
                  </Label>
                  <Select
                    value={form.budget}
                    onValueChange={(v) => update("budget", v)}
                  >
                    <SelectTrigger
                      id="budget"
                      className="!bg-white/5 !border-white/15 !text-white !backdrop-blur"
                    >
                      <SelectValue placeholder="Pick a range" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUDGET_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-white/55">
                    Honesty here gets you the right call. We'll tell you if
                    we're not a fit.
                  </p>
                </div>

                {/* Q4 */}
                <div className="space-y-2">
                  <Label htmlFor="successCriteria" className="block">
                    <span className="text-primary font-mono text-xs mr-2">
                      04
                    </span>
                    <span className="text-base font-semibold text-white">
                      What does success look like?
                    </span>
                  </Label>
                  <Textarea
                    id="successCriteria"
                    value={form.successCriteria}
                    onChange={(e) => update("successCriteria", e.target.value)}
                    required
                    minLength={10}
                    rows={3}
                    placeholder="One specific outcome that would make this a clear win — a metric, a launch, a deal closed."
                    className={GLASS_INPUT_CLASS}
                  />
                </div>

                {/* Q5 */}
                <div className="space-y-2">
                  <Label htmlFor="referralSource" className="block">
                    <span className="text-primary font-mono text-xs mr-2">
                      05
                    </span>
                    <span className="text-base font-semibold text-white">
                      How did you hear about Machinedog.Dev?
                    </span>
                  </Label>
                  <Input
                    id="referralSource"
                    value={form.referralSource}
                    onChange={(e) => update("referralSource", e.target.value)}
                    placeholder="Referral, search, social, conference…"
                    className={GLASS_INPUT_CLASS}
                  />
                </div>

                {error && (
                  <div
                    className="rounded-lg p-3 text-sm"
                    style={{
                      background: "hsla(0,75%,55%,0.12)",
                      border: "1px solid hsla(0,75%,55%,0.4)",
                      color: "hsl(0 90% 85%)",
                    }}
                  >
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting}
                  className="w-full font-bold uppercase tracking-wider !bg-gradient-to-r !from-[#3FB1F0] !to-[#7C7BF7] hover:!opacity-95 !text-white !shadow-lg !shadow-primary/30"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    "Request invite"
                  )}
                </Button>
                <p className="text-[11px] text-center text-white/55">
                  By submitting, you agree to be contacted about your inquiry.
                  We don't share your information.
                </p>
              </div>
            </form>

            {/* Tiny legal/foot caption beneath card */}
            <p className="mt-4 text-center text-[10px] tracking-[0.2em] uppercase font-mono text-white/35">
              Encrypted · Invite-only · No spam
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
