import { NavLink } from 'react-router-dom';
import { Building2, Cctv, ExternalLink, Film, LayoutDashboard, ListChecks, MonitorPlay, Users, X } from 'lucide-react';
import { config } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/format';
import type { Permission } from '@/utils/permissions';

export const NAV_ITEMS: Array<{ to: string; label: string; Icon: typeof Cctv; permission: Permission }> = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, permission: 'view:dashboard' },
  { to: '/live', label: 'Live Monitoring', Icon: MonitorPlay, permission: 'view:live' },
  { to: '/incidents', label: 'Incidents', Icon: ListChecks, permission: 'view:incidents' },
  { to: '/people', label: 'Residents & Visitors', Icon: Users, permission: 'manage:people' },
  { to: '/test-video', label: 'Test with Video', Icon: Film, permission: 'view:live' },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface-1 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand">
              <Cctv className="h-4 w-4 text-white" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">{config.appName}</p>
              <p className="text-[11px] text-ink-3">Smart township home security</p>
            </div>
          </div>
          <button className="rounded p-1 text-ink-2 hover:bg-surface-3 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.filter((i) => can(i.permission)).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-soft text-white' : 'text-ink-2 hover:bg-surface-3 hover:text-ink-1',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
          {/* the guard house's own screen - opens in a new tab so it can sit in a second window or on a phone */}
          <a
            href="/guard"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink-1"
          >
            <Building2 className="h-4 w-4" aria-hidden />
            <span className="flex-1">Guard House view</span>
            <ExternalLink className="h-3.5 w-3.5 text-ink-3" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </nav>
        <p className="border-t border-line p-4 text-[11px] leading-relaxed text-ink-3">
          AI results are <b className="text-ink-2">potential</b> incidents until reviewed by an authorised person.
        </p>
      </aside>
    </>
  );
}
