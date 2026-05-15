/**
 * Clerk integration wrapper for the portal — wired for Replit-managed Clerk.
 *
 * Per the clerk-auth skill canonical wiring:
 *   - publishableKey is resolved from window.location.hostname so the same
 *     build serves multiple Clerk custom domains.
 *   - proxyUrl is unconditional (empty string in dev, auto-populated in prod).
 *   - Uses @clerk/react (Replit's flavor), not @clerk/clerk-react.
 *
 * Wrapped in ClerkErrorBoundary so a missing publishable key shows a real
 * diagnostic screen + link to /auth-debug instead of blank-screening the app.
 */

import { lazy, Suspense, type ReactNode } from "react";
import { ClerkErrorBoundary } from "@/components/ClerkErrorBoundary";

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;

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
  return (
    <ClerkErrorBoundary>
      <Suspense fallback={null}>
        <LazyClerkProvider>{children}</LazyClerkProvider>
      </Suspense>
    </ClerkErrorBoundary>
  );
}
