import { NavLink } from 'react-router-dom';
import { Building2, Cctv, Film, LayoutDashboard, ListChecks, Map as MapIcon, MonitorPlay, PanelLeftClose, PanelLeftOpen, Users, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/utils/format';
import type { Permission } from '@/utils/permissions';
import { BrandLockup } from './BrandMark';

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

interface SidebarProps {
  /** mobile drawer open */
  open: boolean;
  onClose: () => void;
  /** desktop: icons only */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({ open, onClose, collapsed, onToggleCollapsed }: SidebarProps) {
  const { can } = useAuth();
  // the mobile drawer always shows labels
  const mini = collapsed && !open;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface-nav transition-[transform,width] duration-200 ease-out',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
          collapsed && 'lg:w-[4.25rem]',
        )}
        aria-label="Main navigation"
      >
        <div className={cn('flex h-16 shrink-0 items-center justify-between gap-2', mini ? 'lg:justify-center lg:px-0' : '', 'px-4')}>
          <span className={cn(mini && 'lg:hidden')}>
            <BrandLockup />
          </span>
          {mini && (
            <span className="hidden lg:block">
              <BrandLockup compact />
            </span>
          )}
          <button className="rounded-full p-1.5 text-ink-2 hover:bg-surface-3 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter((i) => can(i.permission));
            if (!items.length) return null;
            return (
              <div key={g.label} className="mb-4">
                <p className={cn('eyebrow mb-1.5 px-3', mini && 'lg:sr-only')}>{g.label}</p>
                <ul className="space-y-0.5">
                  {items.map(({ to, label, Icon }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={to === '/'}
                        onClick={onClose}
                        title={mini ? label : undefined}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                            mini && 'lg:justify-center lg:px-0',
                            isActive ? 'bg-surface-3 text-ink-1' : 'text-ink-2 hover:bg-surface-2 hover:text-ink-1',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {/* active marker: a short accent bar at the left edge */}
                            <span
                              className={cn('absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-opacity', isActive ? 'opacity-100' : 'opacity-0')}
                              aria-hidden
                            />
                            <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-brand-fg' : 'text-ink-3 group-hover:text-ink-2')} aria-hidden />
                            <span className={cn('truncate', mini && 'lg:sr-only')}>{label}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-line p-3">
          {/* switch to the guard house's own screen (it has a matching button to come back) */}
          <NavLink
            to="/guard"
            onClick={onClose}
            title={mini ? 'Switch to Guard House view' : undefined}
            className={cn(
              'flex h-9 items-center gap-3 rounded-xl border border-line px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1',
              mini && 'lg:justify-center lg:px-0',
            )}
          >
            <Building2 className="h-[18px] w-[18px] shrink-0 text-guard-fg" aria-hidden />
            <span className={cn('truncate', mini && 'lg:sr-only')}>Guard House view</span>
          </NavLink>
          <button
            onClick={onToggleCollapsed}
            className={cn('hidden h-9 w-full items-center gap-3 rounded-xl px-3 text-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1 lg:flex', collapsed && 'lg:justify-center lg:px-0')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
