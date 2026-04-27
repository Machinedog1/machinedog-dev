import { setAuthTokenGetter } from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const TOKEN_KEY = "md_session_token";

const apiBase = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
})();

function apiUrl(path: string): string {
  return `${apiBase}${path}`;
}

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
  acceptInvite: (token: string, password: string) => Promise<{ error?: string }>;
  resetPassword: (token: string, password: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let cachedToken: string | null = null;

async function getStoredToken(): Promise<string | null> {
  if (cachedToken !== null) return cachedToken;
  try {
    const t = await SecureStore.getItemAsync(TOKEN_KEY);
    cachedToken = t;
    return t;
  } catch {
    return null;
  }
}

async function setStoredToken(token: string | null): Promise<void> {
  cachedToken = token;
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

// Wire the bearer-token getter immediately so any early api-client call uses it.
setAuthTokenGetter(() => getStoredToken());

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getStoredToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");
  return fetch(apiUrl(path), { ...init, headers });
}

async function fetchMe(): Promise<AuthClient | null> {
  try {
    const res = await authedFetch("/api/auth/me");
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
      try {
        const res = await authedFetch("/api/auth/sign-in", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          return { error: body.error ?? "Sign in failed" };
        }
        const body = (await res.json()) as { sessionToken?: string };
        if (body.sessionToken) await setStoredToken(body.sessionToken);
        await refresh();
        return {};
      } catch {
        return { error: "Network error. Please try again." };
      }
    },
    [refresh],
  );

  const acceptInvite = useCallback(
    async (token: string, password: string) => {
      try {
        const res = await authedFetch("/api/auth/accept-invite", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          return { error: body.error ?? "Could not accept invite." };
        }
        const body = (await res.json()) as { sessionToken?: string };
        if (body.sessionToken) await setStoredToken(body.sessionToken);
        await refresh();
        return {};
      } catch {
        return { error: "Network error. Please try again." };
      }
    },
    [refresh],
  );

  const resetPassword = useCallback(
    async (token: string, password: string) => {
      try {
        const res = await authedFetch("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          return { error: body.error ?? "Could not reset password." };
        }
        const body = (await res.json()) as { sessionToken?: string };
        if (body.sessionToken) await setStoredToken(body.sessionToken);
        await refresh();
        return {};
      } catch {
        return { error: "Network error. Please try again." };
      }
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await authedFetch("/api/auth/sign-out", { method: "POST" });
    } catch {
      // ignore
    }
    await setStoredToken(null);
    setClient(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      client,
      isLoading,
      isSignedIn: !!client,
      signIn,
      signOut,
      refresh,
      acceptInvite,
      resetPassword,
    }),
    [client, isLoading, signIn, signOut, refresh, acceptInvite, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
