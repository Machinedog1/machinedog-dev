import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Loader2, MailCheck } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always treat as success to avoid leaking which emails exist.
      if (!res.ok && res.status >= 500) {
        setError("Something went wrong. Please try again.");
        setIsSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
          className="w-full max-w-md rounded-[28px] p-6 sm:p-8 overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)",
            border: "1px solid rgba(255,255,255,0.14)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.55)",
          }}
        >
          {submitted ? (
            <div className="flex flex-col items-start gap-4">
              <MailCheck className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                Check your inbox
              </h1>
              <p className="text-sm text-white/70">
                If an account exists for that email, we've sent a link to reset
                the password. The link is valid for 1 hour.
              </p>
              <Link href="/sign-in">
                <a className="text-sm font-semibold text-primary hover:text-primary/80">
                  ← Back to sign in
                </a>
              </Link>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-mono tracking-[0.24em] uppercase text-primary/90 mb-2">
                Reset password
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
                Forgot your password?
              </h1>
              <p className="text-sm text-white/70 mb-6">
                Enter your account email and we'll send you a link to set a new
                password.
              </p>
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-[14px] px-4 py-3 text-[15px] text-white placeholder:text-white/40 outline-none transition focus:ring-2 focus:ring-[#3FB1F0]/60"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.14)",
                    }}
                  />
                </div>

                {error && (
                  <div
                    className="rounded-[12px] px-3.5 py-2.5 text-[13px] text-rose-100"
                    style={{
                      background: "rgba(244,63,94,0.10)",
                      border: "1px solid rgba(244,63,94,0.35)",
                    }}
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:opacity-95"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                  }}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>Send reset link <span aria-hidden>→</span></>
                  )}
                </button>

                <div className="text-center pt-2">
                  <Link href="/sign-in">
                    <a className="text-xs text-white/60 hover:text-white">
                      ← Back to sign in
                    </a>
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
