import { Link } from "wouter";
import { Logo } from "@/components/Logo";

export default function SignUpPage() {
  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white flex flex-col"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 lg:px-12 py-10">
        <div
          className="w-full max-w-lg rounded-[28px] p-6 sm:p-8"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          <div className="text-[11px] font-mono tracking-[0.24em] uppercase text-primary/90 mb-2">
            Invite-only
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
            Machinedog.Dev is invite-only
          </h1>
          <p className="text-sm text-white/70 leading-relaxed mb-6">
            Accounts are created when our team sends you an invitation by email.
            Check your inbox for an invitation link, or request access below.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/intake"
              className="inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition hover:opacity-95"
              style={{
                background:
                  "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
              }}
            >
              Request invite <span aria-hidden>→</span>
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-sm font-semibold tracking-wide text-white/90 transition hover:text-white"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              I already have an account
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
