import { useState } from "react";
import { Link } from "wouter";
import {
  useSubmitLead,
  useCreateBuildCheckout,
  useCreateRetainerCheckout,
  useCreatePortalCheckout,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import {
  ArrowRight,
  Check,
  Sparkles,
  Workflow,
  Zap,
  Shield,
  Database,
  Smartphone,
  CreditCard,
  Users,
  Rocket,
  TrendingUp,
  Calendar,
  Mail,
  MessageSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import huskyImg from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777251779783.png";
import huskyMark from "@assets/generated_images/husky_mark.png";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const premiumFeatures: Array<{ icon: React.ElementType; label: string }> = [
  { icon: Rocket, label: "Custom app or website (fully built)" },
  { icon: Database, label: "Backend + database integration" },
  { icon: Shield, label: "User authentication system" },
  { icon: Workflow, label: "Admin dashboard" },
  { icon: Sparkles, label: "AI-powered workflows (Machinedog AI integration)" },
  { icon: CreditCard, label: "Payment system integration (Stripe or equivalent)" },
  { icon: Zap, label: "Automation workflows (lead → conversion → fulfillment)" },
  { icon: Smartphone, label: "Mobile + desktop optimized UI" },
  { icon: Rocket, label: "Deployment + launch support" },
];

const retainerFeatures = [
  "Ongoing feature updates",
  "AI prompt tuning & optimization",
  "Performance monitoring & improvements",
  "Bug fixes and system support",
  "Continuous enhancements based on usage",
];

const addOns = [
  { label: "Additional integrations", price: "$2,000 – $5,000" },
  { label: "Advanced AI agents", price: "$3,000 – $10,000" },
  { label: "Mobile app version", price: "$5,000 – $15,000" },
  { label: "White-label SaaS setup", price: "$10,000+" },
];

export default function PricingPage() {
  const [contact, setContact] = useState({
    name: "",
    email: "",
    company: "",
    notes: "",
    website: "", // honeypot — must stay empty
  });
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const submitLead = useSubmitLead();
  const buildCheckout = useCreateBuildCheckout();
  const retainerCheckout = useCreateRetainerCheckout();

  function describeCheckoutError(err: unknown): string {
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? (err as { status?: number }).status
        : undefined;
    const data =
      typeof err === "object" && err !== null && "data" in err
        ? (err as { data?: { error?: string } }).data
        : undefined;
    if (status === 503) {
      return (
        data?.error ??
        "Payments aren't connected yet. Reach out and we'll set you up directly."
      );
    }
    if (status === 429) {
      return "Too many checkout attempts. Please try again in a moment.";
    }
    return (
      data?.error ??
      "We couldn't start checkout. Please try again or email hello@machinedog.dev."
    );
  }

  function startBuildCheckout() {
    setCheckoutError(null);
    buildCheckout.mutate(
      { data: { source: "pricing-page" } },
      {
        onSuccess: (res) => {
          if (res?.url) {
            window.location.href = res.url;
          } else {
            setCheckoutError("Checkout could not be opened. Please try again.");
          }
        },
        onError: (err: unknown) => setCheckoutError(describeCheckoutError(err)),
      },
    );
  }

  function startRetainerCheckout() {
    setCheckoutError(null);
    retainerCheckout.mutate(
      { data: { source: "pricing-page" } },
      {
        onSuccess: (res) => {
          if (res?.url) {
            window.location.href = res.url;
          } else {
            setCheckoutError("Checkout could not be opened. Please try again.");
          }
        },
        onError: (err: unknown) => setCheckoutError(describeCheckoutError(err)),
      },
    );
  }

  const buildPending = buildCheckout.isPending;
  const retainerPending = retainerCheckout.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    submitLead.mutate(
      {
        data: {
          name: contact.name.trim(),
          email: contact.email.trim(),
          company: contact.company.trim() || null,
          notes: contact.notes.trim() || null,
          source: "pricing-page",
          website: contact.website,
        },
      },
      {
        onSuccess: () => {
          setSubmitted(true);
        },
        onError: (err: unknown) => {
          const status =
            typeof err === "object" && err !== null && "status" in err
              ? (err as { status?: number }).status
              : undefined;
          if (status === 429) {
            setErrorMessage(
              "You've sent a few requests already — please try again in a little while.",
            );
          } else {
            setErrorMessage(
              "Something went wrong sending your message. Please try again or email hello@machinedog.dev.",
            );
          }
        },
      },
    );
  }

  return (
    <div
      className="dark min-h-screen text-white relative overflow-x-hidden"
      style={{ background: "hsl(220 40% 3%)" }}
    >
      {/* Ambient brand backdrop */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 800px at 80% -10%, hsla(254,95%,75%,0.22), transparent 60%), radial-gradient(900px 700px at -10% 30%, hsla(200,90%,60%,0.22), transparent 55%), radial-gradient(700px 500px at 50% 110%, hsla(200,90%,60%,0.12), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(hsla(0,0%,100%,0.25) 1px, transparent 1px), linear-gradient(90deg, hsla(0,0%,100%,0.25) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Top nav */}
      <nav className="relative z-10 max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-10 py-5">
        <Link href="/" className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-primary bg-[hsl(220,40%,4%)] flex items-center justify-center"
            style={{ boxShadow: "0 0 20px hsla(200,90%,60%,0.55)" }}
          >
            <img
              src={huskyMark}
              alt="Machinedog husky logo"
              className="w-full h-full object-contain p-0.5"
            />
          </div>
          <span className="font-extrabold tracking-[0.2em] text-sm sm:text-base">
            MACHINEDOG<span className="text-primary">.DEV</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a
            href="#pricing"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("pricing");
            }}
            className="hover:text-foreground transition"
          >
            Pricing
          </a>
          <a
            href="#retainer"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("retainer");
            }}
            className="hover:text-foreground transition"
          >
            Retainer
          </a>
          <a
            href="#addons"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("addons");
            }}
            className="hover:text-foreground transition"
          >
            Add-ons
          </a>
          <a
            href="#contact"
            onClick={(e) => {
              e.preventDefault();
              scrollToId("contact");
            }}
            className="hover:text-foreground transition"
          >
            Contact
          </a>
        </div>

        <Link
          href="/sign-in"
          className="font-mono text-xs tracking-widest text-muted-foreground hover:text-foreground transition px-3 py-2"
        >
          CLIENT LOGIN
        </Link>
      </nav>

      {/* HERO */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pt-8 pb-20 lg:pt-12 lg:pb-28">
        {/* Mobile: husky as full-bleed backdrop. Desktop: husky on the right. */}
        <div className="relative grid lg:grid-cols-12 gap-10 lg:gap-6 items-center">
          {/* Husky portrait — mobile background */}
          <div className="absolute inset-0 lg:hidden -z-0 pointer-events-none overflow-hidden rounded-3xl">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${huskyImg})`,
                backgroundSize: "cover",
                backgroundPosition: "50% 35%",
                opacity: 0.5,
                filter: "saturate(1.15) contrast(1.05)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(70% 60% at 50% 45%, transparent 0%, hsla(220,40%,3%,0.85) 80%), linear-gradient(180deg, hsla(220,40%,3%,0.4) 0%, hsla(220,40%,3%,0.95) 100%)",
              }}
            />
          </div>

          {/* Text column */}
          <div className="relative z-10 lg:col-span-7">
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-7"
              style={{
                background: "hsla(200,90%,60%,0.08)",
                border: "1px solid hsla(200,90%,60%,0.35)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] font-mono tracking-[0.22em] text-primary">
                WEB · APP · AI SYSTEM DEVELOPMENT
              </span>
            </div>

            <h1
              className="text-headline uppercase font-extrabold leading-[0.92] tracking-tight mb-7 text-white"
              style={{
                fontSize: "clamp(2.75rem, 7vw, 5.75rem)",
                textShadow: "0 2px 30px hsla(220,40%,3%,0.6)",
              }}
            >
              We Build
              <br />
              the{" "}
              <span
                className="text-gradient-cyber"
                style={{
                  WebkitTextFillColor: "transparent",
                  WebkitBackgroundClip: "text",
                  backgroundImage:
                    "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                }}
              >
                System
              </span>
              <br />
              Your Business
              <br />
              Runs On.
            </h1>

            <p className="text-base sm:text-lg text-white/70 max-w-xl mb-9 leading-relaxed">
              Machinedog.Dev is a private engineering atelier building bold custom
              AI-powered apps, websites, and automations for businesses ready to
              replace manual work with revenue-generating systems.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                onClick={() => scrollToId("pricing")}
                className="h-14 px-8 text-sm tracking-wider font-bold text-white border-0"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                  boxShadow:
                    "0 12px 40px -10px hsla(200,90%,60%,0.7), 0 0 0 1px hsla(200,90%,60%,0.4) inset",
                }}
              >
                START YOUR PROJECT
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => scrollToId("pricing")}
                className="h-14 px-8 text-sm tracking-wider font-bold bg-transparent text-white"
                style={{
                  border: "1px solid hsla(0,0%,100%,0.25)",
                }}
              >
                VIEW OUR WORK
              </Button>
            </div>

            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-2xl">
              {[
                { value: "4–8 wk", label: "Avg delivery" },
                { value: "100%", label: "Owned by you" },
                { value: "AI-native", label: "Built-in agents" },
                { value: "24/7", label: "Production-grade" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: "hsla(0,0%,100%,0.04)",
                    border: "1px solid hsla(0,0%,100%,0.08)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div className="text-xl sm:text-2xl font-extrabold text-gradient-cyber">
                    {s.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-white/55 mt-1">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Husky portrait — desktop right column */}
          <div className="relative z-10 hidden lg:block lg:col-span-5">
            <div className="relative aspect-[4/5] w-full">
              {/* Outer glow */}
              <div
                aria-hidden
                className="absolute -inset-6 rounded-full blur-3xl opacity-70"
                style={{
                  background:
                    "radial-gradient(circle at 50% 45%, hsla(200,90%,60%,0.55), hsla(254,95%,75%,0.35) 45%, transparent 70%)",
                }}
              />
              {/* Cropped husky portrait */}
              <div
                className="relative w-full h-full overflow-hidden rounded-[28px]"
                style={{
                  border: "1px solid hsla(200,90%,60%,0.25)",
                  boxShadow:
                    "0 0 80px -20px hsla(200,90%,60%,0.55), inset 0 0 80px hsla(220,40%,3%,0.6)",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${huskyImg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "50% 30%",
                    filter: "saturate(1.15) contrast(1.05)",
                  }}
                />
                {/* Subtle vignette to soften edges */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(75% 75% at 50% 45%, transparent 55%, hsla(220,40%,3%,0.7) 100%)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* PRICING — Premium Build Starter */}
      <section id="pricing" className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pb-16 lg:pb-24">
        <div className="text-center mb-12">
          <div className="text-eyebrow text-primary mb-3">— PREMIUM ENGAGEMENT —</div>
          <h2 className="text-headline text-4xl sm:text-5xl lg:text-6xl tracking-tight">
            One build. Your entire system.
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            A single fixed-scope engagement that delivers your full product —
            backend, frontend, AI, automations, and launch.
          </p>
        </div>

        <div className="relative max-w-4xl mx-auto">
          {/* Outer glow */}
          <div
            aria-hidden
            className="absolute -inset-1 rounded-[28px] blur-2xl opacity-60"
            style={{
              background:
                "linear-gradient(135deg, hsla(200,90%,60%,0.55), hsla(254,95%,75%,0.55))",
            }}
          />
          {/* Card */}
          <div className="relative glass-strong rounded-[24px] p-8 sm:p-10 lg:p-12 overflow-hidden">
            {/* Featured badge */}
            <div className="absolute top-6 right-6">
              <div
                className="text-[10px] font-mono tracking-[0.22em] px-3 py-1.5 rounded-full text-white"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                }}
              >
                FEATURED
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
              <div>
                <div className="text-eyebrow text-primary mb-2">
                  PREMIUM BUILD STARTER
                </div>
                <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
                  Complete Business System Build
                </h3>
                <p className="text-muted-foreground max-w-xl">
                  Everything you need to launch a production-ready, revenue-generating
                  product — designed, built, and shipped by us.
                </p>
              </div>

              <div className="text-left lg:text-right">
                <div className="flex items-baseline gap-2 lg:justify-end">
                  <span className="text-5xl sm:text-6xl font-extrabold tracking-tight text-gradient-cyber">
                    $25,000
                  </span>
                </div>
                <div className="text-xs font-mono tracking-widest text-muted-foreground mt-2">
                  ONE-TIME · 4–8 WEEK DELIVERY
                </div>
              </div>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-foreground/15 to-transparent mb-8" />

            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mb-10">
              {premiumFeatures.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{
                      background:
                        "linear-gradient(135deg, hsla(200,90%,60%,0.18), hsla(254,95%,75%,0.18))",
                    }}
                  >
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-sm sm:text-[15px] leading-snug">{f.label}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 text-primary" />
                <span>
                  <span className="text-foreground font-semibold">4–8 Week</span>{" "}
                  delivery timeline
                </span>
              </div>
              <Button
                size="lg"
                onClick={startBuildCheckout}
                disabled={buildPending}
                className="h-12 px-8 text-sm tracking-wider font-bold"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                  boxShadow: "0 10px 30px -10px hsla(200,90%,60%,0.55)",
                }}
              >
                {buildPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    OPENING CHECKOUT…
                  </>
                ) : (
                  <>
                    START YOUR BUILD
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {checkoutError && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <span>{checkoutError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutError(null);
                    scrollToId("contact");
                  }}
                  className="font-mono text-xs tracking-widest text-red-100 hover:text-white underline underline-offset-4"
                >
                  CONTACT US INSTEAD →
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* PORTAL ACCESS */}
      <section id="portal-access" className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="glass-strong rounded-2xl p-8 sm:p-10 flex flex-col lg:flex-row gap-8 lg:items-center lg:justify-between">
            <div className="flex-1">
              <div className="text-eyebrow text-primary mb-2">PORTAL ACCESS</div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                Machinedog.Dev Portal Membership
              </h3>
              <p className="text-muted-foreground max-w-xl mb-4">
                Your private workspace to run Machinedog prompts, attach the projects we build for
                you (e.g. BeeSuite.farm), and invite your own clients to collaborate.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                  <span>Unlimited project workspaces with per-project client invites</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                  <span>Tokens billed separately as bundles (use what you need)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                  <span>Optional consulting hours (purchase any package, anytime)</span>
                </li>
              </ul>
            </div>
            <div className="lg:w-72 lg:shrink-0">
              <div className="rounded-2xl glass p-6 text-center">
                <div className="text-eyebrow text-muted-foreground mb-3">MEMBERSHIP</div>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-extrabold tracking-tight text-gradient-cyber">
                    $500
                  </span>
                  <span className="text-base text-muted-foreground">/mo</span>
                </div>
                <div className="text-xs font-mono tracking-widest text-muted-foreground mt-2">
                  TOKENS &amp; CONSULTING SOLD SEPARATELY
                </div>
                <PortalCheckoutButton />
                <Link href="/intake">
                  <Button
                    variant="ghost"
                    className="w-full mt-2 h-9 text-xs tracking-wider font-mono text-muted-foreground"
                  >
                    OR REQUEST INVITE
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RETAINER */}
      <section id="retainer" className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pb-20 lg:pb-28">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-px rounded-[22px] opacity-80"
              style={{
                background:
                  "linear-gradient(135deg, hsla(200,90%,60%,0.45), hsla(254,95%,75%,0.45))",
              }}
            />
            <div className="relative glass-strong rounded-[20px] p-8 sm:p-10">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-eyebrow text-primary">REQUIRED RETAINER</span>
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
                    Growth &amp; Optimization Retainer
                  </h3>
                  <p className="text-muted-foreground max-w-xl mb-6">
                    Required to maintain and improve your system after launch.
                  </p>

                  <ul className="space-y-3">
                    {retainerFeatures.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm sm:text-[15px]">
                        <Check className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div
                    className="mt-6 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground/90"
                  >
                    This ensures your system continues to improve and adapt as your
                    business grows.
                  </div>
                </div>

                <div className="lg:w-80 lg:shrink-0">
                  <div className="rounded-2xl glass p-6 text-center">
                    <div className="text-eyebrow text-muted-foreground mb-3">
                      MONTHLY
                    </div>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-5xl font-extrabold tracking-tight text-gradient-cyber">
                        $1,200
                      </span>
                      <span className="text-base text-muted-foreground">/mo</span>
                    </div>
                    <div className="text-xs font-mono tracking-widest text-muted-foreground mt-2">
                      BILLED MONTHLY
                    </div>
                    <Button
                      onClick={startRetainerCheckout}
                      disabled={retainerPending}
                      className="w-full mt-6 h-11 text-sm tracking-wider font-bold"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                      }}
                    >
                      {retainerPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          OPENING CHECKOUT…
                        </>
                      ) : (
                        "INCLUDE RETAINER"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* POSITIONING */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 lg:px-10 pb-20 lg:pb-28">
        <div className="text-center">
          <div className="text-eyebrow text-primary mb-6">— OUR POSITIONING —</div>
          <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight">
            We don&apos;t build websites.{" "}
            <span className="text-gradient-cyber">
              We build automated systems
            </span>{" "}
            that replace manual work and create scalable revenue streams.
          </p>
        </div>
      </section>

      {/* ADD-ONS */}
      <section id="addons" className="relative z-10 max-w-5xl mx-auto px-6 lg:px-10 pb-20 lg:pb-28">
        <div className="text-center mb-10">
          <div className="text-eyebrow text-primary mb-3">— OPTIONAL ADD-ONS —</div>
          <h2 className="text-headline text-3xl sm:text-4xl tracking-tight">
            Extend the system as you grow
          </h2>
        </div>

        <div className="glass-strong rounded-2xl divide-y divide-foreground/10 overflow-hidden">
          {addOns.map((a) => (
            <div
              key={a.label}
              className="flex items-center justify-between gap-4 px-6 py-5 hover:bg-foreground/[0.03] transition"
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(200 90% 60%), hsl(254 95% 75%))",
                  }}
                />
                <span className="font-semibold">{a.label}</span>
              </div>
              <span className="font-mono text-sm sm:text-base text-foreground/90">
                {a.price}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA + CONTACT */}
      <section id="contact" className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 pb-28">
        <div className="grid lg:grid-cols-2 gap-10 items-stretch">
          <div className="flex flex-col justify-center">
            <div className="text-eyebrow text-primary mb-4">— READY WHEN YOU ARE —</div>
            <h2 className="text-headline text-4xl sm:text-5xl lg:text-6xl leading-[0.95] tracking-tight mb-6">
              Ready to Build
              <br />
              <span className="text-gradient-cyber">Your System?</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-md mb-8">
              Tell us about your business. We&apos;ll come back within 24 hours with a
              scoped plan and timeline.
            </p>

            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md glass-subtle">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <span>Direct access to a senior team — no account managers.</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md glass-subtle">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <span>AI agents and automations engineered into your stack.</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md glass-subtle">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <span>Production-grade auth, billing, and observability from day one.</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-1 rounded-[24px] blur-2xl opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, hsla(200,90%,60%,0.45), hsla(254,95%,75%,0.45))",
              }}
            />
            <form
              onSubmit={handleSubmit}
              className="relative glass-strong rounded-2xl p-6 sm:p-8 space-y-5"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-eyebrow text-primary">SCHEDULE A CALL</span>
              </div>

              {submitted ? (
                <div className="py-10 text-center">
                  <div
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                    }}
                  >
                    <Check className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-2xl font-extrabold mb-2">Got it.</h3>
                  <p className="text-muted-foreground">
                    We&apos;ll be in touch at{" "}
                    <span className="text-foreground font-semibold">
                      {contact.email || "your inbox"}
                    </span>{" "}
                    within 24 hours.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-[11px] font-mono tracking-widest text-muted-foreground">
                        NAME
                      </span>
                      <input
                        required
                        value={contact.name}
                        onChange={(e) =>
                          setContact({ ...contact, name: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg glass-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                        placeholder="Jane Doe"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-mono tracking-widest text-muted-foreground">
                        COMPANY
                      </span>
                      <input
                        value={contact.company}
                        onChange={(e) =>
                          setContact({ ...contact, company: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg glass-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                        placeholder="Acme, Inc."
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-mono tracking-widest text-muted-foreground">
                      EMAIL
                    </span>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        required
                        type="email"
                        value={contact.email}
                        onChange={(e) =>
                          setContact({ ...contact, email: e.target.value })
                        }
                        className="w-full rounded-lg glass-input pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
                        placeholder="you@company.com"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-mono tracking-widest text-muted-foreground">
                      WHAT DO YOU WANT TO BUILD?
                    </span>
                    <textarea
                      rows={4}
                      value={contact.notes}
                      onChange={(e) =>
                        setContact({ ...contact, notes: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg glass-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60 resize-none"
                      placeholder="A brief description of the system, automations, or AI features you need."
                    />
                  </label>

                  {/* Honeypot — hidden from real users; bots will fill it. */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: "-10000px",
                      width: "1px",
                      height: "1px",
                      overflow: "hidden",
                    }}
                  >
                    <label>
                      Website
                      <input
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={contact.website}
                        onChange={(e) =>
                          setContact({ ...contact, website: e.target.value })
                        }
                      />
                    </label>
                  </div>

                  {errorMessage && (
                    <p className="text-sm text-red-400" role="alert">
                      {errorMessage}
                    </p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitLead.isPending}
                    className="w-full h-12 text-sm tracking-wider font-bold"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                      boxShadow: "0 10px 30px -10px hsla(200,90%,60%,0.55)",
                    }}
                  >
                    {submitLead.isPending ? "SENDING…" : "SCHEDULE A CALL"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    No spam. Replies from a real engineer within 24 hours.
                  </p>
                </>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-primary/60 bg-[hsl(220,40%,4%)]">
              <img
                src={huskyImg}
                alt=""
                className="w-full h-full object-cover"
                style={{ objectPosition: "50% 30%" }}
              />
            </div>
            <span className="font-mono tracking-widest text-xs">
              MACHINEDOG.DEV · CUSTOM AI SYSTEMS
            </span>
          </div>
          <div className="text-xs">
            © {new Date().getFullYear()} Machinedog.Dev. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

function PortalCheckoutButton() {
  const { client, isLoading } = useAuth();
  const isSignedIn = !!client;
  const isLoaded = !isLoading;
  const { data: me } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), enabled: !!isSignedIn, retry: false },
  });
  const checkout = useCreatePortalCheckout();
  const { toast } = useToast();

  const isActive =
    me?.portalSubscriptionStatus === "active" || me?.portalSubscriptionStatus === "trialing";

  const handleClick = () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      window.location.href = "/sign-in?redirect_url=/pricing#portal-access";
      return;
    }
    checkout.mutate(undefined, {
      onSuccess: (data) => {
        if (data?.url) {
          window.location.href = data.url;
        }
      },
      onError: (err: unknown) => {
        const msg =
          err && typeof err === "object" && "data" in err
            ? ((err as { data?: { error?: string } }).data?.error ?? "Could not start checkout")
            : "Could not start checkout";
        toast({ variant: "destructive", title: "Checkout failed", description: msg });
      },
    });
  };

  if (isActive) {
    return (
      <Link href="/projects">
        <Button
          className="w-full mt-6 h-11 text-sm tracking-wider font-bold"
          style={{
            background:
              "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
          }}
        >
          OPEN YOUR PORTAL
        </Button>
      </Link>
    );
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={checkout.isPending || !isLoaded}
      className="w-full mt-6 h-11 text-sm tracking-wider font-bold"
      style={{
        background: "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
      }}
    >
      {checkout.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> REDIRECTING…
        </>
      ) : (
        <>START PORTAL ACCESS</>
      )}
    </Button>
  );
}
