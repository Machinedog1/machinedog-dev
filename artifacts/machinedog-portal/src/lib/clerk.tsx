/**
 * Clerk integration wrapper for the portal — wired for Replit-managed Clerk.
 *
 * Per the clerk-auth skill canonical wiring:
 *   - publishableKey resolved via publishableKeyFromHost so the same build
 *     serves multiple Clerk custom domains.
 *   - proxyUrl is unconditional.
 *   - Uses @clerk/react (Replit's flavor), not @clerk/clerk-react.
 *
 * Short-circuits BEFORE mounting ClerkProvider when the publishable key is
 * absent, so a missing/unprovisioned Replit-managed Clerk does not blank-
 * screen the app or hang at the loading spinner. Pages can detect this via
 * `isClerkConfigured()` and render a sane fallback.
 */

import { lazy, Suspense, type ReactNode } from "react";
import { ClerkErrorBoundary } from "@/components/ClerkErrorBoundary";

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

export function isClerkConfigured(): boolean {
  return !!env.VITE_CLERK_PUBLISHABLE_KEY;
}

const LazyClerkProvider = lazy(async () => {
  const [{ ClerkProvider }, { publishableKeyFromHost }] = await Promise.all([
    import("@clerk/react"),
    import("@clerk/react/internal"),
  ]);
  const publishableKey = publishableKeyFromHost(
    window.location.hostname,
    env.VITE_CLERK_PUBLISHABLE_KEY,
  );
  const proxyUrl = env.VITE_CLERK_PROXY_URL;
  return {
    default: ({ children }: { children: ReactNode }) => (
      <ClerkProvider
        publishableKey={publishableKey}
        proxyUrl={proxyUrl}
        afterSignOutUrl="/sign-in"
      >
        {children}
      </ClerkProvider>
    ),
  };
});

export function ClerkProviderWrapper({ children }: { children: ReactNode }) {
  // Short-circuit: render children with no provider when Clerk hasn't been
  // configured. Downstream code checks isClerkConfigured() and renders a
  // helpful screen instead of crashing or hanging.
  if (!isClerkConfigured()) {
    return <>{children}</>;
  }
  return (
    <ClerkErrorBoundary>
      <Suspense fallback={null}>
        <LazyClerkProvider>{children}</LazyClerkProvider>
      </Suspense>
    </ClerkErrorBoundary>
  );
}
