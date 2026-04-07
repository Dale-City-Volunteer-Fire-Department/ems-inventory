import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { createElement } from 'react';
import type { UserRole } from '@shared/types';

export interface AuthUser {
  role: UserRole;
  name: string;
  email: string;
  stationId: number | null;
  photoUrl: string | null;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!res.ok) {
          if (!cancelled) setUser(null);
          return;
        }
        const data = (await res.json()) as { role?: UserRole; name?: string; email?: string | null; stationId?: number | null; photoUrl?: string | null };
        if (!cancelled && data.role) {
          setUser({
            role: data.role,
            name: data.name ?? '',
            email: data.email ?? '',
            stationId: data.stationId ?? null,
            photoUrl: data.photoUrl ?? null,
          });
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((u: AuthUser) => {
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // best-effort
    }
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    isAuthenticated: user !== null,
    isLoading,
    user,
    login,
    logout,
  };

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
