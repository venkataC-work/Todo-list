import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';
import { authApi } from './api/auth-api';
import type { Credentials, Registration, PublicUser, Session } from '@todo/contracts';
import { useObservable } from '@/shared/lib/observable';
import { sessionStore } from '@/shared/session/session-store';

interface AuthContextValue {
  user: PublicUser | null;
  login: (credentials: Credentials) => Promise<void>;
  register: (registration: Registration) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const authenticate = async (request: () => Promise<Session>) => {
  const complete = sessionStore.beginAuthentication();
  complete(await request());
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const session = useObservable(sessionStore);
  const queryClient = useQueryClient();

  // Drop cached data whenever the session ends (logout or expired token) so the next
  // user never sees the previous user's tasks.
  useEffect(() => {
    if (!session) queryClient.clear();
  }, [session, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      login: (credentials) => authenticate(() => authApi.login(credentials)),
      register: (registration) => authenticate(() => authApi.register(registration)),
      logout: sessionStore.clear,
    }),
    [session],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
};

export const useAuth = () => {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
