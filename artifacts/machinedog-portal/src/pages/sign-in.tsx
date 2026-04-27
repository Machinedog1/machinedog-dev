import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import huskyPortrait from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777252211433.png";

export default function SignInPage() {
  const intakeHref = `${import.meta.env.BASE_URL}intake`.replace(/\/+/g, "/");
  const workHref = `${import.meta.env.BASE_URL}work`.replace(/\/+/g, "/");
  const forgotHref = `${import.meta.env.BASE_URL}forgot-password`.replace(/\/+/g, "/");

  const { signIn } = useAuth();
  const [, setLocation] = useLocation();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const canSubmit = emailAddress.trim().length > 0 && password.length > 0 && !isSubmitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setGlobalError(null);
    setIsSubmitting(true);
    const { error } = await signIn(emailAddress.trim(), password);
    setIsSubmitting(false);
    if (error) {
      setGlobalError(error);
      return;
    }
    setLocation("/");
  };

  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      <div
        className="hidden lg:block absolute inset-0 bg-cover bg-no-repeat lg:bg-[position:50%_32%]"
        style={{
          backgroundImage: `url(${huskyPortrait})`,
          filter: "saturate(0.85) contrast(0.95) brightness(0.45)",
          opacity: 0.35,
        }}
      />
      <div
        className="hidden lg:block absolute inset-0 pointer-events-none mix-blend-screen"
        style={{
          background:
            "radial-gradient(ellipse 70% 35% at 52% 38%, hsla(200,95%,55%,0.30) 0%, transparent 60%)",
        }}
      />
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

      <div className="relative z-10 flex min-h-screen flex-col">
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
              href={intakeHref}
              className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white/80 transition hover:text-white"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
              }}
            >
              Request invite <span aria-hidden>→</span>
            </a>
          </nav>
        </header>

        <div className="lg:hidden relative w-full h-[58vh] min-h-[340px] max-h-[500px] overflow-hidden mt-3">
          <img
            src={huskyPortrait}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: "50% 30%",
              filter: "saturate(0.85) contrast(0.95) brightness(0.5)",
              opacity: 0.45,
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none mix-blend-screen"
            style={{
              background:
                "radial-gradient(ellipse 70% 35% at 50% 42%, hsla(200,95%,55%,0.30) 0%, transparent 60%)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, hsla(220,45%,3%,0.55) 55%, hsla(220,45%,3%,1) 100%)",
            }}
          />
        </div>

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.05fr_minmax(420px,0.95fr)] items-end lg:items-center gap-6 lg:gap-10 px-5 sm:px-8 lg:px-12 pb-8 lg:pb-16 pt-6 lg:pt-0">
          <div className="order-1 lg:order-1 w-full max-w-xl">
            <div
              className="relative rounded-[28px] p-5 sm:p-7 lg:p-8 overflow-hidden"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(40px) saturate(180%)",
                WebkitBackdropFilter: "blur(40px) saturate(180%)",
                boxShadow:
                  "0 30px 80px -20px rgba(0,0,0,0.55), 0 1px 0 0 rgba(255,255,255,0.18) inset, 0 -1px 0 0 rgba(255,255,255,0.04) inset",
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                }}
              />
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
                  Invite-only AI atelier
                </div>
                <h1
                  className="text-white uppercase font-extrabold leading-[0.95] tracking-tight break-words"
                  style={{
                    fontSize: "clamp(1.5rem, 7vw, 4.5rem)",
                    textShadow: "0 4px 40px rgba(0,0,0,0.45)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  We forge
                  <br />
                  <span
                    style={{
                      WebkitTextFillColor: "transparent",
                      WebkitBackgroundClip: "text",
                      backgroundImage:
                        "linear-gradient(135deg, hsl(200 95% 65%) 0%, hsl(254 95% 78%) 100%)",
                    }}
                  >
                    digital
                  </span>
                  <br />
                  intelligence
                </h1>
                <p className="mt-5 max-w-md text-base sm:text-lg leading-relaxed text-white/75">
                  Machinedog.Dev is a private engineering atelier. Sign in with
                  your invited account to access prompts, projects, and
                  consulting hours.
                </p>
              </div>
            </div>
          </div>

          <div className="order-2 lg:order-2 w-full max-w-md mx-auto lg:mx-0 lg:ml-auto min-w-0">
            <div
              className="relative rounded-[28px] p-5 sm:p-8 overflow-hidden"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(40px) saturate(180%)",
                WebkitBackdropFilter: "blur(40px) saturate(180%)",
                boxShadow:
                  "0 30px 80px -20px rgba(0,0,0,0.55), 0 1px 0 0 rgba(255,255,255,0.18) inset, 0 -1px 0 0 rgba(255,255,255,0.04) inset",
              }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                }}
              />
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
                <div className="mb-1 text-[11px] font-mono tracking-[0.24em] uppercase text-white/60">
                  Welcome back
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-6">
                  Sign in to continue
                </h2>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="email"
                      className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/60"
                    >
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="you@company.com"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      className="w-full rounded-[14px] px-4 py-3 text-[15px] text-white placeholder:text-white/40 outline-none transition focus:ring-2 focus:ring-[#3FB1F0]/60"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="password"
                        className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/60"
                      >
                        Password
                      </label>
                      <a
                        href={forgotHref}
                        className="text-[10px] font-semibold tracking-[0.18em] uppercase text-primary/90 hover:text-primary"
                      >
                        Forgot?
                      </a>
                    </div>
                    <input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-[14px] px-4 py-3 text-[15px] text-white placeholder:text-white/40 outline-none transition focus:ring-2 focus:ring-[#3FB1F0]/60"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                      }}
                    />
                  </div>

                  {globalError && (
                    <div
                      className="rounded-[12px] px-3.5 py-2.5 text-[13px] text-rose-100"
                      style={{
                        background: "rgba(244,63,94,0.10)",
                        border: "1px solid rgba(244,63,94,0.35)",
                      }}
                    >
                      {globalError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:opacity-95"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                      boxShadow:
                        "0 12px 32px -8px hsla(200,95%,55%,0.55)",
                    }}
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Sign in <span aria-hidden>→</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-white/10 text-center space-y-2">
                  <p className="text-xs text-white/60">
                    Machinedog.Dev is invite-only. New accounts are created when
                    we send you an invitation by email.
                  </p>
                  <p className="text-[11px] text-white/40 font-mono uppercase tracking-[0.2em]">
                    Encrypted · Invite-only · No spam
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
