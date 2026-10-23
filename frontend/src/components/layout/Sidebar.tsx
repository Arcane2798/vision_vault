import { Link, NavLink } from 'react-router-dom';
import { Building2, Cctv, Film, LayoutDashboard, ListChecks, Map as MapIcon, MonitorPlay, Users, X } from 'lucide-react';
import { config } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/format';
import type { Permission } from '@/utils/permissions';

export const NAV_ITEMS: Array<{ to: string; label: string; Icon: typeof Cctv; permission: Permission }> = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, permission: 'view:dashboard' },
  { to: '/live', label: 'Live Monitoring', Icon: MonitorPlay, permission: 'view:live' },
  { to: '/incidents', label: 'Incidents', Icon: ListChecks, permission: 'view:incidents' },
  { to: '/people', label: 'Residents & Visitors', Icon: Users, permission: 'manage:people' },
  { to: '/map', label: 'House map', Icon: MapIcon, permission: 'view:live' },
  { to: '/test-video', label: 'Test with Video', Icon: Film, permission: 'view:live' },
];

/** The page colour cut into the red sidebar above and below the active tab, so the tab flows into the page. */
const CORNER = 'pointer-events-none absolute right-0 h-5 w-5';
const cornerAbove = { background: 'radial-gradient(circle at 0 0, transparent 20px, rgb(var(--surface-0)) 20.5px)' };
const cornerBelow = { background: 'radial-gradient(circle at 0 100%, transparent 20px, rgb(var(--surface-0)) 20.5px)' };

/** Red Sime Darby Property sidebar: white logo tile, the active page as a white tab joined to the page. */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between gap-2 px-6 pb-8 pt-7">
          <Link to="/" onClick={onClose} className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm">
              <Cctv className="h-5 w-5 text-brand" aria-hidden />
            </span>
            <span className="leading-tight">
              <span className="block text-xl font-semibold tracking-tight">{config.appName}</span>
              <span className="block text-[11px] text-white/75">Smart township home security</span>
            </span>
          </Link>
          <button className="rounded p-1 text-white/80 hover:bg-white/10 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto pl-5">
          {NAV_ITEMS.filter((i) => can(i.permission)).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-l-full py-3 pl-5 pr-4 text-sm font-medium transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                  isActive ? 'bg-surface-0 text-brand' : 'text-white/90 hover:bg-white/10 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <>
                      <span className={cn(CORNER, '-top-5')} style={cornerAbove} aria-hidden />
                      <span className={cn(CORNER, '-bottom-5')} style={cornerBelow} aria-hidden />
                    </>
                  )}
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* switch to the guard house's own screen (it has a matching button to come back) */}
        <div className="px-6 pb-7 pt-4 text-center">
          <Link
            to="/guard"
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-dark/70 px-4 py-3 text-sm font-medium text-white shadow-inner transition-colors hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <Building2 className="h-4 w-4" aria-hidden />
            Guard House view
          </Link>
          <p className="mt-3 text-xs text-white/75">Homeowner</p>
        </div>
      </aside>
    </>
  );
}
