import { Link, NavLink } from 'react-router-dom';
import { Building2, ChevronRight, Cctv, Film, LayoutDashboard, ListChecks, Map as MapIcon, MonitorPlay, PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSecurity } from '@/context/SecurityContext';
import { config } from '@/config/env';
import { cn, effectiveLevelText } from '@/utils/format';
import type { Permission } from '@/utils/permissions';
import { BrandMark } from './BrandMark';

type NavItem = { to: string; label: string; Icon: typeof Cctv; permission: Permission };

export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Monitor',
    items: [
      { to: '/', label: 'Dashboard', Icon: LayoutDashboard, permission: 'view:dashboard' },
      { to: '/live', label: 'Live Monitoring', Icon: MonitorPlay, permission: 'view:live' },
      { to: '/incidents', label: 'Incidents', Icon: ListChecks, permission: 'view:incidents' },
    ],
  },
  {
    label: 'Home',
    items: [
      { to: '/people', label: 'Residents & Visitors', Icon: Users, permission: 'manage:people' },
      { to: '/map', label: 'House map', Icon: MapIcon, permission: 'view:live' },
    ],
  },
  {
    label: 'Tools',
    items: [{ to: '/test-video', label: 'Test with Video', Icon: Film, permission: 'view:live' }],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// the active item carries a thin accent rule on its left edge instead of a filled pill
const linkCls = (active: boolean, mini: boolean) =>
  cn(
    'relative flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
    "before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:content-['']",
    mini && 'justify-center px-0',
    active ? 'bg-brand-soft font-medium text-brand-fg before:bg-accent' : 'text-ink-2 hover:bg-surface-3 hover:text-ink-1',
  );

/** Desktop: a full-height rail on the page's own surfaces. */
export function Sidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const { can } = useAuth();
  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-sidebar text-ink-1 transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-[4.25rem]' : 'w-60',
      )}
    >
      <Link
        to="/"
        aria-label={`${config.appName} home`}
        className={cn('flex h-16 shrink-0 items-center gap-2.5 border-b border-line px-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent', collapsed && 'justify-center px-0')}
      >
        <BrandMark className="h-7 w-7 shrink-0" />
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">{config.appName}</span>
            <span className="block truncate text-[11px] text-ink-3">Township home security</span>
          </span>
        )}
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((g, gi) => {
          const items = g.items.filter((i) => can(i.permission));
          if (!items.length) return null;
          return (
            <ul key={g.label} aria-label={g.label} className={cn('space-y-0.5', gi > 0 && 'mt-6')}>
              {!collapsed && <li className="eyebrow mb-2 px-3" aria-hidden>{g.label}</li>}
              {items.map(({ to, label, Icon }) => (
                <li key={to}>
                  <NavLink to={to} end={to === '/'} title={collapsed ? label : undefined} className={({ isActive }) => linkCls(isActive, collapsed)}>
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line p-3">
        {/* switch to the guard house's own screen (it has a matching button to come back) */}
        <NavLink to="/guard" title={collapsed ? 'Guard House view' : undefined} className={linkCls(false, collapsed)}>
          <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className={cn('truncate', collapsed && 'sr-only')}>Guard House view</span>
        </NavLink>
        <button onClick={onToggleCollapsed} className={cn(linkCls(false, collapsed), 'w-full text-ink-3')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden /> : <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          {!collapsed && <span>Collapse</span>}
        </button>
        {!collapsed && <HomeCard />}
      </div>
    </aside>
  );
}

/** Bottom of the sidebar: who is signed in and the security state, linking to the switch on Live Monitoring. */
function HomeCard() {
  const { user } = useAuth();
  const { security } = useSecurity();
  const name = user?.name ?? 'Homeowner';
  return (
    <div className="mt-2 flex items-center gap-3 border-t border-line px-1 pt-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-medium text-brand-fg" aria-hidden>
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold">{name}</p>
        {security ? (
          <Link to="/live" className="inline-flex items-center gap-0.5 text-xs text-ink-2 hover:text-ink-1">
            Security: {effectiveLevelText(security)}
            <ChevronRight className="h-3 w-3" aria-hidden />
          </Link>
        ) : (
          <p className="text-xs text-ink-3">Front door camera</p>
        )}
      </div>
    </div>
  );
}

/** Phones and tablets: the same navigation as an icon strip under the header. */
export function MobileNav() {
  const { can } = useAuth();
  const items = NAV_ITEMS.filter((i) => can(i.permission));
  return (
    <nav aria-label="Main navigation" className="border-t border-line bg-sidebar px-2 lg:hidden">
      <ul className="flex items-center justify-between gap-1 overflow-x-auto [scrollbar-width:none]">
        {items.map(({ to, label, Icon }) => (
          <li key={to} className="shrink-0">
            <NavLink
              to={to}
              end={to === '/'}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                cn('grid h-11 w-11 place-items-center border-b-2 transition-colors', isActive ? 'border-accent text-brand-fg' : 'border-transparent text-ink-3 hover:text-ink-1')
              }
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </NavLink>
          </li>
        ))}
        <li className="shrink-0">
          <NavLink to="/guard" aria-label="Guard House view" title="Guard House view" className="grid h-11 w-11 place-items-center border-b-2 border-transparent text-ink-3 hover:text-ink-1">
            <Building2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
