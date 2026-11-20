import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {api, getStoredToken, setStoredToken} from '../lib/api';
import type {AuthSession} from '../types/auth';

interface AuthContextValue {
  session: AuthSession | null;
  hasPresident: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  bootstrapPresident: (payload: {
    fullName: string;
    username: string;
    email: string;
    phone?: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  updateSession: (next: AuthSession) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [hasPresident, setHasPresident] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();
      setHasPresident(status.hasPresident ?? Boolean(status.hasChairman));

      const token = getStoredToken();
      if (!token) {
        setSession(null);
        return;
      }

      const me = await api.getMe();
      setSession(me);
    } catch {
      setStoredToken(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.login({identifier, password});
    setStoredToken(res.token);
    setSession(res.session);
  }, []);

  const bootstrapPresident = useCallback(
    async (payload: {
      fullName: string;
      username: string;
      email: string;
      phone?: string;
      password: string;
    }) => {
      const res = await api.bootstrapPresident(payload);
      setStoredToken(res.token);
      setHasPresident(true);
      setSession(res.session);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await api.logout();
      }
    } catch {
      // Clear local session regardless of network outcome
    } finally {
      setStoredToken(null);
      setSession(null);
    }
  }, []);

  const updateSession = useCallback((next: AuthSession) => {
    setSession(next);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        hasPresident,
        isLoading,
        login,
        bootstrapPresident,
        logout,
        refreshSession,
        updateSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
