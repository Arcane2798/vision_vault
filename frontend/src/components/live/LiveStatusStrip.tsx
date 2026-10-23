import type { ReactNode } from 'react';
import { Activity, Gauge, Users, UserX } from 'lucide-react';
import type { LiveStatus } from '@/types';
import { cn } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/States';
import { PeopleInView } from './PeopleInView';

interface Props {
  status?: LiveStatus;
  loading: boolean;
  error: Error | null;
}

/** Three live tiles from GET /api/status (engine state, FPS, unknown in view) plus who is in view, when the backend reports it. */
export function LiveStatusStrip({ status, loading, error }: Props) {
  if (error && !status) {
    return (
      <Card className="mb-4 px-4 py-3 text-sm text-ink-3" role="alert">
        <span className="font-medium text-danger-fg">Live status unavailable.</span> {error.message}
      </Card>
    );
  }
  const unknown = status?.unknownCount ?? 0;
  // a failed poll after earlier data: the tiles show old values, so say so instead of presenting them as live
  const stale = !!error && !!status;
  return (
    <div className="mb-4 space-y-3">
      {stale && (
        <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn-fg">
          Lost contact with the detection engine. These are the last values it reported.
        </p>
      )}
      <div className={cn('grid gap-3 sm:grid-cols-3', stale && 'opacity-60')}>
        <Tile
          label="Detection engine"
          icon={<Activity className="h-4 w-4" />}
          tone={status ? (status.running ? 'ok' : 'danger') : 'default'}
          loading={loading && !status}
          value={status ? (status.running ? 'Running' : 'Stopped') : '-'}
          hint={status?.cameraName}
        />
        <Tile
          label="Frames per second"
          icon={<Gauge className="h-4 w-4" />}
          loading={loading && !status}
          value={status ? status.fps.toFixed(1) : '-'}
          hint="AI processing speed"
        />
        <Tile
          label="Unknown in view"
          icon={<UserX className="h-4 w-4" />}
          tone="danger"
          loading={loading && !status}
          value={status ? String(unknown) : '-'}
          hint={unknown > 0 ? 'Unrecognised person at the door now' : 'No unknown people right now'}
        />
      </div>
      {status?.peopleInView && (
        <Card className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
          <p className="flex shrink-0 items-center gap-2 text-xs text-ink-3">
            <Users className="h-4 w-4" aria-hidden />
            At the door now
          </p>
          <PeopleInView people={status.peopleInView} />
        </Card>
      )}
    </div>
  );
}

const toneDot = { default: 'bg-ink-3', danger: 'bg-danger', ok: 'bg-ok' };

/** Label, then the value large; a small dot carries the state (the label still says it in words). */
function Tile({ label, value, hint, icon, tone = 'default', loading }: { label: string; value: string; hint?: string; icon: ReactNode; tone?: keyof typeof toneDot; loading: boolean }) {
  return (
    <Card className="p-4">
      <p className="eyebrow flex items-center gap-2">
        <span className="text-ink-3 [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-3 h-6 w-20" />
      ) : (
        <p className="mt-2 flex items-center gap-2 text-[22px] font-medium leading-tight tracking-[-0.02em] tabular-nums">
          {tone !== 'default' && <span className={cn('h-2 w-2 rounded-full', toneDot[tone])} aria-hidden />}
          {value}
        </p>
      )}
      {hint && <p className="mt-1 truncate text-xs text-ink-3">{hint}</p>}
    </Card>
  );
}
