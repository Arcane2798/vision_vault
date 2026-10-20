import { Link } from 'react-router-dom';
import { ArrowRight, BellRing, Cctv, ListChecks, MonitorPlay, ShieldAlert } from 'lucide-react';
import { config } from '@/config/env';
import { useAuth } from '@/context/AuthContext';
import { useRealtime } from '@/context/RealtimeContext';
import { useAsync } from '@/hooks/useAsync';
import { dashboardService, incidentService } from '@/services';
import { formatConfidence, formatRelative } from '@/utils/format';
import { LinkButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { IncidentStatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/dashboard/StatCard';
import { TrendChart } from '@/components/dashboard/TrendChart';

export default function DashboardPage() {
  const { can } = useAuth();
  const { alerts } = useRealtime();
  // refetch when a new alert arrives so counters stay correct
  const refreshKey = alerts[0]?.id;
  const summary = useAsync(() => dashboardService.summary(), [refreshKey], config.refreshIntervalMs);
  const trend = useAsync(() => dashboardService.trend(14), [], config.refreshIntervalMs * 4);
  const recent = useAsync(() => incidentService.list({ sort: 'newest' }).then((l) => l.slice(0, 6)), [refreshKey], config.refreshIntervalMs);
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of cameras, AI detections and alerts across the township."
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Active cameras"
            value={s?.activeCameras}
            suffix={s && `/ ${s.totalCameras}`}
            hint={s && s.activeCameras < s.totalCameras ? `${s.totalCameras - s.activeCameras} offline - check Live Monitoring` : 'All cameras reporting'}
            icon={<Cctv className="h-4 w-4" />}
            tone={s && s.activeCameras < s.totalCameras ? 'warn' : 'ok'}
            to={can('view:live') ? '/live' : undefined}
            loading={summary.initialLoading}
          />
          <StatCard label="Incidents today" value={s?.incidentsToday} hint="Flagged by AI since midnight" icon={<ShieldAlert className="h-4 w-4" />} loading={summary.initialLoading} />
          <StatCard
            label="Unresolved alerts"
            value={s?.unresolvedAlerts}
            hint="New or under review - need a decision"
            icon={<BellRing className="h-4 w-4" />}
            tone={s && s.unresolvedAlerts > 0 ? 'danger' : 'ok'}
            to="/incidents?status=new"
            loading={summary.initialLoading}
          />
          <StatCard label="Total incidents" value={s?.totalIncidents} hint="All recorded detections" icon={<ListChecks className="h-4 w-4" />} loading={summary.initialLoading} />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Incident trend" subtitle="Last 14 days · potential (AI-flagged) vs confirmed by a reviewer" />
          <div className="p-4">
            {trend.initialLoading ? (
              <LoadingState />
            ) : trend.error ? (
              <ErrorState error={trend.error} onRetry={trend.reload} />
            ) : trend.data && trend.data.some((p) => p.potential + p.confirmed > 0) ? (
              <TrendChart data={trend.data} />
            ) : (
              <EmptyState title="No incidents in the last 14 days" />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent detection activity"
            subtitle="Newest AI-flagged incidents"
            action={
              <Link to="/incidents" className="inline-flex items-center gap-1 text-xs text-blue-300 hover:underline">
                View all <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          />
          {recent.initialLoading ? (
            <LoadingState />
          ) : recent.error ? (
            <ErrorState error={recent.error} onRetry={recent.reload} />
          ) : !recent.data?.length ? (
            <EmptyState title="No detections yet" message="Incidents flagged by the AI model will appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {recent.data.map((i) => (
                <li key={i.id}>
                  <Link to={`/incidents/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                    {i.snapshotUrl && <img src={i.snapshotUrl} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{i.cameraName}</p>
                        <span className="shrink-0 text-xs text-ink-3">{formatRelative(i.timestamp)}</span>
                      </div>
                      <p className="truncate text-xs text-ink-3">
                        {i.label} · {formatConfidence(i.confidence)}
                      </p>
                    </div>
                    <span className="hidden sm:block">
                      <IncidentStatusBadge status={i.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
