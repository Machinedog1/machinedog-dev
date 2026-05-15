/**
 * Clerk integration wrapper for the portal (Phase 0 foundation).
 *
 * Activates only when `VITE_CLERK_PUBLISHABLE_KEY` is set at build time.
 * When unset, renders children directly and exposes a `useClerkEnabled()`
 * hook returning false so the rest of the app can show a demo-mode banner
 * and skip Clerk-only UI surfaces.
 *
 * The legacy `AuthProvider` (cookie session) continues to wrap the entire
 * app — Clerk is layered on top, not in place of, during Phase 0.
 */

import { lazy, Suspense, type ReactNode } from "react";

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const PUBLISHABLE_KEY = env.VITE_CLERK_PUBLISHABLE_KEY;
const CLERK_PROXY_URL = env.VITE_CLERK_PROXY_URL;

export function isClerkEnabled(): boolean {
  return !!PUBLISHABLE_KEY;
}

export function useClerkEnabled(): boolean {
  return isClerkEnabled();
}

// Lazy-load the Clerk provider so the portal can boot without the package
// installed when Clerk is disabled. The dynamic import keeps the bundle out
// of the critical path for demo-mode users entirely.
const LazyClerkProvider = lazy(async () => {
  const mod = await import("@clerk/clerk-react");
  return {
    default: ({ children }: { children: ReactNode }) => (
      <mod.ClerkProvider
        publishableKey={PUBLISHABLE_KEY!}
        proxyUrl={CLERK_PROXY_URL || undefined}
        afterSignOutUrl="/sign-in"
      >
        {children}
      </mod.ClerkProvider>
    ),
  };
});

export function ClerkProviderWrapper({ children }: { children: ReactNode }) {
  if (!isClerkEnabled()) {
    return <>{children}</>;
  }
  return (
    <Suspense fallback={<>{children}</>}>
      <LazyClerkProvider>{children}</LazyClerkProvider>
    </Suspense>
  );
}
