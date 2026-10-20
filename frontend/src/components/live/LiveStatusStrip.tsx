import type { ReactNode } from 'react';
import { Activity, Gauge, UserX } from 'lucide-react';
import type { LiveStatus } from '@/types';
import { cn } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/States';

interface Props {
  status?: LiveStatus;
  loading: boolean;
  error: Error | null;
}

/** Three live tiles from GET /api/status: engine state, FPS and unknown people in view. */
export function LiveStatusStrip({ status, loading, error }: Props) {
  if (error && !status) {
    return (
      <Card className="mb-4 px-4 py-3 text-sm text-ink-3" role="alert">
        <span className="font-medium text-red-300">Live status unavailable.</span> {error.message}
      </Card>
    );
  }
  const unknown = status?.unknownCount ?? 0;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3" aria-live="polite">
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
        tone={unknown > 0 ? 'danger' : 'ok'}
        loading={loading && !status}
        value={status ? String(unknown) : '-'}
        hint={unknown > 0 ? 'Unrecognised person at the door now' : 'No unknown people right now'}
      />
    </div>
  );
}

const toneCls = { default: 'bg-brand/15 text-blue-300', danger: 'bg-danger/15 text-red-300', ok: 'bg-ok/15 text-green-300' };

function Tile({ label, value, hint, icon, tone = 'default', loading }: { label: string; value: string; hint?: string; icon: ReactNode; tone?: keyof typeof toneCls; loading: boolean }) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', toneCls[tone])} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-ink-3">{label}</p>
        {loading ? <Skeleton className="mt-1 h-5 w-16" /> : <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>}
        {hint && <p className="truncate text-[11px] text-ink-3">{hint}</p>}
      </div>
    </Card>
  );
}
