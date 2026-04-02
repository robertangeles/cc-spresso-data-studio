import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, SessionStatus } from '@cc/shared';
import axios from 'axios';
import { api, setAccessToken } from '../lib/api';

interface AuthContextType {
  user: Omit<User, 'createdAt' | 'updatedAt'> | null;
  isLoading: boolean;
  sessionStatus: SessionStatus | null;
  refreshSessionStatus: () => Promise<void>;
  refreshVerificationStatus: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (code: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    turnstileToken?: string,
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

  // Try to restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        setAccessToken(data.data.accessToken);
        // Decode user from token (basic decode, not verification — server verified it)
        const payload = JSON.parse(atob(data.data.accessToken.split('.')[1]));
        setUser({
          id: payload.userId,
          email: payload.email,
          name: payload.name,
          role: payload.role,
          isEmailVerified: payload.isEmailVerified ?? true,
        });
      } catch {
        // No valid session
        setAccessToken(null);
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
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

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
  }, []);

  const loginWithGoogle = useCallback(async (code: string) => {
    const { data } = await api.post('/auth/google/callback', { code });
    setAccessToken(data.data.accessToken);
    setUser(data.data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, turnstileToken?: string) => {
      const { data } = await api.post('/auth/register', { email, password, name, turnstileToken });
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
