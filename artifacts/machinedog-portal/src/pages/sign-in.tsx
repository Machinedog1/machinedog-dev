import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import huskyPortrait from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777252211433.png";

const HUSKY_NATURAL_W = 1024;
const HUSKY_NATURAL_H = 1536;
const EYE_X_FRACTION = 0.283;
const EYE_Y_FRACTION = 0.367;
const EYE_DIAMETER_FRACTION = 0.085;

function useEyeOverlay(
  containerRef: RefObject<HTMLElement | null>,
  objectPosX: number,
  objectPosY: number,
) {
  const [pos, setPos] = useState({ x: 0, y: 0, diameter: 0, ready: false });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const scale = Math.max(cw / HUSKY_NATURAL_W, ch / HUSKY_NATURAL_H);
      const renderedW = HUSKY_NATURAL_W * scale;
      const renderedH = HUSKY_NATURAL_H * scale;
      const xOffset = (cw - renderedW) * objectPosX;
      const yOffset = (ch - renderedH) * objectPosY;
      setPos({
        x: xOffset + EYE_X_FRACTION * renderedW,
        y: yOffset + EYE_Y_FRACTION * renderedH,
        diameter: EYE_DIAMETER_FRACTION * renderedH,
        ready: true,
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, objectPosX, objectPosY]);
  return pos;
}

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

  const desktopHuskyRef = useRef<HTMLDivElement>(null);
  const mobileHuskyRef = useRef<HTMLDivElement>(null);
  const desktopEye = useEyeOverlay(desktopHuskyRef, 0.5, 0.32);
  const mobileEye = useEyeOverlay(mobileHuskyRef, 0.5, 0.3);

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
        ref={desktopHuskyRef}
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
      {/* Pulsing cybernetic eye glow — locked to the husky's cybernetic eye
          in image-coordinates via useEyeOverlay, so it tracks the eye no
          matter how the viewport is resized. */}
      {desktopEye.ready && (
        <div
          className="hidden lg:block absolute pointer-events-none mix-blend-screen md-eye-pulse rounded-full"
          aria-hidden
          style={{
            left: desktopEye.x - desktopEye.diameter / 2,
            top: desktopEye.y - desktopEye.diameter / 2,
            width: desktopEye.diameter,
            height: desktopEye.diameter,
            background:
              "radial-gradient(circle, hsla(195,100%,68%,1) 0%, hsla(200,100%,55%,0.55) 35%, transparent 70%)",
          }}
        />
      )}
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

        <div
          ref={mobileHuskyRef}
          className="lg:hidden relative w-full h-[58vh] min-h-[340px] max-h-[500px] overflow-hidden mt-3"
        >
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
          {/* Mobile cybernetic eye pulse — locked to the eye via useEyeOverlay. */}
          {mobileEye.ready && (
            <div
              aria-hidden
              className="absolute pointer-events-none mix-blend-screen md-eye-pulse rounded-full"
              style={{
                left: mobileEye.x - mobileEye.diameter / 2,
                top: mobileEye.y - mobileEye.diameter / 2,
                width: mobileEye.diameter,
                height: mobileEye.diameter,
                background:
                  "radial-gradient(circle, hsla(195,100%,68%,1) 0%, hsla(200,100%,55%,0.55) 35%, transparent 70%)",
              }}
            />
          )}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, hsla(220,45%,3%,0.55) 55%, hsla(220,45%,3%,1) 100%)",
            }}
          />
        </div>

        {/* Layout: on lg+ screens, both the hero card and the sign-in card
            stack in a single right-aligned column so the husky portrait
            background shows on the left half. Sized to fit above the fold
            on a 720px viewport (header ~80px + 2 cards ~580px + padding). */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_minmax(380px,440px)] items-end lg:items-center gap-6 lg:gap-8 px-5 sm:px-8 lg:px-12 pb-8 lg:pb-10 pt-4 lg:pt-0">
          {/* Empty spacer on the left so the right column hugs the right
              edge while leaving the husky portrait visible. */}
          <div className="hidden lg:block" aria-hidden />

          <div className="order-1 lg:order-2 w-full max-w-md mx-auto lg:mx-0 lg:ml-auto min-w-0 flex flex-col gap-4 lg:gap-5">
            {/* Compact hero card — sits above the sign-in card on lg+. The
                headline collapses to a single line at this width so the
                combined stack stays above the fold. */}
            <div
              className="relative rounded-[24px] p-5 sm:p-6 overflow-hidden"
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
                  className="mb-2 text-[10px] font-mono tracking-[0.28em] uppercase"
                  style={{ color: "hsl(200 95% 70%)" }}
                >
                  Invite-only AI atelier
                </div>
                <h1
                  className="text-white uppercase font-extrabold leading-[1.02] tracking-tight"
                  style={{
                    fontSize: "clamp(1.5rem, 2.6vw, 2rem)",
                    textShadow: "0 4px 40px rgba(0,0,0,0.45)",
                    letterSpacing: "-0.015em",
                  }}
                >
                  We forge{" "}
                  <span
                    style={{
                      WebkitTextFillColor: "transparent",
                      WebkitBackgroundClip: "text",
                      backgroundImage:
                        "linear-gradient(135deg, hsl(200 95% 65%) 0%, hsl(254 95% 78%) 100%)",
                    }}
                  >
                    digital
                  </span>{" "}
                  intelligence
                </h1>
                <p className="mt-2 text-[13px] sm:text-sm leading-snug text-white/70">
                  Machinedog.Dev is a private engineering atelier. Sign in
                  for prompts, projects, and consulting hours.
                </p>
              </div>
            </div>

            <div className="w-full min-w-0">
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
          </div>
        </main>
      </div>
    </div>
  );
}
