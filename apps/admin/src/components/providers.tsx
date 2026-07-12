'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  loginRequest,
  logoutRequest,
  tryRefreshSession,
  type AdminUser,
} from '@/lib/api';

type AuthStatus = 'loading' | 'guest' | 'authed';

interface AdminAuthValue {
  user: AdminUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth используется вне <Providers>');
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const [user, setUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    tryRefreshSession().then((session) => {
      if (cancelled) return;
      if (session && session.user.role === 'admin') {
        setUser(session.user);
        setStatus('authed');
      } else {
        setStatus('guest');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginRequest(email, password);
    if (session.user.role !== 'admin') {
      await logoutRequest();
      throw new Error('У этого аккаунта нет прав администратора');
    }
    setUser(session.user);
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus('guest');
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);

  return (
    <QueryClientProvider client={queryClient}>
      <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
    </QueryClientProvider>
  );
}
