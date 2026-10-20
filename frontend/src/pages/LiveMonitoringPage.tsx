import { config } from '@/config/env';
import { useAsync } from '@/hooks/useAsync';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import { cameraService } from '@/services';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { CameraFeed } from '@/components/cameras/CameraFeed';
import { LiveStatusStrip } from '@/components/live/LiveStatusStrip';
import { SecurityLevelControl } from '@/components/security/SecurityLevelControl';

const LEGEND: Array<{ dot: string; label: string }> = [
  { dot: 'bg-green-500', label: 'Resident (family) - allowed, no alert' },
  { dot: 'bg-cyan-400', label: 'Visitor inside their allowed window' },
  { dot: 'bg-orange-400', label: 'Visitor outside their window - homeowner alerted' },
  { dot: 'bg-red-500', label: 'Unknown person - incident recorded and alert sent' },
];

/** One home, one front-door camera: the feed, live engine status and the colour legend. */
export default function LiveMonitoringPage() {
  const cameras = useAsync(() => cameraService.list(), [], config.refreshIntervalMs);
  const live = useLiveStatus();
  const camera = cameras.data?.[0];

  return (
    <>
      <PageHeader title="Live monitoring" description="Boxes and names are drawn into the video by the AI engine on your home computer." />

      <LiveStatusStrip status={live.data} loading={live.loading} error={live.error} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {cameras.initialLoading ? (
            <Card>
              <LoadingState label="Loading camera…" />
            </Card>
          ) : cameras.error && !cameras.data ? (
            <Card>
              <ErrorState error={cameras.error} onRetry={cameras.reload} />
            </Card>
          ) : camera ? (
            <CameraFeed camera={camera} />
          ) : (
            <Card>
              <EmptyState title="No camera reported" message="The backend did not report a camera. Check that it is running and VIDEO_SOURCE is set." />
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <SecurityLevelControl />
          <Card>
            <CardHeader title="What the colours mean" />
            <ul className="space-y-2 p-4 text-sm">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-2.5">
                  <span className={`h-3 w-3 shrink-0 rounded-sm ${l.dot}`} aria-hidden />
                  <span className="text-ink-2">{l.label}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
