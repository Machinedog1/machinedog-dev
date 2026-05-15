import { SignIn } from "@clerk/clerk-react";
import { Logo } from "@/components/Logo";
import { isClerkEnabled } from "@/lib/clerk";

export default function SignInPage() {
  const signUpHref = `${import.meta.env.BASE_URL}sign-up`.replace(/\/+/g, "/");

  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white flex flex-col"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
        <a
          href={signUpHref}
          className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase text-white/80 transition hover:text-white"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          Sign up <span aria-hidden>→</span>
        </a>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 lg:px-12 py-10">
        {isClerkEnabled() ? (
          <SignIn
            routing="path"
            path={`${import.meta.env.BASE_URL}sign-in`.replace(/\/+/g, "/").replace(/\/$/, "")}
            signUpUrl={`${import.meta.env.BASE_URL}sign-up`.replace(/\/+/g, "/")}
            fallbackRedirectUrl={import.meta.env.BASE_URL}
            appearance={{ baseTheme: undefined }}
          />
        ) : (
          <div className="max-w-md text-center text-white/80 text-sm">
            Authentication is not configured for this environment. Set{" "}
            <code>VITE_CLERK_PUBLISHABLE_KEY</code> to enable sign-in.
          </div>
        )}
      </main>
    </div>
  );
}
