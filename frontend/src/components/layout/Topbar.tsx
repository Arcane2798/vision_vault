import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Bot, ChevronRight, LogOut, Menu, Moon, Sun, User as UserIcon } from 'lucide-react';
import { config } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useRealtime } from '@/context/RealtimeContext';
import { useTheme } from '@/context/ThemeContext';
import type { ConnectionState } from '@/types';
import { cn, formatGuardAck, formatRelative, incidentHeadline, roleLabel } from '@/utils/format';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { SecurityBadge } from '@/components/security/SecurityBadge';
import { IconButton } from '@/components/ui/Button';
import { NAV_GROUPS } from './Sidebar';

const connectionUi: Record<ConnectionState, { label: string; short: string; dot: string }> = {
  connected: { label: 'Live alerts connected', short: 'Connected', dot: 'bg-ok' },
  connecting: { label: 'Connecting to alerts…', short: 'Connecting', dot: 'bg-warn animate-pulse' },
  disconnected: { label: 'Alerts disconnected - retrying', short: 'Reconnecting', dot: 'bg-danger' },
  disabled: { label: 'Live alerts off', short: 'Alerts off', dot: 'bg-ink-3' },
};

/** Closes a popover on an outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** "Monitor › Incidents › INC-12" from the current route. */
function useBreadcrumb(): { section?: string; title: string; titleTo?: string; leaf?: string } {
  const { pathname } = useLocation();
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (item.to === '/' ? pathname === '/' : pathname === item.to) return { section: g.label, title: item.label };
      if (item.to !== '/' && pathname.startsWith(item.to + '/')) {
        return { section: g.label, title: item.label, titleTo: item.to, leaf: decodeURIComponent(pathname.slice(item.to.length + 1)) };
      }
    }
  }
  return { title: 'Not found' };
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { connection, alerts: newAlerts, guardAcks, unseen, markSeen, clearAlerts } = useRealtime();
  // alerts from this session (with any guard response), plus responses to older alerts
  const alerts = [...newAlerts, ...guardAcks.filter((g) => !newAlerts.some((a) => a.id === g.id))];
  const bell = usePopover();
  const account = usePopover();
  const conn = connectionUi[connection];
  const chat = useChat();
  const { theme, toggle } = useTheme();
  const crumb = useBreadcrumb();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-surface-0/85 px-4 backdrop-blur-md lg:px-6">
      <IconButton label="Open menu" className="lg:hidden" onClick={onMenu}>
        <Menu className="h-5 w-5" />
      </IconButton>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumb.section && (
            <li className="hidden items-center gap-1.5 text-ink-3 sm:flex">
              {crumb.section}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </li>
          )}
          <li className={cn('truncate', crumb.leaf ? 'text-ink-3' : 'font-semibold text-ink-1')} aria-current={crumb.leaf ? undefined : 'page'}>
            {crumb.titleTo ? (
              <Link to={crumb.titleTo} className="hover:text-ink-1">
                {crumb.title}
              </Link>
            ) : (
              crumb.title
            )}
          </li>
          {crumb.leaf && (
            <li className="flex min-w-0 items-center gap-1.5 font-semibold text-ink-1" aria-current="page">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="truncate font-mono text-[13px]">{crumb.leaf}</span>
            </li>
          )}
        </ol>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <div
          className="mr-1 hidden items-center gap-2 rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 md:flex"
          role="status"
          aria-live="polite"
          title={conn.label}
        >
          <span className={cn('h-2 w-2 rounded-full', conn.dot)} aria-hidden />
          <span className="hidden xl:inline">{conn.label}</span>
          <span className="xl:hidden">{conn.short}</span>
        </div>
        <span className="mr-1">
          <SecurityBadge />
        </span>

        <button
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-full px-2 text-sm text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink-1 md:px-3',
            chat.open && 'bg-surface-3 text-ink-1',
          )}
          aria-expanded={chat.open}
          aria-label="Ask Viva Bot"
          title="Ask Viva Bot"
          onClick={() => chat.setOpen(!chat.open)}
        >
          <Bot className="h-[18px] w-[18px]" aria-hidden />
          <span className="hidden md:inline">Viva Bot</span>
        </button>

        <ThemeToggle theme={theme} onToggle={toggle} />

        <div className="relative" ref={bell.ref}>
          <IconButton
            label={`Alerts, ${unseen} new`}
            aria-expanded={bell.open}
            active={bell.open}
            onClick={() => (bell.setOpen((o) => !o), markSeen())}
          >
            <Bell className="h-[18px] w-[18px]" />
            {unseen > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-surface-0">
                {unseen > 9 ? '9+' : unseen}
              </span>
            )}
          </IconButton>
          {bell.open && (
            <div className="absolute right-0 mt-2 w-[min(23rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-pop">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">Alerts this session</p>
                  <p className="text-[11px] text-ink-3">New detections and guard-house responses since you opened the dashboard</p>
                </div>
                {alerts.length > 0 && (
                  <button className="text-xs text-ink-3 hover:text-ink-1" onClick={clearAlerts}>
                    Clear
                  </button>
                )}
              </div>
              <ul className="max-h-96 overflow-y-auto">
                {alerts.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">No new alerts since you opened the dashboard.</li>}
                {alerts.map((a) => (
                  <li key={a.id} className="border-b border-line last:border-0">
                    <Link to={`/incidents/${a.id}`} onClick={() => bell.setOpen(false)} className="relative block py-3 pl-5 pr-4 hover:bg-surface-2">
                      <span className={cn('absolute bottom-3 left-2 top-3 w-[3px] rounded-full', a.label === 'intrusion' ? 'bg-danger' : 'bg-caution')} aria-hidden />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{incidentHeadline(a)}</p>
                        <span className="shrink-0 text-xs tabular-nums text-ink-3">{formatRelative(a.timestamp)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-3">{a.cameraName}</p>
                      {a.guardNotified && (
                        <div className="mt-1.5">
                          <GuardNotifiedBadge acknowledged={!!a.guardAcknowledgedAt} />
                        </div>
                      )}
                      {a.guardAcknowledgedAt && <p className="mt-1 text-xs text-ok-fg">Guard house: {formatGuardAck(a.guardAcknowledgedAt, a.guardAckNote)}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/incidents" onClick={() => bell.setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-brand-fg hover:bg-surface-2">
                View all incidents
              </Link>
            </div>
          )}
        </div>

        <div className="relative" ref={account.ref}>
          <button
            className="flex items-center gap-2 rounded-full p-1 pr-1 transition-colors hover:bg-surface-3 md:pr-3"
            aria-expanded={account.open}
            aria-label="Account menu"
            onClick={() => account.setOpen((o) => !o)}
          >
            <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface-3">
              <UserIcon className="h-4 w-4 text-ink-2" aria-hidden />
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-[13px] font-medium">{user?.name}</span>
              <span className="block text-[11px] text-ink-3">{user && roleLabel[user.role]}</span>
            </span>
          </button>
          {account.open && (
            <div className="absolute right-0 mt-2 w-60 animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-pop">
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

/** Sun / moon switch. role="switch" so screen readers announce the state. */
function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const dark = theme === 'dark';
  return (
    <button
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={onToggle}
      className="relative flex h-8 w-[3.75rem] shrink-0 items-center rounded-full border border-line bg-surface-2 p-0.5 transition-colors hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span
        className={cn('absolute top-0.5 h-[26px] w-[26px] rounded-full bg-surface-4 shadow-panel transition-transform duration-200 ease-out', dark ? 'translate-x-[1.75rem]' : 'translate-x-0')}
        aria-hidden
      />
      <Sun className={cn('relative z-10 mx-[5px] h-4 w-4 transition-colors', dark ? 'text-ink-3' : 'text-warn-fg')} aria-hidden />
      <Moon className={cn('relative z-10 ml-auto mr-[5px] h-4 w-4 transition-colors', dark ? 'text-brand-fg' : 'text-ink-3')} aria-hidden />
    </button>
  );
}
