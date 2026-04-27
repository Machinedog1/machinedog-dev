import { Link } from "wouter";
import { Logo } from "@/components/Logo";
import huskyPortrait from "@assets/F4E50D9E-68CC-4514-8AE0-56D611828FC6_1777252211433.png";

export default function SignUpPage() {
  return (
    <div
      className="dark relative min-h-screen w-full overflow-hidden text-white flex flex-col"
      style={{ background: "hsl(220 45% 3%)" }}
    >
      <div
        className="absolute inset-0 bg-cover bg-no-repeat"
        style={{
          backgroundImage: `url(${huskyPortrait})`,
          filter: "saturate(0.85) contrast(0.95) brightness(0.45)",
          opacity: 0.3,
          backgroundPosition: "50% 32%",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsla(220,45%,3%,0.55) 55%, hsla(220,45%,3%,0.95) 100%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 sm:px-8 lg:px-12 py-10">
        <div
          className="w-full max-w-lg rounded-[28px] p-6 sm:p-8 overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)",
            border: "1px solid rgba(255,255,255,0.14)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.55)",
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
            If you've already received an invite, follow the link in that email
            to set your password. Otherwise, request access below and we'll be
            in touch.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/intake"
              className="inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition hover:opacity-95"
              style={{
                background:
                  "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                boxShadow: "0 12px 32px -8px hsla(200,95%,55%,0.55)",
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
