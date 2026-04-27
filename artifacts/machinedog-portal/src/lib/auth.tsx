import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export interface AuthClient {
  id: number;
  email: string;
  isAdmin: boolean;
  status: string;
  tokenBalance: number;
}

interface AuthContextValue {
  client: AuthClient | null;
  isLoading: boolean;
  isSignedIn: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<AuthClient | null> {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { client?: AuthClient | null };
    return body.client ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<AuthClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const c = await fetchMe();
    setClient(c);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        return { error: body.error ?? "Sign in failed" };
      }
      await refresh();
      return {};
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
    setClient(null);
  }, []);

  const value: AuthContextValue = {
    client,
    isLoading,
    isSignedIn: !!client,
    signIn,
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
