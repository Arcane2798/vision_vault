import { ShieldCheck, ShieldOff } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/States';
import { cn } from '@/utils/format';

interface HeroCardProps {
  alertsToday?: number;
  awaitingGuard?: number;
  securityOn: boolean;
  loading?: boolean;
}

/** Dashboard headline: a ringed shield, today's alert count in large type and the guard house's open alerts. */
export function HeroCard({ alertsToday, awaitingGuard, securityOn, loading }: HeroCardProps) {
  return (
    <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
      <div className="flex items-center gap-6">
        <ShieldRing on={securityOn} />
        {loading ? (
          <Skeleton className="h-16 w-20" />
        ) : (
          <p className="text-7xl font-semibold leading-none tabular-nums text-ink-1">{alertsToday ?? '-'}</p>
        )}
        <div className="max-w-xs">
          <p className="text-xl font-semibold leading-snug text-ink-1">Alerts today</p>
          <p className="mt-1 text-sm text-ink-3">
            {securityOn ? 'Security is on: residents pass silently, strangers alert you and the guard house.' : 'Security is off: people are tracked, but nothing is recorded or alerted.'}
          </p>
        </div>
      </div>
      <div className="border-line text-center sm:ml-auto sm:border-l sm:pl-8">
        <p className="text-xs font-medium text-ink-3">Guard house</p>
        {loading ? (
          <Skeleton className="mx-auto mt-1 h-10 w-12" />
        ) : (
          <p className={cn('mt-1 text-4xl font-semibold tabular-nums', (awaitingGuard ?? 0) > 0 ? 'text-brand' : 'text-ink-1')}>{awaitingGuard ?? 0}</p>
        )}
        <p className="mt-1 text-xs text-ink-3">{(awaitingGuard ?? 0) > 0 ? 'alerts awaiting a response' : 'every alert answered'}</p>
      </div>
    </Card>
  );
}

/** Segmented ring (as in the SDP dashboard style) around a shield: red while security is on, grey when off. */
function ShieldRing({ on }: { on: boolean }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const seg = c / 4;
  const Icon = on ? ShieldCheck : ShieldOff;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={on ? (i % 2 ? 'stroke-brand/40' : 'stroke-brand') : 'stroke-ink-3/40'}
            strokeDasharray={`${seg - 8} ${c - seg + 8}`}
            strokeDashoffset={-i * seg}
          />
        ))}
      </svg>
      <span className={cn('absolute inset-3 grid place-items-center rounded-full', on ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-ink-3')}>
        <Icon className="h-9 w-9" aria-hidden />
      </span>
      <span className="sr-only">Security is {on ? 'on' : 'off'}</span>
    </div>
  );
}
