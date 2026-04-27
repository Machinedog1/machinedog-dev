import { SignUp } from "@clerk/react";
import { useTheme } from "@/hooks/use-theme";
import { dark } from "@clerk/themes";
import { Logo } from "@/components/Logo";
import huskyPortrait from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777252211433.png";

export default function SignUpPage() {
  const { theme } = useTheme();
  const intakeHref = `${import.meta.env.BASE_URL}intake`.replace(/\/+/g, "/");
  const workHref = `${import.meta.env.BASE_URL}work`.replace(/\/+/g, "/");
  const signInHref = `${import.meta.env.BASE_URL}sign-in`.replace(/\/+/g, "/");

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

        {/* MOBILE husky hero — normal-flow block between header and main so layout is bullet-proof.
            Hidden on lg+ where the desktop full-bleed bg above takes over. */}
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

        {/* Main grid: headline left, glass card right (stacks on mobile, headline first). */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.05fr_minmax(420px,0.95fr)] items-end lg:items-center gap-6 lg:gap-10 px-5 sm:px-8 lg:px-12 pb-8 lg:pb-16 pt-6 lg:pt-0">
          {/* Headline — wrapped in an Apple-style glass card so it stays legible over the husky portrait */}
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
                  Claim your
                  <br />
                  <span
                    style={{
                      WebkitTextFillColor: "transparent",
                      WebkitBackgroundClip: "text",
                      backgroundImage:
                        "linear-gradient(135deg, hsl(200 95% 65%) 0%, hsl(254 95% 78%) 100%)",
                    }}
                  >
                    invite
                  </span>
                  <br />
                  account
                </h1>
                <p className="mt-5 max-w-md text-base sm:text-lg leading-relaxed text-white/75">
                  Finish setting up your Machinedog.Dev account using the email
                  address your invite was sent to. Access unlocks once we
                  recognize you on the guest list.
                </p>
              </div>
            </div>
          </div>

          {/* Apple-style glass sign-up card */}
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
                <div className="mb-1 text-[11px] font-mono tracking-[0.24em] uppercase text-white/60">
                  New to the kennel
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-6">
                  Create your account
                </h2>

                <SignUp
                  routing="path"
                  path="/sign-up"
                  signInUrl="/sign-in"
                  fallbackRedirectUrl="/"
                  appearance={{
                    baseTheme: theme === "dark" ? dark : undefined,
                    variables: {
                      colorPrimary: "#3FB1F0",
                      colorBackground: "transparent",
                      colorInput: "rgba(255,255,255,0.06)",
                      colorInputForeground: "#FFFFFF",
                      colorForeground: "#F1F6FB",
                      colorTextSecondary: "rgba(255,255,255,0.65)",
                      fontFamily: "'Inter', sans-serif",
                      borderRadius: "0.875rem",
                    },
                    elements: {
                      rootBox: "w-full",
                      cardBox:
                        "!bg-transparent !border-0 !shadow-none !backdrop-blur-none w-full",
                      card: "!bg-transparent !shadow-none !p-0 !border-0",
                      header: "hidden",
                      headerTitle: "hidden",
                      headerSubtitle: "hidden",
                      logoBox: "hidden",
                      socialButtonsBlockButton:
                        "!border !border-white/15 !bg-white/5 !text-white hover:!bg-white/10 !backdrop-blur",
                      socialButtonsBlockButtonText:
                        "!text-white !font-semibold",
                      dividerLine: "!bg-white/15",
                      dividerText:
                        "!text-white/50 !text-[10px] !tracking-[0.24em] !uppercase !font-mono",
                      formFieldLabel:
                        "!text-[10px] !font-semibold !text-white/60 !tracking-[0.22em] !uppercase",
                      formFieldInput:
                        "!bg-white/5 !border !border-white/15 !text-white placeholder:!text-white/40 focus:!ring-2 focus:!ring-primary/60 focus:!border-primary/40 !backdrop-blur",
                      formButtonPrimary:
                        "!bg-gradient-to-r !from-[#3FB1F0] !to-[#7C7BF7] hover:!opacity-95 !text-white !font-semibold !shadow-lg !shadow-primary/30 !normal-case !text-sm !tracking-wide",
                      footer: "!hidden",
                      footerAction: "!hidden",
                      footerActionText: "!hidden",
                      footerActionLink: "!hidden",
                      formFieldInputShowPasswordButton:
                        "!text-white/60 hover:!text-white",
                      identityPreview:
                        "!bg-white/5 !border !border-white/10 !backdrop-blur",
                      identityPreviewText: "!text-white",
                      identityPreviewEditButtonIcon:
                        "!text-white/60 hover:!text-white",
                      formFieldAction: "!text-primary hover:!text-primary/80",
                      otpCodeFieldInput:
                        "!bg-white/5 !border !border-white/15 !text-white",
                      alert:
                        "!bg-white/5 !border !border-white/15 !text-white",
                      alertText: "!text-white",
                    },
                  }}
                />

                <div className="mt-6 pt-5 border-t border-white/10 text-center">
                  <p className="text-xs text-white/60">
                    Already have an account?{" "}
                    <a
                      href={signInHref}
                      className="text-primary hover:text-primary/80 font-semibold"
                    >
                      Sign in →
                    </a>
                  </p>
                </div>
              </div>
            </div>

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
