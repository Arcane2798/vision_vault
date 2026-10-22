import { Link } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { config } from '@/config/env';
import { useAsync } from '@/hooks/useAsync';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import { useTestVideoSource } from '@/hooks/useTestVideoSource';
import { cameraService } from '@/services';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, FeedSkeleton } from '@/components/ui/States';
import { CameraFeed } from '@/components/cameras/CameraFeed';
import { LiveStatusStrip } from '@/components/live/LiveStatusStrip';
import { IN_VIEW_STYLE } from '@/components/live/PeopleInView';
import { SecurityLevelControl } from '@/components/security/SecurityLevelControl';

const LEGEND: Array<{ dot: string; label: string }> = [
  { dot: IN_VIEW_STYLE.family.dot, label: 'Resident (family) - allowed, no alert' },
  { dot: IN_VIEW_STYLE.guest_allowed.dot, label: 'Visitor inside their allowed window' },
  { dot: IN_VIEW_STYLE.guest_outside.dot, label: 'Visitor outside their window - homeowner alerted' },
  { dot: IN_VIEW_STYLE.unknown.dot, label: 'Unknown person - incident recorded and alert sent' },
];

/** One home, one front-door camera: the feed, live engine status and the colour legend. */
export default function LiveMonitoringPage() {
  const cameras = useAsync(() => cameraService.list(), [], config.refreshIntervalMs);
  const live = useLiveStatus();
  const testVideo = useTestVideoSource();
  const camera = cameras.data?.[0];

  return (
    <>
      <PageHeader title="Live monitoring" description="Boxes and names are drawn into the video by the AI engine on your home computer." />

      <LiveStatusStrip status={live.data} loading={live.loading} error={live.error} />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          {cameras.initialLoading ? (
            <FeedSkeleton />
          ) : cameras.error && !cameras.data ? (
            <Card>
              <ErrorState error={cameras.error} onRetry={cameras.reload} />
            </Card>
          ) : camera ? (
            <CameraFeed
              camera={camera}
              testVideo={testVideo}
              actions={
                <Link
                  to={`/incidents?camera=${encodeURIComponent(camera.id)}`}
                  className="hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-brand-fg hover:bg-surface-3 sm:inline-flex"
                >
                  <ListChecks className="h-3.5 w-3.5" aria-hidden /> Incidents
                </Link>
              }
            />
          ) : (
            <Card>
              <EmptyState title="No camera reported" message="The backend did not report a camera. Check that it is running and VIDEO_SOURCE is set." />
            </Card>
          )}
        </div>

        <div className="space-y-4 xl:col-span-4">
          <SecurityLevelControl />
          <Card>
            <CardHeader title="What the colours mean" />
            <ul className="space-y-2.5 px-4 pb-4 pt-1 text-sm sm:px-5">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-2.5">
                  <span className={`h-3 w-3 shrink-0 rounded-[3px] ${l.dot}`} aria-hidden />
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
