import { SignIn } from "@clerk/react";
import { useTheme } from "@/hooks/use-theme";
import { dark } from "@clerk/themes";
import huskyMark from "@assets/generated_images/husky_mark.png";

export default function SignInPage() {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row text-foreground relative overflow-hidden">
      {/* Hero side — matches mobile sign-in aesthetic */}
      <div
        className="relative flex flex-col justify-between p-8 lg:p-12 lg:w-1/2 min-h-[520px] lg:min-h-screen overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, hsl(220 45% 8%) 0%, hsl(220 40% 4%) 100%)",
        }}
      >
        {/* Ambient cyan glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(900px 700px at 50% 35%, hsla(200,90%,60%,0.12), transparent 60%), radial-gradient(700px 500px at 80% 90%, hsla(254,95%,75%,0.10), transparent 60%)",
          }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(hsla(0,0%,100%,0.25) 1px, transparent 1px), linear-gradient(90deg, hsla(0,0%,100%,0.25) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Big faded husky watermark behind headline */}
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <img
            src={huskyMark}
            alt=""
            className="w-[78%] max-w-[520px] object-contain"
            style={{ opacity: 0.18 }}
          />
        </div>

        {/* Top: small logo + wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="h-11 w-11 rounded-full overflow-hidden border-2 border-[hsl(var(--primary))] bg-[hsl(220,40%,4%)] flex items-center justify-center"
            style={{
              boxShadow:
                "0 0 0 1px hsla(200,90%,60%,0.45), 0 0 24px hsla(200,90%,60%,0.55)",
            }}
          >
            <img
              src={huskyMark}
              alt="Machinedog husky logo"
              className="h-full w-full object-contain p-0.5"
            />
          </div>
          <span
            className="text-headline text-white text-xl"
            style={{ letterSpacing: "0.16em", fontWeight: 800 }}
          >
            MACHINEDOG.DEV
          </span>
        </div>

        {/* Bottom: eyebrow + headline */}
        <div className="relative z-10 max-w-md mt-auto">
          <div
            className="mb-4 text-xs font-mono tracking-[0.22em] uppercase"
            style={{ color: "hsl(200 90% 65%)" }}
          >
            Invite-only AI atelier
          </div>
          <h1
            className="text-headline text-white uppercase font-extrabold leading-[0.95] tracking-tight"
            style={{ fontSize: "clamp(2.5rem, 5.5vw, 4rem)" }}
          >
            We forge
            <br />
            <span
              style={{
                WebkitTextFillColor: "transparent",
                WebkitBackgroundClip: "text",
                backgroundImage:
                  "linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(254 95% 75%) 100%)",
              }}
            >
              digital
            </span>
            <br />
            intelligence
          </h1>
          <p className="mt-6 text-base text-white/70 max-w-sm leading-relaxed">
            Machinedog.Dev is a private engineering atelier. Sign in with your
            invited account to access prompts, projects, and consulting hours.
          </p>
        </div>
      </div>

      {/* Form side */}
      <div className="relative flex-1 flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="bg-grid opacity-40" />
        <div className="w-full max-w-md z-10">
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/"
            appearance={{
              baseTheme: theme === "dark" ? dark : undefined,
              variables: {
                colorPrimary: "#3FB1F0",
                colorBackground: "transparent",
                colorInput:
                  theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                colorInputForeground: theme === "dark" ? "#FFFFFF" : "#000000",
                colorForeground: theme === "dark" ? "#E2EAF2" : "#1A2636",
                fontFamily: "'Inter', sans-serif",
                borderRadius: "0.875rem",
              },
              elements: {
                cardBox: "glass-strong border-0 shadow-xl",
                card: "bg-transparent shadow-none",
                headerTitle:
                  "font-sans font-extrabold tracking-tight text-foreground text-2xl",
                headerSubtitle: "text-muted-foreground",
                socialButtonsBlockButton:
                  "glass-subtle border-0 text-foreground hover:bg-muted/50",
                formFieldLabel:
                  "text-xs font-semibold text-muted-foreground tracking-widest uppercase",
                formFieldInput: "glass-input border-0 focus:ring-primary",
                formButtonPrimary:
                  "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/30",
                footerActionText: "text-muted-foreground",
                footerActionLink: "text-primary hover:text-primary/80",
              },
            }}
          />
          <p className="mt-6 text-xs text-center text-muted-foreground">
            Reach out to your account team if you need an invitation.
          </p>
        </div>
      </div>
    </div>
  );
}
