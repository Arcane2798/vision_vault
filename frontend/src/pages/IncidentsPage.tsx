import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { config } from '@/config/env';
import { useRealtime } from '@/context/RealtimeContext';
import { useAsync } from '@/hooks/useAsync';
import { cameraService, incidentService } from '@/services';
import type { IncidentQuery, IncidentStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { IncidentFilters } from '@/components/incidents/IncidentFilters';
import { IncidentList } from '@/components/incidents/IncidentList';

const PAGE_SIZE = 15;

/** Filters live in the URL (?status=new&camera=cam-01…) so a filtered view can be bookmarked or shared. */
function useQueryParams(): [IncidentQuery, (q: IncidentQuery) => void] {
  const [params, setParams] = useSearchParams();
  const query = useMemo<IncidentQuery>(
    () => ({
      search: params.get('q') ?? '',
      cameraId: params.get('camera') ?? '',
      status: (params.get('status') ?? '') as IncidentStatus | '',
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
    }),
    [params],
  );
  const set = (q: IncidentQuery) => {
    const next: Record<string, string> = {};
    if (q.search) next.q = q.search;
    if (q.cameraId) next.camera = q.cameraId;
    if (q.status) next.status = q.status;
    if (q.from) next.from = q.from;
    if (q.to) next.to = q.to;
    if (q.sort === 'oldest') next.sort = 'oldest';
    setParams(next, { replace: true });
  };
  return [query, set];
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function IncidentsPage() {
  const [query, setQuery] = useQueryParams();
  const search = useDebounced(query.search);
  const [page, setPage] = useState(1);
  const { alerts } = useRealtime();

  const cameras = useAsync(() => cameraService.list(), []);
  const incidents = useAsync(
    () => incidentService.list({ ...query, search }),
    [search, query.cameraId, query.status, query.from, query.to, query.sort, alerts[0]?.id],
    config.refreshIntervalMs,
  );

  useEffect(() => setPage(1), [search, query.cameraId, query.status, query.from, query.to, query.sort]);

  const list = incidents.data ?? [];
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const visible = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = !!(query.search || query.cameraId || query.status || query.from || query.to);

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Every unknown person or out-of-window visitor flagged by the AI. Open an incident to review the evidence."
        actions={
          <Button icon={<RefreshCw className={incidents.loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />} onClick={incidents.reload} disabled={incidents.loading}>
            Refresh
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <IncidentFilters value={query} cameras={cameras.data ?? []} onChange={setQuery} />
      </Card>

      <Card>
        {incidents.initialLoading ? (
          <LoadingState label="Loading incidents…" />
        ) : incidents.error && !incidents.data ? (
          <ErrorState error={incidents.error} onRetry={incidents.reload} />
        ) : list.length === 0 ? (
          <EmptyState
            title={filtered ? 'No incidents match these filters' : 'No incidents recorded yet'}
            message={filtered ? 'Try a different search term, camera, status or date range.' : 'Unknown people detected at your door will be listed here.'}
            action={
              filtered && (
                <Button size="sm" onClick={() => setQuery({ sort: query.sort })}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            <IncidentList incidents={visible} />
            <div className="flex flex-col items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-ink-3 sm:flex-row">
              <p aria-live="polite">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, list.length)} of {list.length} incidents
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="tabular-nums">
                  {page} / {pages}
                </span>
                <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
