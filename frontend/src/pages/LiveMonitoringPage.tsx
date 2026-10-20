import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Grid2x2, Grid3x3, Square } from 'lucide-react';
import { config } from '@/config/env';
import { useRealtime } from '@/context/RealtimeContext';
import { useAsync } from '@/hooks/useAsync';
import { cameraService } from '@/services';
import type { Camera } from '@/types';
import { cn, formatConfidence, formatTime } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { AiPredictionTag, CameraStatusBadge } from '@/components/ui/StatusBadge';
import { CameraFeed } from '@/components/cameras/CameraFeed';

type Columns = 1 | 2 | 3;
const GRID_COLS: Record<Columns, string> = { 1: 'grid-cols-1 max-w-4xl', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' };
const GRID_ICONS = { 1: Square, 2: Grid2x2, 3: Grid3x3 };

export default function LiveMonitoringPage() {
  const cameras = useAsync(() => cameraService.list(), [], config.refreshIntervalMs);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('camera') ?? '';
  const [columns, setColumns] = useState<Columns>(3);
  const select = (id: string) => setParams(id ? { camera: id } : {}, { replace: true });

  const list = cameras.data ?? [];
  const selected = list.find((c) => c.id === selectedId);

  if (cameras.initialLoading) return <LoadingState label="Loading cameras…" />;
  if (cameras.error && !cameras.data) return <ErrorState error={cameras.error} onRetry={cameras.reload} />;

  return (
    <>
      <PageHeader
        title="Live monitoring"
        description="AI detections are drawn as dashed amber boxes. They are predictions, not proof of theft."
        actions={
          <>
            <Select aria-label="Select camera" value={selectedId} onChange={(e) => select(e.target.value)} className="w-56">
              <option value="">All cameras (grid)</option>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.status === 'offline' ? '(offline)' : ''}
                </option>
              ))}
            </Select>
            {!selected && (
              <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Grid layout">
                {([1, 2, 3] as Columns[]).map((n) => {
                  const Icon = GRID_ICONS[n];
                  return (
                    <button
                      key={n}
                      onClick={() => setColumns(n)}
                      aria-pressed={columns === n}
                      aria-label={`${n} column${n > 1 ? 's' : ''}`}
                      className={cn('rounded-md p-2', columns === n ? 'bg-surface-3 text-ink-1' : 'text-ink-3 hover:text-ink-1')}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        }
      />

      {list.length === 0 ? (
        <Card>
          <EmptyState title="No cameras registered" message="Add a camera on the Cameras page to start monitoring." />
        </Card>
      ) : selected ? (
        <SingleCamera camera={selected} onBack={() => select('')} />
      ) : (
        <div className={cn('grid gap-4', GRID_COLS[columns])}>
          {list.map((c) => (
            <CameraFeed key={c.id} camera={c} compact={columns !== 1} onSelect={() => select(c.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function SingleCamera({ camera, onBack }: { camera: Camera; onBack: () => void }) {
  const { detectionsFor, cameraStatus } = useRealtime();
  const [log, setLog] = useState<ReturnType<typeof detectionsFor>>([]);
  const current = detectionsFor(camera.id);

  // keep a rolling log of what the model reported for this camera while the page is open
  useEffect(() => {
    setLog((l) => {
      const fresh = current.filter((d) => !l.some((x) => x.id === d.id));
      return fresh.length ? [...fresh, ...l].slice(0, 30) : l; // same array = no re-render
    });
  }, [current]);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <CameraFeed camera={camera} />
        <button onClick={onBack} className="mt-3 text-sm text-blue-300 hover:underline">
          ← Back to all cameras
        </button>
      </div>
      <Card className="flex max-h-[32rem] flex-col">
        <CardHeader title="Detection log" subtitle={`${camera.name} · since this page was opened`} action={<CameraStatusBadge status={cameraStatus[camera.id] ?? camera.status} />} />
        {log.length === 0 ? (
          <EmptyState title="No detections yet" message={`Detections with confidence ≥ ${formatConfidence(config.minConfidence)} will be listed here.`} />
        ) : (
          <ul className="flex-1 divide-y divide-line overflow-y-auto" aria-live="polite">
            {log.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div>
                  <p>{d.label}</p>
                  <p className="font-mono text-xs text-ink-3">{formatTime(d.timestamp)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-ink-2">{formatConfidence(d.confidence)}</span>
                  <AiPredictionTag />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
