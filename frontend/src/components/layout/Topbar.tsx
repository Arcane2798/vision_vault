import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Bot, Building2, ChevronRight, LogOut, MonitorPlay, Moon, Sun } from 'lucide-react';
import { config } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { useRealtime } from '@/context/RealtimeContext';
import { THEMES, useTheme, type Theme } from '@/context/ThemeContext';
import type { ConnectionState } from '@/types';
import { cn, formatGuardAck, formatRelative, incidentHeadline, roleLabel } from '@/utils/format';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { SecurityBadge } from '@/components/security/SecurityBadge';
import { IconButton } from '@/components/ui/Button';
import { NAV_GROUPS } from './Sidebar';
import { BrandLockup } from './BrandMark';

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

export function Topbar() {
  const { user, logout } = useAuth();
  const { connection, alerts: newAlerts, guardAcks, unseen, markSeen, clearAlerts } = useRealtime();
  // alerts from this session (with any guard response), plus responses to older alerts
  const alerts = [...newAlerts, ...guardAcks.filter((g) => !newAlerts.some((a) => a.id === g.id))];
  const bell = usePopover();
  const account = usePopover();
  const conn = connectionUi[connection];
  const chat = useChat();
  const { theme, setTheme, toggle } = useTheme();
  const crumb = useBreadcrumb();

  return (
    <header className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-10">
      {/* the sidebar carries the brand on desktop */}
      <Link to="/" className="mr-2 min-w-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden" aria-label={`${config.appName} home`}>
        <BrandLockup />
      </Link>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 border-l border-line pl-4 md:block lg:border-0 lg:pl-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumb.section && (
            <li className="hidden items-center gap-1.5 text-ink-3 sm:flex">
              {crumb.section}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </li>
          )}
          <li className={cn('truncate', crumb.leaf ? 'text-ink-3' : 'font-medium text-ink-1')} aria-current={crumb.leaf ? undefined : 'page'}>
            {crumb.titleTo ? (
              <Link to={crumb.titleTo} className="hover:text-ink-1">
                {crumb.title}
              </Link>
            ) : (
              crumb.title
            )}
          </li>
          {crumb.leaf && (
            <li className="flex min-w-0 items-center gap-1.5 font-medium text-ink-1" aria-current="page">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="truncate tabular-nums">{crumb.leaf}</span>
            </li>
          )}
        </ol>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-1">
        <div
          className="mr-2 hidden items-center gap-2 text-xs text-ink-3 lg:flex"
          role="status"
          aria-live="polite"
          title={conn.label}
        >
          <span className={cn('h-2 w-2 rounded-full', conn.dot)} aria-hidden />
          <span className="hidden xl:inline">{conn.label}</span>
          <span className="xl:hidden">{conn.short}</span>
        </div>
        <span className="mr-1 hidden sm:inline">
          <SecurityBadge />
        </span>

        <button
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink-1 md:border md:border-line md:bg-surface-1 md:px-3',
            chat.open && 'border-line-strong bg-surface-3 text-ink-1',
          )}
          aria-expanded={chat.open}
          aria-label="Ask Viva Bot"
          title="Ask Viva Bot"
          onClick={() => chat.setOpen(!chat.open)}
        >
          <Bot className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span className="hidden md:inline">Viva Bot</span>
        </button>

        <ThemeSwitch theme={theme} onChange={setTheme} />
        {/* phones: one button that steps through the themes */}
        <IconButton label={`Theme: ${THEMES.find((t) => t.id === theme)?.label}. Switch theme`} onClick={toggle} className="sm:hidden">
          {(() => {
            const Icon = themeIcon[theme];
            return <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />;
          })()}
        </IconButton>

        <div className="relative" ref={bell.ref}>
          <IconButton
            label={`Alerts, ${unseen} new`}
            aria-expanded={bell.open}
            active={bell.open}
            onClick={() => (bell.setOpen((o) => !o), markSeen())}
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
            {unseen > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-surface-1">
                {unseen > 9 ? '9+' : unseen}
              </span>
            )}
          </IconButton>
          {bell.open && (
            <div className="absolute right-0 mt-2 w-[min(23rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-lg border border-line bg-surface-1 shadow-pop">
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
                    <Link to={`/incidents/${a.id}`} onClick={() => bell.setOpen(false)} className="block px-4 py-3 hover:bg-surface-2">
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
            className="flex items-center rounded-full p-0.5 transition-colors hover:bg-surface-3"
            aria-expanded={account.open}
            aria-label="Account menu"
            onClick={() => account.setOpen((o) => !o)}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-[13px] font-medium text-brand-fg" aria-hidden>
              {(user?.name ?? '?').charAt(0).toUpperCase()}
            </span>
          </button>
          {account.open && (
            <div className="absolute right-0 mt-2 w-60 animate-fade-in overflow-hidden rounded-lg border border-line bg-surface-1 shadow-pop">
              <div className="border-b border-line px-4 py-3">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-ink-3">{user && roleLabel[user.role]}</p>
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

        {/* the one call to action: straight to the camera */}
        <Link
          to="/live"
          className="ml-1 hidden h-9 items-center gap-2 rounded-md bg-brand px-3.5 text-[13px] font-medium text-brand-on transition-colors hover:bg-brand/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:flex"
        >
          <MonitorPlay className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Watch live
        </Link>
      </div>
    </header>
  );
}

const themeIcon: Record<Theme, typeof Sun> = { simedarby: Building2, light: Sun, dark: Moon };

/** Three-way theme switch (Sime Darby / light / dark) as a radio group of icon segments. */
function ThemeSwitch({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour theme" className="hidden h-9 shrink-0 sm:flex items-center rounded-md border border-line bg-surface-1 p-0.5">
      {THEMES.map(({ id, label }) => {
        const Icon = themeIcon[id];
        const on = theme === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={on}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => onChange(id)}
            className={cn(
              'grid h-full w-8 place-items-center rounded-[4px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
              on ? 'bg-brand-soft text-brand-fg' : 'text-ink-3 hover:text-ink-1',
            )}
          >
            <Icon className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
