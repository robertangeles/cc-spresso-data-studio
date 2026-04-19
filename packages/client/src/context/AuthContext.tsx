import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { ReactNode } from 'react';
import type { User, SessionStatus } from '@cc/shared';
import axios from 'axios';
import { api, getAccessToken, setAccessToken } from '../lib/api';

interface AuthContextType {
  user: Omit<User, 'createdAt' | 'updatedAt'> | null;
  isLoading: boolean;
  sessionStatus: SessionStatus | null;
  refreshSessionStatus: () => Promise<void>;
  refreshVerificationStatus: () => Promise<void>;
  login: (email: string, password: string) => Promise<string | null>;
  loginWithGoogle: (code: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    turnstileToken?: string,
    planId?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextType['user']>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);

  const refreshSessionStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/profile/sessions');
      setSessionStatus(data.data);
    } catch {
      // Non-blocking — keep previous state
    }
  }, []);

  // Try to restore session on mount.
  // Guard against React StrictMode double-fire which causes two concurrent
  // refresh calls — the second would fail if token rotation already revoked the old token.
  useEffect(() => {
    // Skip session restore on OAuth callback routes. The callback page will
    // authenticate via its own flow and calling /auth/refresh here races with
    // it — an old JWT (e.g. pre-verification) would overwrite fresh user state.
    if (window.location.pathname.startsWith('/auth/google/callback')) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const restoreSession = async () => {
      // E2E hook: if api.ts pre-loaded an access token from
      // window.__E2E_ACCESS_TOKEN__, skip the cookie-based refresh dance
      // (Playwright contexts don't carry the refreshToken cookie). We
      // derive the user from the JWT directly.
      const preloaded = getAccessToken();
      if (preloaded) {
        try {
          const payload = JSON.parse(atob(preloaded.split('.')[1]));
          setUser({
            id: payload.userId,
            email: payload.email,
            name: payload.name,
            role: payload.role,
            subscriptionTier: payload.subscriptionTier ?? 'free',
            isEmailVerified: payload.isEmailVerified ?? true,
          });
          if (!cancelled) setIsLoading(false);
          return;
        } catch {
          // fall through to normal refresh path
        }
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        if (cancelled) return;
        setAccessToken(data.data.accessToken);
        // Decode user from token (basic decode, not verification — server verified it)
        const payload = JSON.parse(atob(data.data.accessToken.split('.')[1]));
        setUser({
          id: payload.userId,
          email: payload.email,
          name: payload.name,
          role: payload.role,
          subscriptionTier: payload.subscriptionTier ?? 'free',
          isEmailVerified: payload.isEmailVerified ?? true,
        });
      } catch {
        if (cancelled) return;
        // No valid session
        setAccessToken(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch session status when user is set
  useEffect(() => {
    if (user) {
      refreshSessionStatus();
    } else {
      setSessionStatus(null);
    }
  }, [user, refreshSessionStatus]);

  const refreshVerificationStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/verification-status');
      if (data.data?.isEmailVerified) {
        setUser((prev) => (prev ? { ...prev, isEmailVerified: true } : prev));
      }
    } catch {
      // Non-blocking
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
    return data.data.pendingPlanId || null;
  }, []);

  const loginWithGoogle = useCallback(async (code: string) => {
    const { data } = await api.post('/auth/google/callback', { code });
    setAccessToken(data.data.accessToken);
    // Clear stale org selection from a previous session — a different user's
    // orgId would cause org-scoped requests to 401 and bounce us to login.
    try {
      window.localStorage.removeItem('spresso_current_org_id');
    } catch {
      /* noop */
    }
    // flushSync forces the user state to commit before we return, so the
    // caller's navigate() doesn't race ProtectedRoute rendering with user=null.
    flushSync(() => {
      setUser(data.data.user);
    });
  }, []);

  const register = useCallback(
    async (
      email: string,
      password: string,
      name: string,
      turnstileToken?: string,
      planId?: string,
    ) => {
      const { data } = await api.post('/auth/register', {
        email,
        password,
        name,
        turnstileToken,
        planId,
      });
      setAccessToken(data.data.accessToken);
      setUser(data.data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        sessionStatus,
        refreshSessionStatus,
        refreshVerificationStatus,
        login,
        loginWithGoogle,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
