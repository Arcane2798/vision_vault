import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { FlaskConical, ShieldAlert, X } from 'lucide-react';
import { isMock } from '@/config/env';
import { useRealtime } from '@/context/RealtimeContext';
import { SecurityProvider } from '@/context/SecurityContext';
import { incidentHeadline } from '@/utils/format';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <SecurityProvider>
      <div className="flex min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setMenuOpen(true)} />
          {isMock && <SampleDataBanner />}
          <main id="main" className="flex-1 p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
        <AlertToast />
      </div>
    </SecurityProvider>
  );
}

function SampleDataBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-amber-200 lg:px-6">
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        <b>Sample data mode.</b> Cameras, incidents and images are generated for demonstration - not real CCTV. Run <code className="rounded bg-black/30 px-1">npm run configure -- --live</code> to connect the backend.
      </span>
    </div>
  );
}

function AlertToast() {
  const { toast, dismissToast } = useRealtime();
  if (!toast) return null;
  return (
    <div role="alert" className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-warn/40 bg-surface-1 p-4 shadow-2xl">
      <div className="flex gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Security alert at your door</p>
          <p className="mt-0.5 text-sm text-ink-2">
            {incidentHeadline(toast)} · {toast.cameraName}
          </p>
          {toast.guardNotified && <GuardNotifiedBadge className="mt-1.5" />}
          <p className="mt-1 text-xs text-ink-3">Automated alert - review the snapshot and clip before acting.</p>
          <Link to={`/incidents/${toast.id}`} onClick={dismissToast} className="mt-2 inline-block text-sm font-medium text-blue-300 hover:underline">
            Review incident →
          </Link>
        </div>
        <button onClick={dismissToast} aria-label="Dismiss" className="self-start rounded p-1 text-ink-3 hover:bg-surface-3">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
