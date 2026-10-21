import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { securityService } from '@/services';
import type { SecuritySettings, SecurityUpdate } from '@/types';

/** Re-check often enough that the away-from-home dates switching on/off shows up without a reload. */
const REFRESH_MS = 30000;

interface SecurityContextValue {
  security?: SecuritySettings;
  error: Error | null;
  /** PUT /api/security; throws the backend message on failure */
  update(patch: SecurityUpdate): Promise<void>;
  reload(): void;
}

const SecurityContext = createContext<SecurityContextValue | null>(null);

/** Shares the security level between the top-bar badge and the Live Monitoring control. */
export function SecurityProvider({ children }: { children: ReactNode }) {
  const [security, setSecurity] = useState<SecuritySettings>();
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(() => {
    securityService
      .get()
      .then((s) => (setSecurity(s), setError(null)))
      .catch((e: Error) => setError(e));
  }, []);

  useEffect(() => {
    reload();
    const t = window.setInterval(() => document.visibilityState === 'visible' && reload(), REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  const update = useCallback(
    async (patch: SecurityUpdate) => {
      const res = await securityService.update(patch);
      if (res && typeof res === 'object' && 'effectiveLevel' in res) setSecurity(res);
      else reload();
    },
    [reload],
  );

  const value = useMemo(() => ({ security, error, update, reload }), [security, error, update, reload]);
  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used inside <SecurityProvider>');
  return ctx;
}
