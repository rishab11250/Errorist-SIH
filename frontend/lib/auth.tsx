'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, apiFetch } from './api-client';

export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  role: 'inspector' | 'admin';
}

export const OFFLINE_INSPECTOR: AuthUser = {
  id: 0,
  username: 'offline',
  display_name: 'Offline inspector',
  role: 'inspector',
};

interface UserEnvelope {
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export async function loginWithCredentials(username: string, password: string) {
  const response = await apiFetch<UserEnvelope>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return response.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await apiFetch<UserEnvelope>('/api/auth/me', {
        signal: controller.signal,
      });
      setUser(response.user);
      return response.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // The middleware can only see that a cookie exists, not whether its
        // server-side session is still valid. Clear stale/expired cookies here
        // before the workspace redirects to /login, otherwise middleware can
        // bounce the browser back to / indefinitely.
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => undefined);
        setUser(null);
        return null;
      }
      if (
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        setUser(OFFLINE_INSPECTOR);
        return OFFLINE_INSPECTOR;
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    let active = true;
    refresh()
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const authenticated = await loginWithCredentials(username, password);
    setUser(authenticated);
    return authenticated;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [loading, login, logout, refresh, user]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
