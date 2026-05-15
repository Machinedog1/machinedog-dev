import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Logo } from "@/components/Logo";

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

interface ClerkProbe {
  providerLoaded: boolean;
  providerError: string | null;
  isSignedIn: boolean | null;
  userId: string | null;
  proxyUrlResolved: string | null;
}

const initialProbe: ClerkProbe = {
  providerLoaded: false,
  providerError: null,
  isSignedIn: null,
  userId: null,
  proxyUrlResolved: null,
};

export default function AuthDebugPage() {
  const [probe, setProbe] = useState<ClerkProbe>(initialProbe);
  const [meStatus, setMeStatus] = useState<string>("(not yet fetched)");

  const publishableKey = env.VITE_CLERK_PUBLISHABLE_KEY;
  const proxyUrl = env.VITE_CLERK_PROXY_URL;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@clerk/react");
        if (cancelled) return;
        const useClerk = (mod as { useClerk?: () => unknown }).useClerk;
        setProbe((p) => ({
          ...p,
          providerLoaded: true,
          proxyUrlResolved: proxyUrl ?? null,
          providerError: useClerk ? null : "useClerk export not found",
        }));
      } catch (e) {
        if (cancelled) return;
        setProbe((p) => ({ ...p, providerError: (e as Error).message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proxyUrl]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 200) {
          const j = await r.json();
          setMeStatus(`200 OK · org=${j?.organization?.id ?? "(none)"} · member=${j?.member?.email ?? "(none)"}`);
        } else {
          setMeStatus(`${r.status} ${r.statusText}`);
        }
      })
      .catch((e) => {
        if (!cancelled) setMeStatus(`network error: ${(e as Error).message}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: Array<[string, string | boolean | null]> = [
    ["VITE_CLERK_PUBLISHABLE_KEY present", !!publishableKey],
    ["VITE_CLERK_PUBLISHABLE_KEY prefix", publishableKey ? publishableKey.slice(0, 12) + "…" : "(missing)"],
    ["VITE_CLERK_PROXY_URL present", !!proxyUrl],
    ["VITE_CLERK_PROXY_URL value", proxyUrl ?? "(missing)"],
    ["@clerk/react module loaded", probe.providerLoaded],
    ["Provider load error", probe.providerError ?? "(none)"],
    ["window.location.hostname", typeof window !== "undefined" ? window.location.hostname : "(ssr)"],
    ["Backend /api/auth/me", meStatus],
  ];

  return (
    <div className="dark min-h-screen w-full text-white" style={{ background: "hsl(220 45% 3%)" }}>
      <header className="flex items-center justify-between px-5 sm:px-8 lg:px-12 pt-5 sm:pt-7">
        <Logo size="sm" />
        <div className="text-xs font-mono text-white/50 uppercase tracking-wider">auth-debug</div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 lg:px-12 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Auth diagnostic</h1>
        <p className="text-sm text-white/60 mb-8">
          This page never imports Clerk eagerly, so it always renders even when the
          provider fails. Use it to verify env wiring and provider state.
        </p>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden mb-8">
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white/70 font-mono text-xs">{k}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {typeof v === "boolean" ? (
                      <span
                        className={
                          v
                            ? "text-emerald-400 font-semibold"
                            : "text-rose-400 font-semibold"
                        }
                      >
                        {v ? "YES" : "NO"}
                      </span>
                    ) : (
                      <span className="text-white/90 break-all">{String(v)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg px-4 py-2 text-sm font-semibold bg-white text-black hover:bg-white/90 transition"
          >
            Go to /sign-in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/20 transition"
          >
            Go to /sign-up
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/20 transition"
          >
            Go to /dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/20 transition"
          >
            Go to /
          </Link>
        </div>

        {!publishableKey && (
          <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-5 text-sm text-amber-200">
            <div className="font-semibold mb-2">Clerk publishable key is missing.</div>
            <p className="text-amber-100/80 mb-2">
              Replit-managed Clerk has not provisioned credentials for this workspace.
              Until <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> appears in
              your Secrets pane, all sign-in / sign-up flows will fail to load. This
              page intentionally avoids importing the Clerk SDK so it remains
              reachable while you resolve provisioning.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
