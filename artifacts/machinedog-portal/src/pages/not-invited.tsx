import { Button } from "@/components/ui/button";
import { SignOutButton } from "@clerk/react";
import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/Logo";
import huskyPortrait from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777252211433.png";

export default function NotInvitedPage() {
  const intakeHref = `${import.meta.env.BASE_URL}intake`.replace(/\/+/g, "/");
  const workHref = `${import.meta.env.BASE_URL}work`.replace(/\/+/g, "/");

  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white"
      style={{ background: "hsl(220 45% 3%)" }}
    >
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

      {/* Content layer */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
          <Logo size="sm" href={null} />
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

        {/* MOBILE husky hero */}
        <div className="lg:hidden relative w-full h-[58vh] min-h-[340px] max-h-[500px] overflow-hidden mt-3">
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

        {/* Main grid: headline left, glass card right */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.05fr_minmax(420px,0.95fr)] items-end lg:items-center gap-6 lg:gap-10 px-5 sm:px-8 lg:px-12 pb-8 lg:pb-16 pt-6 lg:pt-0">
          {/* Headline glass card */}
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
                  Not on the
                  <br />
                  <span
                    style={{
                      WebkitTextFillColor: "transparent",
                      WebkitBackgroundClip: "text",
                      backgroundImage:
                        "linear-gradient(135deg, hsl(200 95% 65%) 0%, hsl(254 95% 78%) 100%)",
                    }}
                  >
                    guest
                  </span>
                  <br />
                  list
                </h1>
                <p className="mt-5 max-w-md text-base sm:text-lg leading-relaxed text-white/75">
                  Machinedog.Dev is a private engineering atelier. Access is
                  granted by invitation only — request one and we'll be in
                  touch when a slot opens.
                </p>
              </div>
            </div>
          </div>

          {/* Apple-style glass access-denied card */}
          <div className="order-2 lg:order-2 w-full max-w-md mx-auto lg:mx-0 lg:ml-auto">
            <div
              className="relative rounded-[28px] p-6 sm:p-8 overflow-hidden"
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
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-12 w-12 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      backdropFilter: "blur(20px) saturate(180%)",
                      WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    }}
                  >
                    <ShieldAlert className="h-6 w-6 text-white/85" />
                  </div>
                  <div>
                    <div className="text-[11px] font-mono tracking-[0.24em] uppercase text-white/60">
                      Status
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-mono">
                      ACCESS_DENIED
                    </h2>
                  </div>
                </div>

                <p className="text-sm sm:text-base leading-relaxed text-white/75 mb-5">
                  The email address associated with this account has not been
                  approved for access. Machinedog.Dev operates on a strictly
                  invite-only basis.
                </p>

                <div
                  className="rounded-2xl p-4 mb-6 text-xs sm:text-sm font-mono leading-relaxed text-white/70"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  }}
                >
                  If you recently received an invite, ensure you signed in
                  with the exact email address it was sent to.
                </div>

                <div className="space-y-3">
                  <a
                    href={intakeHref}
                    className="flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-lg shadow-primary/30 transition hover:opacity-95"
                    style={{
                      background:
                        "linear-gradient(90deg, #3FB1F0 0%, #7C7BF7 100%)",
                    }}
                  >
                    Request an invite →
                  </a>
                  <SignOutButton>
                    <Button
                      variant="outline"
                      className="w-full font-mono !bg-white/5 !border-white/15 !text-white hover:!bg-white/10"
                    >
                      SIGN_OUT
                    </Button>
                  </SignOutButton>
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
