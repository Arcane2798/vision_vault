import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BellRing, Cctv, ListChecks, MonitorPlay, ShieldAlert, Users } from 'lucide-react';
import { config } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { useAsync } from '@/hooks/useAsync';
import { useDataVersion } from '@/hooks/useDataVersion';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import { useTestVideoSource } from '@/hooks/useTestVideoSource';
import { cameraService, dashboardService, incidentService } from '@/services';
import type { LiveStatus } from '@/types';
import { cn, formatDateTime, formatRelative } from '@/utils/format';
import { LinkButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, FeedSkeleton, ListSkeleton, LoadingState, Skeleton } from '@/components/ui/States';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { EventTypeTag, eventAccent } from '@/components/incidents/EventTypeTag';
import { StatCard } from '@/components/dashboard/StatCard';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { DetectionFlow } from '@/components/dashboard/DetectionFlow';
import { CameraFeed } from '@/components/cameras/CameraFeed';
import { PeopleInView } from '@/components/live/PeopleInView';
import { FamilyTrackerCard } from '@/components/family/FamilyTrackerCard';

const FLOW_DAYS = 14;

export default function DashboardPage() {
  const { can } = useAuth();
  const { alerts, guardAcks } = useRealtime();
  // refetch when a new alert arrives so counters stay correct
  const changed = useDataVersion('incidents'); // e.g. reviewed from the assistant chat
  const refreshKey = `${alerts[0]?.id}-${guardAcks[0]?.id}-${guardAcks[0]?.guardAckNote}-${changed}`;
  const summary = useAsync(() => dashboardService.summary(), [refreshKey], config.refreshIntervalMs);
  const trend = useAsync(() => dashboardService.trend(FLOW_DAYS), [], config.refreshIntervalMs * 4);
  const incidents = useAsync(() => incidentService.list({ sort: 'newest' }), [refreshKey], config.refreshIntervalMs);
  const cameras = useAsync(() => cameraService.list(), [], config.refreshIntervalMs);
  const live = useLiveStatus();
  const testVideo = useTestVideoSource();
  const s = summary.data;
  const camera = cameras.data?.[0];
  const recent = incidents.data?.slice(0, 6);
  const since = Date.now() - FLOW_DAYS * 86400000;
  const flow = incidents.data?.filter((i) => new Date(i.timestamp).getTime() >= since);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Your front-door camera, what the detection engine flagged, and how each alert was handled."
        actions={
          <>
            {can('view:live') && (
              <LinkButton to="/live" icon={<MonitorPlay className="h-4 w-4" />}>
                Live monitoring
              </LinkButton>
            )}
            <LinkButton to="/incidents" variant="primary" icon={<ListChecks className="h-4 w-4" />}>
              Incident history
            </LinkButton>
          </>
        }
      />

      {summary.error && !s ? (
        <Card>
          <ErrorState error={summary.error} onRetry={summary.reload} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            label="Cameras online"
            value={s?.activeCameras}
            suffix={s && `/ ${s.totalCameras}`}
            hint={s && s.activeCameras < s.totalCameras ? `${s.totalCameras - s.activeCameras} offline - check Live Monitoring` : 'All cameras reporting'}
            icon={<Cctv className="h-4 w-4" />}
            tone={s && s.activeCameras < s.totalCameras ? 'warn' : 'ok'}
            to={can('view:live') ? '/live' : undefined}
            loading={summary.initialLoading}
          />
          <StatCard
            label="Incidents today"
            value={s?.incidentsToday}
            hint="Flagged since midnight"
            icon={<ShieldAlert className="h-4 w-4" />}
            tone={s && s.incidentsToday > 0 ? 'danger' : 'default'}
            loading={summary.initialLoading}
          />
          <StatCard
            label="Awaiting guard house"
            value={s?.awaitingGuard ?? 0}
            hint={s && (s.awaitingGuard ?? 0) > 0 ? 'Not acknowledged yet (last 24 h)' : 'Every alert has a guard response'}
            icon={<BellRing className="h-4 w-4" />}
            tone={s && (s.awaitingGuard ?? 0) > 0 ? 'warn' : 'ok'}
            to="/incidents"
            loading={summary.initialLoading}
          />
          <StatCard label="Total incidents" value={s?.totalIncidents} hint="All recorded events" icon={<ListChecks className="h-4 w-4" />} loading={summary.initialLoading} />
        </div>
      )}

      {/* monitoring workspace: the feed is the focal point, recent events beside it */}
      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-8">
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
                can('view:live') && (
                  <Link to="/live" className="hidden items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-brand-fg hover:bg-surface-3 sm:inline-flex">
                    Open <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                )
              }
            />
          ) : (
            <Card>
              <EmptyState title="No camera reported" message="The backend did not report a camera. Check that it is running and VIDEO_SOURCE is set." icon={<Cctv className="h-5 w-5" />} />
            </Card>
          )}
          <EngineStrip status={live.data} loading={live.loading} error={live.error} />
        </div>

        <Card className="flex flex-col xl:col-span-4">
          <CardHeader
            title="Recent events"
            subtitle="Newest first"
            action={
              <Link to="/incidents" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-brand-fg hover:bg-surface-3">
                View all <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          />
          {incidents.initialLoading ? (
            <ListSkeleton rows={5} />
          ) : incidents.error && !incidents.data ? (
            <ErrorState error={incidents.error} onRetry={incidents.reload} />
          ) : !recent?.length ? (
            <EmptyState title="No events yet" message="Unknown people and out-of-window visitors detected at your door will appear here." />
          ) : (
            <ul className="flex-1 divide-y divide-line">
              {recent.map((i) => (
                <li key={i.id}>
                  <Link to={`/incidents/${i.id}`} className="relative flex items-center gap-3 py-3 pl-5 pr-4 transition-colors hover:bg-surface-2">
                    <span className={cn('absolute bottom-3 left-2 top-3 w-[3px] rounded-full', eventAccent(i.label))} aria-hidden />
                    {i.snapshotUrl ? (
                      <img src={i.snapshotUrl} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg bg-black object-cover" />
                    ) : (
                      <div className="grid h-12 w-20 shrink-0 place-items-center rounded-lg bg-surface-3 text-[10px] text-ink-3">No image</div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <EventTypeTag label={i.label} />
                        <time dateTime={i.timestamp} title={formatDateTime(i.timestamp)} className="shrink-0 text-xs tabular-nums text-ink-3">
                          {formatRelative(i.timestamp)}
                        </time>
                      </div>
                      <p className="truncate text-xs text-ink-3">
                        {i.cameraName} · <span className="font-mono">{i.id}</span>
                      </p>
                      {i.guardNotified && <GuardNotifiedBadge acknowledged={!!i.guardAcknowledgedAt} />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Detection flow" subtitle={`Every recorded event in the last ${FLOW_DAYS} days, from camera to response`} />
        <div className="px-4 pb-5 pt-2 sm:px-5">
          {incidents.initialLoading ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {[0, 1, 2].map((k) => (
                <Skeleton key={k} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : incidents.error && !incidents.data ? (
            <ErrorState error={incidents.error} onRetry={incidents.reload} />
          ) : flow?.length ? (
            <DetectionFlow incidents={flow} />
          ) : (
            <EmptyState title={`No events in the last ${FLOW_DAYS} days`} />
          )}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader title="Alerts per day" subtitle={`Last ${FLOW_DAYS} days · today highlighted`} />
          <div className="px-4 pb-4 sm:px-5">
            {trend.initialLoading ? (
              <LoadingState />
            ) : trend.error ? (
              <ErrorState error={trend.error} onRetry={trend.reload} />
            ) : trend.data && trend.data.some((p) => p.potential + p.confirmed > 0) ? (
              <TrendChart data={trend.data} />
            ) : (
              <EmptyState title={`No alerts in the last ${FLOW_DAYS} days`} />
            )}
          </div>
        </Card>
        <div className="xl:col-span-5">
          <FamilyTrackerCard />
        </div>
      </div>
    </>
  );
}

/** One line under the feed: engine state, FPS, unknown in view and who is at the door (GET /api/status). */
function EngineStrip({ status, loading, error }: { status?: LiveStatus; loading: boolean; error: Error | null }) {
  if (error && !status) {
    return (
      <Card className="px-4 py-3 text-sm text-ink-3" role="alert">
        <span className="font-medium text-danger-fg">Live status unavailable.</span> {error.message}
      </Card>
    );
  }
  if (loading && !status) return <Skeleton className="h-14 w-full rounded-2xl" />;
  if (!status) return null;
  const unknown = status.unknownCount;
  return (
    <Card className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-5" aria-live="polite">
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <div className="flex items-center gap-2">
          <dt className="sr-only">Detection engine</dt>
          <Activity className={cn('h-4 w-4', status.running ? 'text-ok-fg' : 'text-danger-fg')} aria-hidden />
          <dd className="font-medium">{status.running ? 'Engine running' : 'Engine stopped'}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dd className="font-semibold tabular-nums">{status.fps.toFixed(1)}</dd>
          <dt className="text-xs text-ink-3">fps</dt>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dd className={cn('font-semibold tabular-nums', unknown > 0 && 'text-danger-fg')}>{unknown}</dd>
          <dt className="text-xs text-ink-3">unknown in view</dt>
        </div>
      </dl>
      {status.peopleInView && (
        <div className="flex min-w-0 items-center gap-2 border-line md:ml-auto md:border-l md:pl-5">
          <Users className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
          <span className="sr-only">At the door now:</span>
          <PeopleInView people={status.peopleInView} />
        </div>
      )}
    </Card>
  );
}
