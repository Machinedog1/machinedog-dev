/**
 * Clerk integration wrapper for the portal.
 *
 * Activates only when `VITE_CLERK_PUBLISHABLE_KEY` is set at build time.
 * When unset, renders children directly and exposes a `useClerkEnabled()`
 * hook returning false so the rest of the app can show a demo-mode banner
 * and skip Clerk-only UI surfaces.
 *
 * Dev (Replit preview) uses a `pk_test_` key against a Clerk dev instance.
 * Production (machinedog.dev) uses the `pk_live_` key against the prod
 * instance whose frontend API is CNAMEd to clerk.machinedog.dev. No
 * satellite-domain wiring is needed for either case — the prod key works
 * directly on the primary domain, and the dev key works on any host the
 * Clerk dev instance allow-lists.
 */

import { lazy, Suspense, type ReactNode } from "react";

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const PUBLISHABLE_KEY = env.VITE_CLERK_PUBLISHABLE_KEY;

export function isClerkEnabled(): boolean {
  return !!PUBLISHABLE_KEY;
}

export function useClerkEnabled(): boolean {
  return isClerkEnabled();
}

const LazyClerkProvider = lazy(async () => {
  const mod = await import("@clerk/clerk-react");
  return {
    default: ({ children }: { children: ReactNode }) => (
      <mod.ClerkProvider
        publishableKey={PUBLISHABLE_KEY!}
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
