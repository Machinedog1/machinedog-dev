/**
 * Clerk integration wrapper for the portal — wired for Replit-managed Clerk.
 *
 * Per the clerk-auth skill canonical wiring (verbatim):
 *   - publishableKey is resolved from window.location.hostname so the same
 *     build serves multiple Clerk custom domains.
 *   - proxyUrl is unconditional (empty string in dev, auto-populated in prod).
 *   - Uses @clerk/react (Replit's flavor), not @clerk/clerk-react.
 */

import { lazy, Suspense, type ReactNode } from "react";

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
    <Suspense fallback={null}>
      <LazyClerkProvider>{children}</LazyClerkProvider>
    </Suspense>
  );
}
