import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { isClerkEnabled } from "./clerk";

export interface AuthClient {
  id: number;
  email: string;
  isAdmin: boolean;
  status: string;
  tokenBalance: number;
}

export interface AuthOrganization {
  id: number;
  name: string;
  primaryEmail: string;
  status: string;
  tokenBalance: number;
  clerkOrgId: string | null;
}

export interface AuthMember {
  id: number;
  email: string;
  role: string;
  isAdmin: boolean;
  status: string;
}

interface AuthContextValue {
  client: AuthClient | null;
  organization: AuthOrganization | null;
  member: AuthMember | null;
  isLoading: boolean;
  isSignedIn: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface MeResponse {
  client?: AuthClient | null;
  organization?: AuthOrganization | null;
  member?: AuthMember | null;
}

async function fetchMe(getToken: () => Promise<string | null>): Promise<MeResponse | null> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch("/api/auth/me", {
      credentials: "include",
      headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const clerkEnabled = isClerkEnabled();
  const clerk = useClerkAuthSafe(clerkEnabled);
  const userHook = useUserSafe(clerkEnabled);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  // Hold the latest Clerk hook return in a ref so the auth-token-getter and
  // refresh callback below stay referentially stable across renders. Without
  // this, `useClerkAuth()` returns a fresh object every render, the deps
  // churn, and we end up in a tight loop of /me requests where the
  // setAuthTokenGetter cleanup races the next setter — half the requests go
  // out with no Authorization header and 401 in a flood.
  const clerkRef = useRef(clerk);
  clerkRef.current = clerk;

  // Wire bearer-token auth into the generated API client exactly once per
  // (clerkEnabled change). The getter reads from the ref so it always sees
  // the latest Clerk handle.
  useEffect(() => {
    setBaseUrl(null);
    if (!clerkEnabled) {
      setAuthTokenGetter(null);
      return;
    }
    setAuthTokenGetter(async () => {
      try {
        const c = clerkRef.current;
        if (!c) return null;
        return (await c.getToken()) ?? null;
      } catch {
        return null;
      }
    });
    return () => setAuthTokenGetter(null);
  }, [clerkEnabled]);

  const refresh = useCallback(async () => {
    const c = clerkRef.current;
    if (!clerkEnabled || !c?.isSignedIn) {
      setMe(null);
      setIsFetching(false);
      return;
    }
    setIsFetching(true);
    const data = await fetchMe(() => c.getToken());
    setMe(data);
    setIsFetching(false);
  }, [clerkEnabled]);

  // Refetch /me only when Clerk's signed-in identity actually changes —
  // depend on primitive values, not the hook return objects, so this effect
  // does not re-fire on every render.
  useEffect(() => {
    if (!clerkEnabled) {
      setIsFetching(false);
      return;
    }
    if (!clerk?.isLoaded || !userHook?.isLoaded) {
      setIsFetching(true);
      return;
    }
    void refresh();
  }, [clerkEnabled, clerk?.isLoaded, clerk?.isSignedIn, userHook?.isLoaded, userHook?.user?.id, refresh]);

  const signIn = useCallback(async () => {
    return {
      error:
        "Password sign-in has moved. Use the Clerk sign-in form on this page to continue.",
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      if (clerk?.signOut) {
        await clerk.signOut();
      }
    } catch {
      // ignore
    }
    setMe(null);
  }, [clerk]);

  const value = useMemo<AuthContextValue>(() => {
    const isLoading = clerkEnabled
      ? !clerk?.isLoaded || !userHook?.isLoaded || (!!clerk?.isSignedIn && isFetching)
      : false;
    return {
      client: me?.client ?? null,
      organization: me?.organization ?? null,
      member: me?.member ?? null,
      isLoading,
      isSignedIn: !!clerk?.isSignedIn && !!me?.client,
      signIn,
      signOut,
      refresh,
    };
  }, [clerkEnabled, clerk, userHook, isFetching, me, signIn, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Safe wrappers around Clerk hooks. When Clerk is disabled (no publishable
// key configured), the ClerkProvider is not mounted and calling Clerk hooks
// would throw. These wrappers degrade gracefully so the rest of the app can
// keep rendering the demo banner.
// ---------------------------------------------------------------------------

function useClerkAuthSafe(enabled: boolean) {
  if (!enabled) return null;
  try {
    return useClerkAuth();
  } catch {
    return null;
  }
}

function useUserSafe(enabled: boolean) {
  if (!enabled) return null;
  try {
    return useUser();
  } catch {
    return null;
  }
}
