import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertOctagon, BellRing, Home, Loader2, RefreshCw, ShieldCheck, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { config } from '@/config/env';
import { useAsync } from '@/hooks/useAsync';
import { useAlertSound } from '@/hooks/useAlertSound';
import { guardService } from '@/services';
import type { GuardAlert } from '@/types';
import { cn, formatTime } from '@/utils/format';
import { Button, LinkButton } from '@/components/ui/Button';
import { GuardAlertCard } from '@/components/guard/GuardAlertCard';

const POLL_MS = 2000;

const clockDate = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

/**
 * The township guard house's own screen (outside AppLayout: no sidebar, top bar or assistant).
 * Shows only address, time, snapshot and clip of each alert - never identity, people or face data.
 */
export default function GuardPage() {
  const alerts = useAsync(() => guardService.list(50), [], POLL_MS);
  const now = useNow(1000);
  const { enabled: soundOn, beep } = useAlertSound();

  // acks done on this screen show at once, before the next poll confirms them
  const [acked, setAcked] = useState<Record<string, GuardAlert>>({});
  const list = useMemo(() => {
    const merged = (alerts.data ?? []).map((a) => (a.acknowledgedAt ? a : acked[a.id] ?? a));
    const time = (a: GuardAlert) => new Date(a.timestamp).getTime();
    // open alerts on top, each group newest first
    return merged.sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt) || time(b) - time(a));
  }, [alerts.data, acked]);
  const open = list.filter((a) => !a.acknowledgedAt);

  // new alert -> red banner + beep (the first load only records what is already there)
  const seen = useRef<Set<string> | null>(null);
  const [banner, setBanner] = useState<{ id: string; houseUnit: string; count: number } | null>(null);
  useEffect(() => {
    if (!alerts.data) return;
    if (!seen.current) {
      seen.current = new Set(alerts.data.map((a) => a.id));
      return;
    }
    const fresh = alerts.data.filter((a) => !a.acknowledgedAt && !seen.current!.has(a.id));
    alerts.data.forEach((a) => seen.current!.add(a.id));
    if (fresh.length) {
      setBanner({ id: fresh[0].id, houseUnit: fresh[0].houseUnit, count: fresh.length });
      beep();
    }
  }, [alerts.data, beep]);
  const showBanner = banner && open.some((a) => a.id === banner.id);

  useEffect(() => {
    document.title = `${open.length ? `(${open.length}) ` : ''}Guard House — Township Security`;
  }, [open.length]);

  const onAcknowledged = useCallback(
    (a: GuardAlert) => {
      setAcked((m) => ({ ...m, [a.id]: a }));
      alerts.reload();
    },
    [alerts.reload],
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 border-b border-line bg-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-600">
              <ShieldCheck className="h-6 w-6 text-white" aria-hidden />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold sm:text-xl">Guard House — Township Security</h1>
              <p className="text-xs text-ink-2">{clockDate.format(now)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SoundHint on={soundOn} />
            <span
              className={cn(
                'rounded-full px-3 py-1 text-sm font-bold tabular-nums',
                open.length ? 'bg-red-600 text-white' : 'border border-line text-ink-2',
              )}
              aria-live="polite"
            >
              {open.length} unacknowledged
            </span>
            <time className="text-2xl font-bold tabular-nums sm:text-3xl" aria-label="Current time">
              {formatTime(new Date(now).toISOString())}
            </time>
          </div>
        </div>
        {showBanner && (
          <div role="alert" className="bg-red-600 text-white shadow-lg">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
              <BellRing className="h-6 w-6 shrink-0 animate-pulse" aria-hidden />
              <p className="flex-1 text-base font-bold sm:text-lg">
                {banner.count > 1 ? `${banner.count} new alerts — latest at ${banner.houseUnit}` : `New alert — ${banner.houseUnit}`}
              </p>
              <button onClick={() => setBanner(null)} className="rounded p-1 hover:bg-red-700" aria-label="Dismiss banner">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 pb-20 pt-4 sm:pt-6">
        {alerts.error && alerts.data && (
          <p role="status" className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-amber-200">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
            Connection lost — retrying every {POLL_MS / 1000} s. {alerts.error.message}
          </p>
        )}

        {alerts.initialLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-24 text-lg text-ink-2">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            Loading alerts…
          </div>
        ) : alerts.error && !alerts.data ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-24 text-center">
            <AlertOctagon className="h-10 w-10 text-danger" aria-hidden />
            <p className="text-xl font-semibold">Could not load alerts</p>
            <p className="max-w-md text-sm text-ink-2">{alerts.error.message}</p>
            <Button icon={<RefreshCw className="h-4 w-4" />} onClick={alerts.reload}>
              Try again
            </Button>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <ShieldCheck className="h-14 w-14 text-ok" aria-hidden />
            <p className="text-2xl font-bold">All quiet — no alerts</p>
            <p className="text-sm text-ink-2">New alerts appear here automatically.</p>
          </div>
        ) : (
          <>
            {open.length === 0 && (
              <p className="flex items-center justify-center gap-2 rounded-xl border border-line py-4 text-lg font-semibold text-ok">
                <ShieldCheck className="h-5 w-5" aria-hidden /> All quiet — every alert is acknowledged
              </p>
            )}
            {list.map((a) => (
              <GuardAlertCard key={a.id} alert={a} now={now} onAcknowledged={onAcknowledged} />
            ))}
          </>
        )}
      </main>

      {/* demo convenience: jump back to the homeowner's dashboard */}
      <LinkButton to="/" variant="secondary" icon={<Home className="h-4 w-4" />} className="fixed bottom-4 left-4 z-30 shadow-lg">
        Homeowner dashboard
      </LinkButton>
    </div>
  );
}

function SoundHint({ on }: { on: boolean }) {
  return on ? (
    <span className="hidden items-center gap-1 text-xs text-ink-2 sm:inline-flex">
      <Volume2 className="h-4 w-4" aria-hidden /> Sound on
    </span>
  ) : (
    // any click on the page enables sound; this button just gives the click a target
    <button type="button" className="inline-flex items-center gap-1 rounded-full border border-warn/50 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-warn/10">
      <VolumeX className="h-4 w-4" aria-hidden /> Click to enable sound
    </button>
  );
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
