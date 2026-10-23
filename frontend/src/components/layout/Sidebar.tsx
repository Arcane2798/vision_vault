import { Link, NavLink } from 'react-router-dom';
import { Building2, ChevronRight, Cctv, Film, LayoutDashboard, ListChecks, Map as MapIcon, MonitorPlay, PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSecurity } from '@/context/SecurityContext';
import { cn, effectiveLevelText } from '@/utils/format';
import type { Permission } from '@/utils/permissions';

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

const linkCls = (active: boolean, mini: boolean) =>
  cn(
    'flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70',
    mini && 'justify-center px-0',
    active ? 'bg-surface-3 text-ink-1' : 'text-ink-2 hover:bg-surface-2 hover:text-ink-1',
  );

/** Desktop: a navy card floating beside the workspace. data-theme="navy" keeps its colours in both themes. */
export function Sidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const { can } = useAuth();
  return (
    <aside
      data-theme="navy"
      aria-label="Main navigation"
      className={cn(
        'sticky top-[5.25rem] hidden h-[calc(100vh-6.25rem)] shrink-0 flex-col rounded-[24px] bg-surface-1 p-3 text-ink-1 transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-[4.5rem]' : 'w-60',
      )}
    >
      <nav className="flex-1 overflow-y-auto">
        {NAV_GROUPS.map((g, gi) => {
          const items = g.items.filter((i) => can(i.permission));
          if (!items.length) return null;
          return (
            <ul key={g.label} aria-label={g.label} className={cn('space-y-1', gi > 0 && 'mt-3 border-t border-line pt-3')}>
              {items.map(({ to, label, Icon }) => (
                <li key={to}>
                  <NavLink to={to} end={to === '/'} title={collapsed ? label : undefined} className={({ isActive }) => linkCls(isActive, collapsed)}>
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          );
        })}
      </nav>

      <div className="space-y-1">
        {/* switch to the guard house's own screen (it has a matching button to come back) */}
        <NavLink to="/guard" title={collapsed ? 'Guard House view' : undefined} className={linkCls(false, collapsed)}>
          <Building2 className="h-[18px] w-[18px] shrink-0 text-guard-fg" aria-hidden />
          <span className={cn('truncate', collapsed && 'sr-only')}>Guard House view</span>
        </NavLink>
        <button onClick={onToggleCollapsed} className={cn(linkCls(false, collapsed), 'w-full text-ink-3')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />}
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
    <div className="mt-2 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/90 text-sm font-semibold text-[#1b2d63]" aria-hidden>
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

/** Phones and tablets: the same navigation as a navy icon strip under the header. */
export function MobileNav() {
  const { can } = useAuth();
  const items = NAV_ITEMS.filter((i) => can(i.permission));
  return (
    <nav data-theme="navy" aria-label="Main navigation" className="mt-2 rounded-2xl bg-surface-1 p-1.5 lg:hidden">
      <ul className="flex items-center justify-between gap-2 overflow-x-auto [scrollbar-width:none]">
        {items.map(({ to, label, Icon }) => (
          <li key={to} className="shrink-0">
            <NavLink
              to={to}
              end={to === '/'}
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                cn('grid h-11 w-[42px] place-items-center rounded-xl transition-colors', isActive ? 'bg-surface-3 text-ink-1' : 'text-ink-2 hover:bg-surface-2 hover:text-ink-1')
              }
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </NavLink>
          </li>
        ))}
        <li className="shrink-0">
          <NavLink to="/guard" aria-label="Guard House view" title="Guard House view" className="grid h-11 w-[42px] place-items-center rounded-xl text-guard-fg hover:bg-surface-2">
            <Building2 className="h-[18px] w-[18px]" aria-hidden />
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
