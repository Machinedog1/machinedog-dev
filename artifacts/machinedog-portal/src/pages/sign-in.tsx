import { lazy, Suspense } from "react";
import { Link } from "wouter";
import { Logo } from "@/components/Logo";
import { glassClerkAppearance } from "@/lib/clerkAppearance";
import { isClerkConfigured } from "@/lib/clerk";
import { ClerkErrorBoundary } from "@/components/ClerkErrorBoundary";

const LazySignIn = lazy(async () => {
  const mod = await import("@clerk/react");
  return { default: mod.SignIn };
});

export default function SignInPage() {
  const signUpHref = `${import.meta.env.BASE_URL}sign-up`.replace(/\/+/g, "/");
  const signInPath = `${import.meta.env.BASE_URL}sign-in`.replace(/\/+/g, "/").replace(/\/$/, "");

  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white flex flex-col"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute top-[10%] left-[15%] h-[640px] w-[640px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, hsl(200 100% 60% / 0.95), transparent 70%)",
            filter: "blur(30px)",
          }}
        />
        <div
          className="absolute top-[40%] right-[8%] h-[680px] w-[680px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, hsl(280 95% 65% / 0.9), transparent 70%)",
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute -bottom-32 left-[35%] h-[560px] w-[560px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, hsl(330 95% 65% / 0.85), transparent 70%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
        <a
          href={signUpHref}
          className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white/80 transition hover:text-white"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
          }}
        >
          Sign up <span aria-hidden>→</span>
        </a>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 lg:px-12 py-10">
        {isClerkConfigured() ? (
          <ClerkErrorBoundary>
            <Suspense fallback={<div className="text-white/60 text-sm">Loading sign-in…</div>}>
              <LazySignIn
                routing="path"
                path={signInPath}
                signUpUrl={`${import.meta.env.BASE_URL}sign-up`.replace(/\/+/g, "/")}
                fallbackRedirectUrl={import.meta.env.BASE_URL}
                appearance={glassClerkAppearance}
              />
            </Suspense>
          </ClerkErrorBoundary>
        ) : (
          <AuthNotConfigured kind="sign-in" />
        )}
      </main>
    </div>
  );
}

function AuthNotConfigured({ kind }: { kind: "sign-in" | "sign-up" }) {
  return (
    <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-6 text-center">
      <div className="text-xs font-mono uppercase tracking-wider text-amber-300 mb-2">
        Auth not configured
      </div>
      <h1 className="text-2xl font-bold mb-3">
        {kind === "sign-in" ? "Sign-in" : "Sign-up"} is unavailable
      </h1>
      <p className="text-sm text-amber-100/80 mb-6">
        Replit-managed Clerk has not provisioned credentials for this workspace
        yet, so <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> is
        missing. The auth flow will work the moment that secret appears.
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href="/auth-debug"
          className="rounded-lg px-4 py-2 text-sm font-semibold bg-white text-black hover:bg-white/90"
        >
          Open /auth-debug
        </Link>
        <Link
          href="/"
          className="rounded-lg px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/20"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
