import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, LogOut, Menu, Radio, User as UserIcon } from 'lucide-react';
import { config } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import type { ConnectionState } from '@/types';
import { cn, formatConfidence, formatRelative, roleLabel } from '@/utils/format';
import { IncidentStatusBadge } from '@/components/ui/StatusBadge';

const connectionUi: Record<ConnectionState, { label: string; dot: string }> = {
  connected: { label: 'Live alerts connected', dot: 'bg-ok' },
  connecting: { label: 'Connecting to alerts…', dot: 'bg-warn animate-pulse' },
  disconnected: { label: 'Alerts disconnected - retrying', dot: 'bg-danger' },
  disabled: { label: 'Live alerts off', dot: 'bg-ink-3' },
};

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOutside]);
  return ref;
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { connection, alerts, unseen, markSeen, clearAlerts } = useRealtime();
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const bellRef = useClickOutside(() => setBellOpen(false));
  const userRef = useClickOutside(() => setUserOpen(false));
  const conn = connectionUi[connection];

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface-0/90 px-4 backdrop-blur lg:px-6">
      <button className="rounded-lg p-2 text-ink-2 hover:bg-surface-3 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2 text-xs text-ink-2" role="status" aria-live="polite">
        <span className={cn('h-2.5 w-2.5 rounded-full', conn.dot)} aria-hidden />
        <Radio className="h-3.5 w-3.5 sm:hidden" aria-hidden />
        <span className="hidden sm:inline">{conn.label}</span>
        <span className="sr-only sm:hidden">{conn.label}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <div className="relative" ref={bellRef}>
          <button
            className="relative rounded-lg p-2 text-ink-2 hover:bg-surface-3 hover:text-ink-1"
            aria-label={`Alerts, ${unseen} new`}
            aria-expanded={bellOpen}
            onClick={() => (setBellOpen((o) => !o), markSeen())}
          >
            <Bell className="h-5 w-5" />
            {unseen > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {unseen > 9 ? '9+' : unseen}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <p className="text-sm font-semibold">Security alerts</p>
                {alerts.length > 0 && (
                  <button className="text-xs text-ink-3 hover:text-ink-1" onClick={clearAlerts}>
                    Clear
                  </button>
                )}
              </div>
              <ul className="max-h-96 overflow-y-auto">
                {alerts.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-3">No new alerts since you signed in.</li>}
                {alerts.map((a) => (
                  <li key={a.id} className="border-b border-line last:border-0">
                    <Link to={`/incidents/${a.id}`} onClick={() => setBellOpen(false)} className="block px-4 py-3 hover:bg-surface-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{a.cameraName}</p>
                        <span className="text-xs text-ink-3">{formatRelative(a.timestamp)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-2">
                        {a.label} · {formatConfidence(a.confidence)} confidence
                      </p>
                      <div className="mt-1.5">
                        <IncidentStatusBadge status={a.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/incidents" onClick={() => setBellOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs text-blue-300 hover:bg-surface-2">
                View all incidents
              </Link>
            </div>
          )}
        </div>

        <div className="relative" ref={userRef}>
          <button className="flex items-center gap-2 rounded-lg p-1.5 pr-2 hover:bg-surface-3" aria-expanded={userOpen} onClick={() => setUserOpen((o) => !o)}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-3">
              <UserIcon className="h-4 w-4 text-ink-2" aria-hidden />
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-sm font-medium">{user?.name}</span>
              <span className="block text-[11px] text-ink-3">{user && roleLabel[user.role]}</span>
            </span>
          </button>
          {userOpen && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2xl">
              <div className="border-b border-line px-4 py-3">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-ink-3">{user?.email}</p>
              </div>
              {config.authEnabled ? (
                <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink-1" onClick={logout}>
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </button>
              ) : (
                <p className="px-4 py-2.5 text-xs text-ink-3">Login is disabled (VITE_AUTH_ENABLED=false).</p>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
