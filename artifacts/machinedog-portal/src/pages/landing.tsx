import { Link } from "wouter";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Cpu,
  Workflow,
  Coins,
  Github,
} from "lucide-react";

const FEATURES = [
  {
    icon: Cpu,
    title: "Talk to your codebase",
    body: "Describe a change in plain English. Machinedog distills it, opens a PR, and lets you publish when you're ready.",
  },
  {
    icon: Workflow,
    title: "GitHub-native",
    body: "Every change is a real branch and a real PR. No vendor-lock workspace. Snapshot, preview, merge, deploy.",
  },
  {
    icon: Coins,
    title: "Pay only for what you build",
    body: "Per-token billing for prompts and builds. Subscription plans renew tokens monthly; top-ups available any time.",
  },
  {
    icon: ShieldCheck,
    title: "Healthcare-ready",
    body: "MVP runs in a no-PHI mode by default. HIPAA mode and BAA available on the Healthcare plan.",
  },
];

const STARTERS = [
  "Patient intake portal",
  "Internal dashboard",
  "Booking & payments",
  "AI chat assistant",
  "Marketing site",
  "Mobile companion",
];

export default function LandingPage() {
  const { isSignedIn, member } = useAuth();
  return (
    <div className="dark min-h-screen w-full text-white" style={{ background: "hsl(220 45% 3%)" }}>
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(900px 700px at 80% -10%, hsla(254,95%,75%,0.18), transparent 60%), radial-gradient(700px 600px at -10% 30%, hsla(200,90%,60%,0.18), transparent 55%)",
        }}
      />

      <header className="flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
        <nav className="hidden md:flex items-center gap-6 text-sm text-white/70">
          <Link href="/templates" className="hover:text-white">Templates</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          {isSignedIn ? (
            <>
              <span className="text-white/60 text-xs font-mono" data-testid="text-landing-signed-in-email">
                {member?.email}
              </span>
              <Link href="/dashboard">
                <Button
                  className="h-9 px-4 text-xs font-bold border-0 text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                  }}
                  data-testid="button-landing-dashboard"
                >
                  Open dashboard
                  <ArrowRight className="h-3.5 w-3.5 ml-2" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="hover:text-white">Sign in</Link>
              <Link href="/sign-up">
                <Button
                  className="h-9 px-4 text-xs font-bold border-0 text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                  }}
                  data-testid="button-landing-signup"
                >
                  Get started
                  <ArrowRight className="h-3.5 w-3.5 ml-2" />
                </Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="px-5 sm:px-8 lg:px-12">
        <section className="max-w-5xl mx-auto pt-20 sm:pt-28 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-widest text-primary"
               style={{ background: "rgba(63,177,240,0.12)", border: "1px solid rgba(63,177,240,0.3)" }}>
            <Sparkles className="h-3 w-3" />
            Build software the way you talk
          </div>
          <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight">
            Your AI engineering partner.
            <br />
            <span style={{
              background: "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Plain English in, real PRs out.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-white/70">
            Machinedog turns product requests into reviewed pull requests on
            your own GitHub repo. Snapshot, preview, publish — without the
            vendor-locked workspace.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/sign-up">
              <Button
                className="h-12 px-6 text-sm font-bold border-0 text-white"
                style={{
                  background: "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                }}
                data-testid="button-landing-cta-primary"
              >
                Start free
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                variant="ghost"
                className="h-12 px-6 text-sm font-bold text-white/80 hover:text-white"
                data-testid="button-landing-cta-pricing"
              >
                See pricing
              </Button>
            </Link>
          </div>
          <div className="mt-3 text-[11px] font-mono uppercase tracking-widest text-white/40">
            No credit card · GitHub repo optional · MVP runs in no-PHI mode
          </div>
        </section>

        <section className="max-w-6xl mx-auto pb-20">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl p-5"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{
                      background:
                        "linear-gradient(135deg, hsla(200,90%,60%,0.2), hsla(254,95%,75%,0.2))",
                    }}
                  >
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <div className="mt-3 text-sm font-bold text-white">{f.title}</div>
                  <div className="text-[13px] text-white/65 mt-1.5 leading-relaxed">{f.body}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="max-w-5xl mx-auto pb-20">
          <div className="rounded-3xl p-8 sm:p-12"
               style={{
                 background: "rgba(255,255,255,0.04)",
                 border: "1px solid rgba(255,255,255,0.10)",
               }}>
            <div className="flex items-center gap-2 mb-4">
              <Github className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-mono uppercase tracking-[0.22em] text-primary">
                Starter templates
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Start from a template, not a blank repo.
            </h2>
            <p className="text-white/65 mt-3 max-w-xl">
              Thirteen production-quality starters across web, mobile, and
              healthcare workflows. Each one ships with auth, CI, and a clear
              file structure so the AI has somewhere to start.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <span
                  key={s}
                  className="text-[12px] px-3 py-1.5 rounded-full text-white/80"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="mt-7">
              <Link href="/templates">
                <Button
                  variant="ghost"
                  className="h-10 px-4 text-xs font-bold uppercase tracking-widest text-primary hover:text-white"
                  data-testid="button-landing-templates"
                >
                  Browse all templates
                  <ArrowRight className="h-3.5 w-3.5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-10 px-5 sm:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span>© {new Date().getFullYear()} Machinedog</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="hover:text-white/70">Pricing</Link>
            <Link href="/templates" className="hover:text-white/70">Templates</Link>
            <Link href="/sign-in" className="hover:text-white/70">Sign in</Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/70">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
