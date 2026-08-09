import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { MeResponse } from "@buildguard/shared-types";

const TOKEN_KEY = "bg_admin_access_token";
const USER_KEY = "bg_admin_user";

interface AuthState {
  token: string | null;
  user: MeResponse | null;
  login: (token: string, user: MeResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<MeResponse | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as MeResponse) : null;
  });

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      login: (t, u) => {
        localStorage.setItem(TOKEN_KEY, t);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        setToken(t);
        setUser(u);
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
