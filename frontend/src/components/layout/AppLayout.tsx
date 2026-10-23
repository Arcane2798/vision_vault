import { Suspense, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { FlaskConical, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { isMock } from '@/config/env';
import { useRealtime } from '@/context/RealtimeContext';
import { ChatProvider, useChat } from '@/context/ChatContext';
import { SecurityProvider } from '@/context/SecurityContext';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { cn, formatGuardAck, incidentHeadline } from '@/utils/format';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { LoadingState } from '@/components/ui/States';
import { MobileNav, Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSE_KEY = 'vv-sidebar-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { pathname } = useLocation();
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* not persisted */
      }
      return !c;
    });
  return (
    <SecurityProvider>
      <ChatProvider>
        <div className="min-h-screen p-2 sm:p-3 lg:p-4">
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-brand focus:px-3 focus:py-2 focus:text-brand-on">
            Skip to content
          </a>
          <div className="sticky top-0 z-20 -mx-2 -mt-2 bg-surface-0/90 px-2 pb-2 pt-2 backdrop-blur-md sm:-mx-3 sm:-mt-3 sm:px-3 sm:pt-3 lg:-mx-4 lg:-mt-4 lg:px-4 lg:pt-4">
            <Topbar />
            <MobileNav />
          </div>
          <div className="flex gap-3 lg:gap-4">
            <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
            {/* the white workspace: every page sits on one large rounded panel */}
            <main id="main" className="min-w-0 flex-1 rounded-[24px] bg-surface-1 p-4 shadow-panel sm:rounded-[28px] sm:p-5 lg:p-6">
              <div className="mx-auto max-w-[1600px]">
                {isMock && <SampleDataBanner />}
                {/* page chunks load inside the shell, so the sidebar and top bar stay put */}
                <Suspense fallback={<LoadingState label="Loading page…" className="py-24" />}>
                  <div key={pathname} className="animate-fade-in">
                    <Outlet />
                  </div>
                </Suspense>
              </div>
            </main>
          </div>
          <AlertToast />
          <ChatPanel />
        </div>
      </ChatProvider>
    </SecurityProvider>
  );
}

function SampleDataBanner() {
  return (
    <div className="mb-5 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn-fg" role="note">
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        <b>Sample data mode.</b> Cameras, incidents and images are generated for demonstration - not real CCTV. Run <code className="rounded bg-warn/15 px-1">npm run configure -- --live</code> to connect the backend.
      </span>
    </div>
  );
}

function AlertToast() {
  const { toast, dismissToast } = useRealtime();
  const chat = useChat();
  if (!toast) return null;
  const inc = toast.incident;
  const ack = toast.kind === 'guard_ack';
  return (
    // moves left of the open assistant panel so it never covers the chat input
    <div
      role="alert"
      className={cn(
        'fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface-1 p-4 shadow-pop',
        chat.open && 'sm:right-[27rem]',
      )}
    >
      <div className="flex gap-3">
        {ack ? <ShieldCheck className="h-5 w-5 shrink-0 text-ok-fg" aria-hidden /> : <ShieldAlert className="h-5 w-5 shrink-0 text-danger-fg" aria-hidden />}
        <div className="min-w-0 flex-1">
          {ack ? (
            <>
              <p className="text-sm font-semibold">Guard house responded</p>
              <p className="mt-0.5 text-sm text-ink-2">
                {inc.guardAcknowledgedAt ? formatGuardAck(inc.guardAcknowledgedAt, inc.guardAckNote) : 'Acknowledged'}, {incidentHeadline(inc)}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Security alert at your door</p>
              <p className="mt-0.5 text-sm text-ink-2">
                {incidentHeadline(inc)} at {inc.cameraName}
              </p>
              {inc.guardNotified && <GuardNotifiedBadge className="mt-1.5" />}
            </>
          )}
          <Link to={`/incidents/${inc.id}`} onClick={dismissToast} className="mt-2 inline-block text-sm font-medium text-brand-fg hover:underline">
            Open incident
          </Link>
        </div>
        <button onClick={dismissToast} aria-label="Dismiss" className="self-start rounded-full p-1 text-ink-3 hover:bg-surface-3">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
