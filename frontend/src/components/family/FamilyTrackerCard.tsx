import { useState } from 'react';
import { DoorClosed, DoorOpen, UserRound } from 'lucide-react';
import { config } from '@/config/env';
import { useAsync } from '@/hooks/useAsync';
import { familyService } from '@/services';
import type { FamilyMember, Movement, PresenceStatus } from '@/types';
import { cn, formatHourMinute, formatRelative } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';

const STATUS: Record<PresenceStatus, { label: string; cls: string }> = {
  home: { label: 'Home', cls: 'border-ok/40 bg-ok/10 text-ok-fg' },
  out: { label: 'Out', cls: 'border-warn/40 bg-warn/10 text-warn-fg' },
  unknown: { label: 'Not seen yet', cls: 'border-line bg-surface-2 text-ink-3' },
};

/**
 * Family tracker (side feature 2): which residents are home or out. The camera is inside, facing the
 * front door: walking towards it = arrived, walking away = left; being seen inside = home.
 * The homeowner can correct a wrong guess with Mark home / Mark out.
 */
export function FamilyTrackerCard() {
  const [version, setVersion] = useState(0);
  const family = useAsync(() => familyService.list(), [version], config.refreshIntervalMs / 3);
  const moves = useAsync(() => familyService.movements(6), [version], config.refreshIntervalMs / 3);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = async (m: FamilyMember, status: 'home' | 'out') => {
    setBusy(m.id);
    setError(null);
    try {
      await familyService.setStatus(m.id, status);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const home = family.data?.filter((m) => m.status === 'home').length ?? 0;

  return (
    <Card>
      <CardHeader
        title="Family tracker"
        subtitle={family.data ? `${home} of ${family.data.length} residents home · from the camera inside the front door` : 'Who is home and who is out'}
      />
      {family.initialLoading ? (
        <LoadingState />
      ) : family.error ? (
        <ErrorState error={family.error} onRetry={family.reload} />
      ) : !family.data?.length ? (
        <EmptyState title="No residents registered" message="Add residents on the Residents & Visitors page to track who is home." />
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-5">
          <ul className="space-y-2 lg:col-span-3">
            {family.data.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/50 px-3 py-2">
                <img src={familyService.photoSrc(m)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-ink-3">{describe(m)}</p>
                </div>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold', STATUS[m.status].cls)}>{STATUS[m.status].label}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === m.id}
                  title={`Correct the tracker: mark ${m.name} as ${m.status === 'home' ? 'out' : 'home'}`}
                  onClick={() => mark(m, m.status === 'home' ? 'out' : 'home')}
                >
                  {m.status === 'home' ? 'Mark out' : 'Mark home'}
                </Button>
              </li>
            ))}
            {error && <li className="text-xs text-danger-fg">{error}</li>}
          </ul>
          <div className="lg:col-span-2">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Recent arrivals & departures</p>
            {!moves.data?.length ? (
              <p className="text-xs text-ink-3">Nothing yet. Arrivals and departures at the front door appear here.</p>
            ) : (
              <ul className="space-y-1.5">
                {moves.data.map((mv) => (
                  <MovementRow key={mv.id} mv={mv} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function describe(m: FamilyMember): string {
  if (m.status === 'unknown' || !m.since) return 'No arrival or departure recorded yet';
  if (m.source === 'seen') return `Seen inside at ${formatHourMinute(m.since)}`;
  const how = m.source === 'manual' ? 'marked by you' : 'by the camera';
  return `${m.status === 'home' ? 'Arrived' : 'Left'} ${formatRelative(m.since)} (${how})`;
}

function MovementRow({ mv }: { mv: Movement }) {
  const arrived = mv.direction === 'arrived';
  const Icon = mv.name ? (arrived ? DoorOpen : DoorClosed) : UserRound;
  return (
    <li className="flex items-center gap-2 text-xs">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', arrived ? 'text-ok-fg' : 'text-warn-fg')} aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <b className="font-medium text-ink-1">{mv.name ?? 'Someone (face not seen)'}</b> {arrived ? 'arrived' : 'left'}
        {mv.source === 'manual' && <span className="text-ink-3"> · marked by you</span>}
      </span>
      <span className="shrink-0 tabular-nums text-ink-3">{formatHourMinute(mv.timestamp)}</span>
    </li>
  );
}
