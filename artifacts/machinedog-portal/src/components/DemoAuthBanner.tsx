/**
 * Demo-mode banner shown at the top of the app when Clerk auth is NOT
 * configured (i.e. local dev without VITE_CLERK_PUBLISHABLE_KEY). Makes it
 * obvious to operators / collaborators that the legacy cookie-session auth
 * path is the active one. Hidden in production once Clerk env vars land.
 */

import { isClerkEnabled } from "@/lib/clerk";

export function DemoAuthBanner() {
  if (isClerkEnabled()) return null;
  return (
    <div
      data-testid="demo-auth-banner"
      style={{
        background: "rgba(234, 179, 8, 0.12)",
        borderBottom: "1px solid rgba(234, 179, 8, 0.45)",
        color: "#fde68a",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        padding: "6px 16px",
        textAlign: "center",
        letterSpacing: "0.02em",
      }}
    >
      DEMO AUTH MODE — Clerk is not configured. Using legacy cookie sessions. Set
      <code style={{ margin: "0 6px" }}>VITE_CLERK_PUBLISHABLE_KEY</code>+
      <code style={{ margin: "0 6px" }}>CLERK_SECRET_KEY</code>to enable Clerk.
    </div>
  );
}
