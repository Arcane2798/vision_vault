import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { FlaskConical, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { isMock } from '@/config/env';
import { useRealtime } from '@/context/RealtimeContext';
import { ChatProvider, useChat } from '@/context/ChatContext';
import { SecurityProvider } from '@/context/SecurityContext';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { cn, formatGuardAck, incidentHeadline } from '@/utils/format';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <SecurityProvider>
      <ChatProvider>
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
          <ChatPanel />
        </div>
      </ChatProvider>
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
  const chat = useChat();
  if (!toast) return null;
  const inc = toast.incident;
  const ack = toast.kind === 'guard_ack';
  return (
    // moves left of the open assistant panel so it never covers the chat input
    <div
      role="alert"
      className={cn(
        'fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-surface-1 p-4 shadow-2xl',
        ack ? 'border-green-500/50' : 'border-warn/40',
        chat.open && 'sm:right-[27rem]',
      )}
    >
      <div className="flex gap-3">
        {ack ? <ShieldCheck className="h-5 w-5 shrink-0 text-green-400" aria-hidden /> : <ShieldAlert className="h-5 w-5 shrink-0 text-warn" aria-hidden />}
        <div className="min-w-0 flex-1">
          {ack ? (
            <>
              <p className="text-sm font-semibold">Guard house responded</p>
              <p className="mt-0.5 text-sm text-ink-2">
                {inc.guardAcknowledgedAt ? formatGuardAck(inc.guardAcknowledgedAt, inc.guardAckNote) : 'Acknowledged'} · {incidentHeadline(inc)}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Security alert at your door</p>
              <p className="mt-0.5 text-sm text-ink-2">
                {incidentHeadline(inc)} · {inc.cameraName}
              </p>
              {inc.guardNotified && <GuardNotifiedBadge className="mt-1.5" />}
            </>
          )}
          <Link to={`/incidents/${inc.id}`} onClick={dismissToast} className="mt-2 inline-block text-sm font-medium text-blue-300 hover:underline">
            View incident →
          </Link>
        </div>
        <button onClick={dismissToast} aria-label="Dismiss" className="self-start rounded p-1 text-ink-3 hover:bg-surface-3">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
