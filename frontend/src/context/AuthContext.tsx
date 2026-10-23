import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { config } from '@/config/env';
import { setUnauthorizedHandler, tokenStore } from '@/services/apiClient';
import { authService } from '@/services';
import type { User } from '@/types';
import { can, type Permission } from '@/utils/permissions';

interface AuthContextValue {
  user: User | null;
  /** true while an existing session token is being checked on page load */
  restoring: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  can(permission: Permission): boolean;
}

/** Used when VITE_AUTH_ENABLED=false (local demo only). */
const LOCAL_USER: User = { id: 'local', name: 'Homeowner', email: 'local@township', role: 'admin' };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(config.authEnabled ? null : LOCAL_USER);
  const [restoring, setRestoring] = useState(config.authEnabled && !!tokenStore.get());

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    const token = tokenStore.get();
    if (!config.authEnabled || !token) return;
    authService
      .me(token)
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setRestoring(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await authService.login(email, password);
    tokenStore.set(session.token);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    tokenStore.clear();
    setUser(config.authEnabled ? null : LOCAL_USER);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ user, restoring, login, logout, can: (p) => can(user, p) }), [user, restoring, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
