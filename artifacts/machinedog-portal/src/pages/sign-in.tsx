import { SignIn } from "@clerk/react";
import { useTheme } from "@/hooks/use-theme";
import { dark } from "@clerk/themes";
import huskyMark from "@assets/generated_images/husky_mark.png";
import huskyPortrait from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777252211433.png";

export default function SignInPage() {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row text-foreground relative overflow-hidden">
      {/* Hero side — dramatic husky portrait backdrop */}
      <div className="relative flex flex-col justify-between p-8 lg:p-12 lg:w-1/2 min-h-[520px] lg:min-h-screen overflow-hidden bg-[hsl(220,40%,4%)]">
        {/* Husky portrait backdrop */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${huskyPortrait})`,
            backgroundSize: "cover",
            backgroundPosition: "50% 30%",
            backgroundRepeat: "no-repeat",
            filter: "saturate(1.15) contrast(1.05) brightness(0.85)",
          }}
        />
        {/* Cyber blue tint */}
        <div
          className="absolute inset-0 mix-blend-overlay pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 60%, hsla(200,90%,55%,0.45) 0%, transparent 55%)",
          }}
        />
        {/* Bottom fade for headline legibility */}
        <div
          className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, hsla(220,45%,3%,0.6) 55%, hsla(220,45%,3%,0.95) 100%)",
          }}
        />

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
            Don't have an invite?{" "}
            <a
              href={`${import.meta.env.BASE_URL}intake`.replace(/\/+/g, "/")}
              className="text-primary hover:text-primary/80 font-semibold underline-offset-2 hover:underline"
            >
              Request one →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
