import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Cctv, ChevronRight, Users } from 'lucide-react';
import { config, isMock } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { useSecurity } from '@/context/SecurityContext';
import { useAsync } from '@/hooks/useAsync';
import { useDataVersion } from '@/hooks/useDataVersion';
import { useLiveStatus } from '@/hooks/useLiveStatus';
import { useTestVideoSource } from '@/hooks/useTestVideoSource';
import { cameraService, dashboardService, incidentService } from '@/services';
import type { LiveStatus, SecuritySettings } from '@/types';
import { cn, effectiveLevelText, eventTypeLabel, formatDateTime, formatRelative, formatTime } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, FeedSkeleton, ListSkeleton, LoadingState, Skeleton } from '@/components/ui/States';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { DetectionFlow } from '@/components/dashboard/DetectionFlow';
import { CameraFeed } from '@/components/cameras/CameraFeed';
import { PeopleInView } from '@/components/live/PeopleInView';
import { FamilyTrackerCard } from '@/components/family/FamilyTrackerCard';

const FLOW_DAYS = 14;

export default function DashboardPage() {
  const { can } = useAuth();
  const { alerts, guardAcks } = useRealtime();
  const { security } = useSecurity();
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
  const recent = incidents.data?.slice(0, 4);
  const since = Date.now() - FLOW_DAYS * 86400000;
  const flow = incidents.data?.filter((i) => new Date(i.timestamp).getTime() >= since);
  const awaiting = s?.awaitingGuard ?? 0;

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-12">
        {/* the door: what is happening there now, then the picture */}
        <section aria-labelledby="door-state" className="space-y-4 xl:col-span-8 xl:row-start-1">
          <DoorHeadline status={live.data} error={live.error} loading={live.loading} stale={live.stale} updatedAt={live.updatedAt} security={security} />
          {cameras.initialLoading ? (
            <FeedSkeleton />
          ) : cameras.error && !cameras.data ? (
            <Card>
              <ErrorState error={cameras.error} onRetry={cameras.reload} />
            </Card>
          ) : camera ? (
            <CameraFeed camera={camera} testVideo={testVideo} />
          ) : (
            <Card>
              <EmptyState title="No camera reported" message="Start the backend and check VIDEO_SOURCE in .env, then reload this page." icon={<Cctv className="h-5 w-5" />} />
            </Card>
          )}
          {live.data && <AtTheDoor status={live.data} stale={live.stale} />}
        </section>

        {/* on phones this comes right after the camera; on wide screens it spans both rows on the right */}
        <div className="space-y-5 xl:col-span-4 xl:col-start-9 xl:row-span-2 xl:row-start-1">
          <Card>
            <CardHeader title="Today" />
            {summary.error && !s ? (
              <ErrorState error={summary.error} onRetry={summary.reload} />
            ) : (
              <ul className="mx-4 mb-2 divide-y divide-line sm:mx-5">
                <TodayRow
                  loading={summary.initialLoading}
                  value={s?.incidentsToday}
                  label="Incidents"
                  hint={s && s.incidentsToday > 0 ? 'Since midnight' : 'None since midnight'}
                  alarm={!!s && s.incidentsToday > 0}
                  to="/incidents"
                />
                <TodayRow
                  loading={summary.initialLoading}
                  value={awaiting}
                  label="Awaiting the guard house"
                  hint={awaiting > 0 ? 'Not acknowledged in the last 24 h' : 'Every alert was answered'}
                  alarm={awaiting > 0}
                  to="/incidents"
                />
                <TodayRow
                  loading={summary.initialLoading}
                  value={s?.activeCameras}
                  suffix={s ? `/${s.totalCameras}` : undefined}
                  label="Cameras online"
                  hint={s && s.activeCameras < s.totalCameras ? 'One is offline. Check Live Monitoring.' : 'Reporting normally'}
                  alarm={!!s && s.activeCameras < s.totalCameras}
                  to={can('view:live') ? '/live' : undefined}
                />
                <TodayRow loading={summary.initialLoading} value={s?.totalIncidents} label="On record" hint="All incidents kept on this computer" to="/incidents" />
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Recent events"
              action={
                <Link to="/incidents" className="inline-flex items-center gap-0.5 text-sm font-medium text-brand-fg hover:underline">
                  See all <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              }
            />
            <div className="px-3 pb-3">
              {incidents.initialLoading ? (
                <ListSkeleton rows={3} />
              ) : incidents.error && !incidents.data ? (
                <ErrorState error={incidents.error} onRetry={incidents.reload} />
              ) : !recent?.length ? (
                <EmptyState title="No events yet" message="When someone unknown stays at the door, the snapshot and time appear here." />
              ) : (
                <ul className="space-y-2">
                  {recent.map((i) => (
                    <li key={i.id}>
                      <Link
                        to={`/incidents/${i.id}`}
                        className="flex gap-3 rounded-xl bg-surface-1 p-2.5 transition-colors hover:bg-brand-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {i.snapshotUrl ? (
                          <img src={i.snapshotUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-black object-cover" />
                        ) : (
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-surface-3 text-ink-3" aria-hidden>
                            <Cctv className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                            <span className={cn('h-2 w-2 shrink-0 rounded-full', i.label === 'intrusion' ? 'bg-danger' : 'bg-caution')} aria-hidden />
                            {eventTypeLabel(i.label)}
                          </p>
                          <p className="truncate text-xs text-ink-3">
                            <time dateTime={i.timestamp} title={formatDateTime(i.timestamp)}>
                              {formatRelative(i.timestamp)}
                            </time>{' '}
                            at {i.cameraName}
                          </p>
                          <div className="mt-1">
                            {i.guardNotified ? (
                              <GuardNotifiedBadge acknowledged={!!i.guardAcknowledgedAt} compact />
                            ) : (
                              <span className="text-[11px] text-ink-3">Sent to you only</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Alerts per day" subtitle={`Last ${FLOW_DAYS} days`} />
            <div className="px-2 pb-3">
              {trend.initialLoading ? (
                <LoadingState />
              ) : trend.error ? (
                <ErrorState error={trend.error} onRetry={trend.reload} />
              ) : trend.data && trend.data.some((p) => p.potential + p.confirmed > 0) ? (
                <TrendChart data={trend.data} height="h-48" />
              ) : (
                <EmptyState title={`No alerts in the last ${FLOW_DAYS} days`} />
              )}
            </div>
          </Card>
        </div>

        <Card className="self-start xl:col-span-8">
          <CardHeader title="Where alerts went" subtitle={`The last ${FLOW_DAYS} days, from the camera to whoever responded`} />
          <div className="px-4 pb-5 pt-1 sm:px-5">
            {incidents.initialLoading ? (
              <div className="grid gap-3 md:grid-cols-3">
                {[0, 1, 2].map((k) => (
                  <Skeleton key={k} className="h-20 rounded-xl" />
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
      </div>

      <div className="mt-5">
        <FamilyTrackerCard />
      </div>
    </>
  );
}

/**
 * The page headline is the state of the door, read from GET /api/status: the one thing a homeowner opens this page to know.
 * The line under it is the security switch, linking to where it is changed.
 */
function DoorHeadline({ status, error, loading, stale, updatedAt, security }: { status?: LiveStatus; error: Error | null; loading: boolean; stale: boolean; updatedAt: number | null; security?: SecuritySettings | null }) {
  let text: string;
  let alarm = false;
  let warn = false;
  // live status comes only from the backend; sample mode says so instead of reporting a fault
  if (isMock) text = 'This is sample data, not your door.';
  else if (loading && !status) text = '';
  else if (!status) text = error ? 'Cannot reach the camera right now.' : 'Waiting for the camera…';
  // never keep saying "all quiet" from old data
  else if (stale) {
    warn = true;
    text = 'Lost contact with the camera.';
  }
  else if (!status.running) text = 'The front door is not being watched.';
  else if (status.unknownCount > 0) {
    alarm = true;
    text = status.unknownCount === 1 ? 'Someone unknown is at the front door.' : `${status.unknownCount} unknown people are at the front door.`;
  } else if (status.peopleInView?.length) text = 'Only people you know are at the door.';
  else text = 'All quiet at the front door.';

  const off = security?.effectiveLevel === 'off';
  return (
    // height reserved for the headline and its status line, so nothing below jumps when they load
    <div className="min-h-[5.75rem] sm:min-h-[4.5rem]">
      {text ? (
        <h1 id="door-state" className={cn('text-[28px] font-bold leading-[1.15] tracking-[-0.025em] sm:text-[36px]', alarm ? 'text-danger-fg' : warn ? 'text-warn-fg' : 'text-ink-1')} aria-live="polite">
          {text}
        </h1>
      ) : (
        <>
          <h1 id="door-state" className="sr-only">
            Front door
          </h1>
          <Skeleton className="h-10 w-3/4" />
        </>
      )}
      {stale && updatedAt ? (
        <p className="mt-1.5 text-sm font-medium text-warn-fg">
          Last update at {formatTime(new Date(updatedAt).toISOString())}. Retrying every few seconds.
        </p>
      ) : security && (
        <Link to="/live" className={cn('mt-1.5 inline-flex items-center gap-0.5 text-sm font-medium hover:underline', off ? 'text-warn-fg' : 'text-brand-fg')}>
          {off ? `Security is ${effectiveLevelText(security).toLowerCase()}. Nothing is recorded or alerted.` : 'Security is on. Strangers are recorded and reported.'}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Who the engine sees right now, and how fast it is running. */
function AtTheDoor({ status, stale }: { status: LiveStatus; stale: boolean }) {
  // not a live region: FPS changes every poll and would be read out constantly; the headline announces state changes
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between', stale && 'opacity-60')}>
      <div className="flex min-w-0 items-center gap-3">
        <Users className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        <span className="shrink-0 text-sm font-medium">{stale ? 'Last known at the door' : 'At the door now'}</span>
        {status.peopleInView ? <PeopleInView people={status.peopleInView} /> : <span className="text-sm text-ink-3">Not reported by this backend</span>}
      </div>
      <p className="shrink-0 text-xs tabular-nums text-ink-3">
        <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-middle', status.running ? 'bg-ok' : 'bg-danger')} aria-hidden />
        {status.running ? 'Engine running' : 'Engine stopped'}, {status.fps.toFixed(1)} frames a second
      </p>
    </div>
  );
}

/** One line of the Today panel: the number large on the left, what it means on the right. */
function TodayRow({ value, suffix, label, hint, alarm, to, loading }: { value?: number; suffix?: string; label: string; hint: string; alarm?: boolean; to?: string; loading: boolean }) {
  const body: ReactNode = (
    <>
      <span className="w-16 shrink-0">
        {loading ? (
          <Skeleton className="h-8 w-10" />
        ) : (
          <span className={cn('text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums', alarm ? 'text-danger-fg' : 'text-ink-1')}>
            {value ?? '-'}
            {suffix && <span className="text-base font-semibold text-ink-3">{suffix}</span>}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-1">{label}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
      {to && <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />}
    </>
  );
  return to ? (
    <li>
      <Link to={to} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
        {body}
      </Link>
    </li>
  ) : (
    <li className="flex items-center gap-3 py-3">{body}</li>
  );
}
