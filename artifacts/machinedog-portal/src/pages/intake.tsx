import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, ArrowLeft, Check } from "lucide-react";
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
import huskyMark from "@assets/generated_images/husky_mark.png";

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
      <div className="dark min-h-screen bg-[hsl(220,40%,3%)] text-foreground flex items-center justify-center p-6 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(900px 700px at 50% 35%, hsla(200,90%,60%,0.18), transparent 60%), radial-gradient(700px 500px at 80% 90%, hsla(254,95%,75%,0.14), transparent 60%)",
          }}
        />
        <div
          className="relative z-10 max-w-lg w-full text-center rounded-2xl p-10"
          style={{
            background:
              "linear-gradient(180deg, hsla(220,40%,8%,0.85) 0%, hsla(220,40%,5%,0.95) 100%)",
            border: "1px solid hsla(200,90%,60%,0.25)",
            boxShadow: "0 0 60px hsla(200,90%,60%,0.18)",
          }}
        >
          <div
            className="h-16 w-16 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, hsl(200 90% 60%), hsl(254 95% 75%))",
              boxShadow: "0 0 32px hsla(200,90%,60%,0.55)",
            }}
          >
            <Check className="h-8 w-8 text-white" strokeWidth={3} />
          </div>
          <h1 className="text-3xl font-extrabold uppercase tracking-tight mb-3">
            Request received
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-8">
            Thanks{form.name ? `, ${form.name.split(" ")[0]}` : ""}. We'll
            review your intake and reach out at{" "}
            <span className="text-primary">{form.email}</span> within two
            business days. Invites are issued in small cohorts.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setForm(EMPTY);
                setSuccess(false);
              }}
            >
              Submit another
            </Button>
            <Button onClick={() => setLocation("/pricing")}>
              See pricing
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-[hsl(220,40%,3%)] text-foreground relative overflow-hidden">
      {/* Ambient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(900px 700px at 15% 20%, hsla(200,90%,60%,0.14), transparent 60%), radial-gradient(900px 700px at 85% 80%, hsla(254,95%,75%,0.10), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsla(0,0%,100%,0.25) 1px, transparent 1px), linear-gradient(90deg, hsla(0,0%,100%,0.25) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-5 lg:px-8 py-10 lg:py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full overflow-hidden border-2 border-[hsl(var(--primary))] bg-[hsl(220,40%,4%)] flex items-center justify-center"
              style={{
                boxShadow:
                  "0 0 0 1px hsla(200,90%,60%,0.45), 0 0 20px hsla(200,90%,60%,0.45)",
              }}
            >
              <img
                src={huskyMark}
                alt=""
                className="h-full w-full object-contain p-0.5"
              />
            </div>
            <span
              className="text-white"
              style={{
                letterSpacing: "0.16em",
                fontWeight: 800,
                fontSize: "0.95rem",
              }}
            >
              MACHINEDOG.DEV
            </span>
          </div>
        </div>

        {/* Hero copy */}
        <div className="mb-10">
          <div
            className="mb-4 text-xs font-mono tracking-[0.22em] uppercase"
            style={{ color: "hsl(200 90% 65%)" }}
          >
            Request an invite
          </div>
          <h1
            className="uppercase font-extrabold leading-[0.95] tracking-tight"
            style={{ fontSize: "clamp(2rem, 4.5vw, 3.25rem)" }}
          >
            Tell us about
            <br />
            the system you{" "}
            <span
              style={{
                WebkitTextFillColor: "transparent",
                WebkitBackgroundClip: "text",
                backgroundImage:
                  "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
              }}
            >
              need built
            </span>
          </h1>
          <p className="mt-5 text-base text-white/70 leading-relaxed max-w-xl">
            Machinedog.Dev is invite-only. Five quick questions help us decide
            whether we're the right shop for your project — and how fast we
            can get back to you.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 lg:p-8 space-y-7"
          style={{
            background:
              "linear-gradient(180deg, hsla(220,40%,8%,0.85) 0%, hsla(220,40%,5%,0.95) 100%)",
            border: "1px solid hsla(200,90%,60%,0.18)",
            boxShadow: "0 0 60px hsla(200,90%,60%,0.10)",
          }}
        >
          {/* Contact info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs uppercase tracking-widest text-muted-foreground">
                Your name
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-widest text-muted-foreground">
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
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="company" className="text-xs uppercase tracking-widest text-muted-foreground">
              Company <span className="opacity-60 normal-case tracking-normal text-[10px]">(optional)</span>
            </Label>
            <Input
              id="company"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="Acme Inc."
              autoComplete="organization"
            />
          </div>

          <div className="border-t border-white/10 my-2" />

          {/* Q1 */}
          <div className="space-y-2">
            <Label htmlFor="projectDescription" className="block">
              <span className="text-primary font-mono text-xs mr-2">01</span>
              <span className="text-base font-semibold">
                What system are you trying to build?
              </span>
            </Label>
            <Textarea
              id="projectDescription"
              value={form.projectDescription}
              onChange={(e) => update("projectDescription", e.target.value)}
              required
              minLength={20}
              rows={4}
              placeholder="Internal tool? Customer-facing AI feature? Replatform? Tell us the goal in your own words."
            />
          </div>

          {/* Q2 */}
          <div className="space-y-2">
            <Label htmlFor="timeline" className="block">
              <span className="text-primary font-mono text-xs mr-2">02</span>
              <span className="text-base font-semibold">
                What's your timeline?
              </span>
            </Label>
            <Select
              value={form.timeline}
              onValueChange={(v) => update("timeline", v)}
            >
              <SelectTrigger id="timeline">
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
              <span className="text-primary font-mono text-xs mr-2">03</span>
              <span className="text-base font-semibold">
                What's your budget range?
              </span>
            </Label>
            <Select
              value={form.budget}
              onValueChange={(v) => update("budget", v)}
            >
              <SelectTrigger id="budget">
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
            <p className="text-[11px] text-muted-foreground">
              Honesty here gets you the right call. We'll tell you if we're
              not a fit.
            </p>
          </div>

          {/* Q4 */}
          <div className="space-y-2">
            <Label htmlFor="successCriteria" className="block">
              <span className="text-primary font-mono text-xs mr-2">04</span>
              <span className="text-base font-semibold">
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
            />
          </div>

          {/* Q5 */}
          <div className="space-y-2">
            <Label htmlFor="referralSource" className="block">
              <span className="text-primary font-mono text-xs mr-2">05</span>
              <span className="text-base font-semibold">
                How did you hear about Machinedog.Dev?
              </span>
            </Label>
            <Input
              id="referralSource"
              value={form.referralSource}
              onChange={(e) => update("referralSource", e.target.value)}
              placeholder="Referral, search, social, conference…"
            />
          </div>

          {error && (
            <div
              className="rounded-lg p-3 text-sm"
              style={{
                background: "hsla(0,75%,55%,0.12)",
                border: "1px solid hsla(0,75%,55%,0.4)",
                color: "hsl(0 90% 80%)",
              }}
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={submitting}
            className="w-full font-bold uppercase tracking-wider"
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
          <p className="text-[11px] text-center text-muted-foreground">
            By submitting, you agree to be contacted about your inquiry. We
            don't share your information.
          </p>
        </form>
      </div>
    </div>
  );
}
