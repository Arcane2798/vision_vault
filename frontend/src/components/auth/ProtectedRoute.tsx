import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { LoadingState } from '@/components/ui/States';
import type { Permission } from '@/utils/permissions';

/** Blocks the page until signed in; optionally requires a permission. */
export function ProtectedRoute({ children, permission }: { children: ReactNode; permission?: Permission }) {
  const { user, restoring, can } = useAuth();
  const location = useLocation();

  if (restoring) return <LoadingState label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !can(permission)) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center">
        <Lock className="h-8 w-8 text-ink-3" aria-hidden />
        <p className="font-medium">Access restricted</p>
        <p className="max-w-sm text-sm text-ink-3">Your role does not allow access to this page. Ask an administrator if you need it.</p>
      </div>
    );
  }
  return <>{children}</>;
}
