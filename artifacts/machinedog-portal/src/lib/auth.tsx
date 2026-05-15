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
import { useAuth as useClerkAuth, useUser } from "@clerk/react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { setBillingApiTokenGetter } from "./billing-api";

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
  organization: AuthOrganization | null;
  member: AuthMember | null;
  /**
   * Temporary alias for `organization`. Older pages refer to the active
   * tenant as `client` from the pre-Clerk era. Kept until those callers are
   * renamed in a follow-up pass.
   */
  client: AuthOrganization | null;
  isLoading: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface MeResponse {
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
  const clerk = useClerkAuth();
  const userHook = useUser();

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

  // Wire bearer-token auth into the generated API client exactly once. The
  // getter reads from the ref so it always sees the latest Clerk handle.
  useEffect(() => {
    setBaseUrl(null);
    const getter = async () => {
      try {
        const c = clerkRef.current;
        if (!c) return null;
        return (await c.getToken()) ?? null;
      } catch {
        return null;
      }
    };
    setAuthTokenGetter(getter);
    setBillingApiTokenGetter(getter);
    return () => {
      setAuthTokenGetter(null);
      setBillingApiTokenGetter(null);
    };
  }, []);

  const refresh = useCallback(async () => {
    const c = clerkRef.current;
    if (!c?.isSignedIn) {
      setMe(null);
      setIsFetching(false);
      return;
    }
    setIsFetching(true);
    const data = await fetchMe(() => c.getToken());
    setMe(data);
    setIsFetching(false);
  }, []);

  // Refetch /me only when Clerk's signed-in identity actually changes —
  // depend on primitive values, not the hook return objects, so this effect
  // does not re-fire on every render.
  useEffect(() => {
    if (!clerk.isLoaded || !userHook.isLoaded) {
      setIsFetching(true);
      return;
    }
    void refresh();
  }, [clerk.isLoaded, clerk.isSignedIn, userHook.isLoaded, userHook.user?.id, refresh]);

  const signOut = useCallback(async () => {
    try {
      await clerk.signOut();
    } catch {
      // ignore
    }
    setMe(null);
  }, [clerk]);

  const value = useMemo<AuthContextValue>(() => {
    const isLoading =
      !clerk.isLoaded || !userHook.isLoaded || (!!clerk.isSignedIn && isFetching);
    const organization = me?.organization ?? null;
    return {
      organization,
      member: me?.member ?? null,
      client: organization,
      isLoading,
      isSignedIn: !!clerk.isSignedIn && !!me?.member,
      signOut,
      refresh,
    };
  }, [clerk, userHook, isFetching, me, signOut, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
