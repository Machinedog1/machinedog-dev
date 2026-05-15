import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Catches errors thrown by Clerk's provider/components (most commonly
 * "Missing publishableKey" when Replit-managed Clerk hasn't provisioned).
 * Without this boundary the entire React tree blank-screens silently.
 */
export class ClerkErrorBoundary extends Component<
  { children: ReactNode; fallback?: (err: Error, reset: () => void) => ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.warn("[ClerkErrorBoundary]", error.message);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const err = this.state.error;
      if (this.props.fallback) return this.props.fallback(err, this.reset);
      return (
        <div
          className="dark min-h-screen w-full text-white flex items-center justify-center px-6"
          style={{ background: "hsl(220 45% 3%)" }}
        >
          <div className="max-w-lg w-full rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-6">
            <div className="text-xs font-mono uppercase tracking-wider text-rose-300 mb-2">
              Auth provider error
            </div>
            <h1 className="text-xl font-bold mb-3">Sign-in is not available</h1>
            <p className="text-sm text-white/80 mb-4">
              The Clerk auth provider failed to initialize. The most likely cause is
              that Replit-managed Clerk hasn't been provisioned yet, so the
              publishable key is missing.
            </p>
            <pre className="text-xs font-mono bg-black/40 rounded p-3 overflow-auto text-rose-200 mb-4">
              {err.message}
            </pre>
            <div className="flex gap-2">
              <a
                href="/auth-debug"
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-white text-black hover:bg-white/90"
              >
                Open /auth-debug
              </a>
              <a
                href="/"
                className="rounded-lg px-4 py-2 text-sm font-semibold bg-white/10 hover:bg-white/15 border border-white/20"
              >
                Back to home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}
