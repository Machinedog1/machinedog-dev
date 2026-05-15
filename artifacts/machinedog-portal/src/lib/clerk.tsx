/**
 * Clerk integration wrapper for the portal.
 *
 * Uses the Replit-managed `VITE_CLERK_PUBLISHABLE_KEY` that is auto-injected
 * at build/runtime by the Replit Auth pane. There is no demo-mode fallback —
 * if the key is missing, ClerkProvider will throw on mount, which is the
 * correct loud failure for an auth-required app.
 */

import { lazy, Suspense, type ReactNode } from "react";

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const PUBLISHABLE_KEY = env.VITE_CLERK_PUBLISHABLE_KEY ?? "";

const LazyClerkProvider = lazy(async () => {
  const mod = await import("@clerk/clerk-react");
  return {
    default: ({ children }: { children: ReactNode }) => (
      <mod.ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        afterSignOutUrl="/sign-in"
      >
        {children}
      </mod.ClerkProvider>
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
