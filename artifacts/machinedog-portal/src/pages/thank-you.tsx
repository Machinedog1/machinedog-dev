import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";

import huskyMark from "@assets/generated_images/husky_mark.png";

type CheckoutKind = "build" | "retainer";

function useCheckoutKind(): CheckoutKind | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("kind");
    if (kind === "build" || kind === "retainer") return kind;
    return null;
  }, []);
}

export default function ThankYouPage() {
  const kind = useCheckoutKind();

  const headline =
    kind === "retainer"
      ? "Welcome aboard."
      : kind === "build"
        ? "You're in. Let's build."
        : "Thank you.";

  const subline =
    kind === "retainer"
      ? "Your monthly retainer is active. We'll reach out to align on goals and the first month of improvements."
      : kind === "build"
        ? "Your Premium Build deposit is in. Expect an onboarding email within a few hours with kickoff and timeline details."
        : "Your payment was received. We'll be in touch shortly.";

  return (
    <div
      className="dark min-h-screen text-white relative overflow-x-hidden flex flex-col"
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
      <nav className="relative z-10 max-w-7xl w-full mx-auto flex items-center justify-between px-6 lg:px-10 py-5">
        <Link href="/pricing" className="flex items-center gap-3">
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
      </nav>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 lg:px-10 py-16">
        <div className="relative w-full max-w-2xl">
          <div
            aria-hidden
            className="absolute -inset-1 rounded-[28px] blur-2xl opacity-60"
            style={{
              background:
                "linear-gradient(135deg, hsla(200,90%,60%,0.55), hsla(254,95%,75%,0.55))",
            }}
          />
          <div className="relative glass-strong rounded-[24px] p-8 sm:p-12 text-center">
            <div
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                boxShadow: "0 12px 40px -10px hsla(200,90%,60%,0.7)",
              }}
            >
              <Check className="h-8 w-8 text-white" />
            </div>

            <div className="text-eyebrow text-primary mb-3">— PAYMENT RECEIVED —</div>
            <h1 className="text-headline text-4xl sm:text-5xl tracking-tight mb-5">
              {headline}
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto mb-8">
              {subline}
            </p>

            <div className="rounded-xl glass p-5 sm:p-6 text-left mb-8">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md glass-subtle">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <div className="text-sm text-foreground/85 leading-relaxed">
                  Check your inbox for a Stripe receipt. We'll follow up from
                  <span className="font-semibold text-foreground"> hello@machinedog.dev </span>
                  with next steps and a kickoff plan.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/pricing">
                <Button
                  size="lg"
                  className="h-12 px-8 text-sm tracking-wider font-bold text-white border-0"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
                    boxShadow: "0 10px 30px -10px hsla(200,90%,60%,0.55)",
                  }}
                >
                  BACK TO PRICING
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-8 text-sm tracking-wider font-bold bg-transparent text-white"
                  style={{ border: "1px solid hsla(0,0%,100%,0.25)" }}
                >
                  CLIENT LOGIN
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 text-center text-xs text-muted-foreground font-mono tracking-widest">
          © {new Date().getFullYear()} MACHINEDOG.DEV
        </div>
      </footer>
    </div>
  );
}
