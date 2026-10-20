import type { Role, User } from '@/types';

/** What each role may do. The backend must enforce the same rules - this only hides controls. */
export type Permission = 'view:dashboard' | 'view:live' | 'view:incidents' | 'view:evidence' | 'review:incidents' | 'manage:cameras';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['view:dashboard', 'view:live', 'view:incidents', 'view:evidence', 'review:incidents', 'manage:cameras'],
  operator: ['view:dashboard', 'view:live', 'view:incidents', 'view:evidence', 'review:incidents'],
  viewer: ['view:dashboard', 'view:incidents'],
};

export const can = (user: User | null, permission: Permission) => !!user && ROLE_PERMISSIONS[user.role].includes(permission);
