import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";

export default function AcceptInvitePage() {
  const { refresh } = useAuth();
  const [, setLocation] = useLocation();

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("token") ?? "";
  }, []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !!token && password.length >= 8 && password === confirm && !isSubmitting;

  useEffect(() => {
    if (!token) setError("This invite link is missing a token.");
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not accept this invite.");
        setIsSubmitting(false);
        return;
      }
      await refresh();
      setLocation("/");
    } catch {
      setError("Network error. Please try again.");
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
          <div className="flex items-center gap-2 mb-2 text-[11px] font-mono tracking-[0.24em] uppercase text-primary/90">
            <ShieldCheck className="h-3.5 w-3.5" /> Accept invite
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            Set your password
          </h1>
          <p className="text-sm text-white/70 mb-6">
            Choose a password to activate your Machinedog.Dev account.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/60"
              >
                New password (min 8 chars)
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[14px] px-4 py-3 text-[15px] text-white placeholder:text-white/40 outline-none transition focus:ring-2 focus:ring-[#3FB1F0]/60"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="confirm"
                className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/60"
              >
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
              disabled={!canSubmit}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-semibold tracking-wide text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:opacity-95"
              style={{
                background:
                  "linear-gradient(135deg, hsl(200 95% 55%) 0%, hsl(254 90% 65%) 100%)",
                boxShadow: "0 12px 32px -8px hsla(200,95%,55%,0.55)",
              }}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Activate account <span aria-hidden>→</span></>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
