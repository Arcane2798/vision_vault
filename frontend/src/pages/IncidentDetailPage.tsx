import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useDataVersion } from '@/hooks/useDataVersion';
import { incidentService } from '@/services';
import type { Incident } from '@/types';
import { clipProcessing, cn, eventTypeLabel, formatConfidence, formatDateTime, formatGuardAck, formatTime, incidentIdentity, isRuleBased } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState, Viewfinder } from '@/components/ui/States';
import { AiPredictionTag } from '@/components/ui/StatusBadge';
import { DetectionOverlay } from '@/components/cameras/DetectionOverlay';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { EventTypeTag } from '@/components/incidents/EventTypeTag';

/** Re-fetch this often while the clip is being converted. */
const CLIP_POLL_MS = 3000;
/** Stop polling after this long: the conversion most likely failed. */
const CLIP_WAIT_MS = 3 * 60000;
/** Keep checking for the guard house's acknowledgement this long after the alert. */
const GUARD_WAIT_MS = 30 * 60000;

export default function IncidentDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const changed = useDataVersion('incidents');
  const incident = useAsync(() => incidentService.get(id), [id, changed]);
  const inc = incident.data;
  const fresh = incident.data;
  const processing = !!fresh && clipProcessing(fresh);
  const age = fresh ? Date.now() - new Date(fresh.timestamp).getTime() : 0;
  const gaveUp = processing && age > CLIP_WAIT_MS;
  // the guard house acknowledges on its own screen; null (not undefined) = backend supports it, not acked yet
  const awaitingGuard = !!fresh?.guardNotified && fresh.guardAcknowledgedAt === null && age < GUARD_WAIT_MS;
  const { reload } = incident;
  useEffect(() => {
    if ((!processing || gaveUp) && !awaitingGuard) return;
    const t = window.setInterval(reload, CLIP_POLL_MS);
    return () => clearInterval(t);
  }, [processing, gaveUp, awaitingGuard, reload]);

  if (incident.initialLoading) return <LoadingState label="Loading incident…" />;
  if (incident.error || !inc) {
    return (
      <>
        <BackLink />
        <Card>
          <ErrorState error={incident.error ?? new Error('Incident not found.')} onRetry={incident.reload} />
        </Card>
      </>
    );
  }

  const canEvidence = can('view:evidence');
  const ruleBased = isRuleBased(inc.label);

  return (
    <>
      <BackLink />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium tabular-nums text-ink-3">Incident {inc.id}</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
            {eventTypeLabel(inc.label)} at {inc.cameraName}
          </h1>
          <p className="mt-1 text-sm tabular-nums text-ink-3">{formatDateTime(inc.timestamp)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EventTypeTag label={inc.label} />
          {inc.guardNotified && <GuardNotifiedBadge acknowledged={!!fresh?.guardAcknowledgedAt} />}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Evidence" subtitle="Snapshot taken when the alert fired" action={<AiPredictionTag />} />
            <div className="p-4">
              {!canEvidence ? (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 py-12 text-center text-sm text-ink-3">
                  <Lock className="h-6 w-6" aria-hidden />
                  Evidence is restricted to security staff.
                </div>
              ) : inc.snapshotUrl ? (
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <img src={inc.snapshotUrl} alt={`Snapshot from ${inc.cameraName} at ${formatDateTime(inc.timestamp)}`} className="mx-auto max-h-[70vh] w-full object-contain" />
                  {/* in mock mode the box is already burnt into the sample image */}
                  {!inc.snapshotUrl.startsWith('data:') && <DetectionOverlay detections={inc.detections} />}
                </div>
              ) : (
                <p className="rounded-xl bg-surface-2 py-12 text-center text-sm text-ink-3">No snapshot was saved for this incident.</p>
              )}
            </div>
          </Card>

          {canEvidence && (
            <Card>
              <CardHeader title="Video clip" subtitle="5 s before and 5 s after the alert" />
              <div className="p-4">
                {processing && !gaveUp ? (
                  <div role="status" className="flex flex-col items-center gap-3 rounded-xl bg-surface-2 py-12 text-center text-sm text-ink-2">
                    <Viewfinder />
                    Clip processing…
                    <span className="text-xs text-ink-3">The clip is still recording and converting. It appears here automatically.</span>
                  </div>
                ) : processing ? (
                  <p className="rounded-xl bg-surface-2 py-12 text-center text-sm text-ink-3">
                    The clip is not ready. It may have failed to convert - check the backend log.
                  </p>
                ) : (fresh?.clipUrl ?? inc.clipUrl) ? (
                  <video key={fresh?.clipUrl ?? inc.clipUrl} src={fresh?.clipUrl ?? inc.clipUrl} controls className="aspect-video w-full rounded-xl bg-black object-contain" preload="metadata" />
                ) : (
                  <p className="text-sm text-ink-3">No video clip was recorded for this incident.</p>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-line border-t border-line text-sm">
              <Row label="Status">
                <span className="text-ink-1">Automated alert</span>
                <span className="block text-xs text-ink-3">Raised automatically by the detection rules (no manual review step). An alert is not proof of a crime.</span>
              </Row>
              <Row label="Time">
                <span className="tabular-nums">{formatDateTime(inc.timestamp)}</span>
              </Row>
              <Row label="Event">{eventTypeLabel(inc.label)}</Row>
              <Row label="Identity">{incidentIdentity(inc)}</Row>
              {ruleBased ? (
                <Row label="Detection">Rule-based alert (no model confidence)</Row>
              ) : (
                <Row label="Confidence">{formatConfidence(inc.confidence)}</Row>
              )}
              {inc.guardNotified !== undefined && (
                <Row label="Guard house">
                  {inc.guardNotified ? <GuardNotifiedBadge acknowledged={!!fresh?.guardAcknowledgedAt} /> : <span className="text-ink-3">{inc.label === 'intrusion' ? 'Not notified' : 'Not notified (homeowner only)'}</span>}
                </Row>
              )}
              {fresh?.guardAcknowledgedAt ? (
                <Row label="Guard response">
                  <span className="inline-flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
                    Guard house acknowledged at {formatGuardAck(fresh.guardAcknowledgedAt, fresh.guardAckNote)}
                  </span>
                </Row>
              ) : (
                awaitingGuard && (
                  <Row label="Guard response">
                    <span className="text-ink-3">Waiting for the guard house to acknowledge…</span>
                  </Row>
                )
              )}
              <Row label="Camera">{inc.cameraName}</Row>
              <Row label="Location">{inc.location}</Row>
              {inc.notes && <Row label="Notes">{inc.notes}</Row>}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Timeline" subtitle="From the incident record" />
            <Timeline inc={fresh ?? inc} processing={processing} />
          </Card>

          {inc.detections.length > 0 && (
            <Card>
              <CardHeader title="AI detection details" subtitle="Raw model output" />
              <ul className="divide-y divide-line border-t border-line text-sm">
                {inc.detections.map((d) => (
                  <li key={d.id} className="space-y-0.5 px-4 py-3">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{d.label}</span>
                      <span className="tabular-nums">{formatConfidence(d.confidence)}</span>
                    </div>
                    <p className="text-xs text-ink-3">{formatDateTime(d.timestamp)}</p>
                    <p className="font-mono text-[11px] text-ink-3">
                      box x {d.bbox.x.toFixed(2)} y {d.bbox.y.toFixed(2)} w {d.bbox.width.toFixed(2)} h {d.bbox.height.toFixed(2)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

        </div>
      </div>
    </>
  );
}

/** Ordered events from the record's own timestamps (clip = 5 s pre-roll + 5 s post-roll around the alert). */
function Timeline({ inc, processing }: { inc: Incident; processing: boolean }) {
  const t = new Date(inc.timestamp).getTime();
  const at = (ms: number) => new Date(ms).toISOString();
  const items: Array<{ time: string; label: string; detail?: string; dot: string }> = [];
  if (inc.clipUrl) items.push({ time: at(t - 5000), label: 'Clip starts', detail: '5 s before the alert', dot: 'bg-ink-3' });
  items.push({ time: inc.timestamp, label: `${eventTypeLabel(inc.label)} - alert raised`, detail: 'Snapshot saved, homeowner alerted', dot: inc.label === 'intrusion' ? 'bg-danger' : 'bg-caution' });
  if (inc.guardNotified) items.push({ time: inc.timestamp, label: 'Guard house notified', dot: 'bg-guard' });
  if (inc.clipUrl) items.push({ time: at(t + 5000), label: 'Clip ends', detail: processing ? 'Still converting' : undefined, dot: 'bg-ink-3' });
  if (inc.guardAcknowledgedAt) items.push({ time: inc.guardAcknowledgedAt, label: 'Guard house acknowledged', detail: inc.guardAckNote ?? undefined, dot: 'bg-ok' });
  items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return (
    <ol className="relative mx-4 mb-4 mt-1 border-l border-line pl-5 sm:mx-5">
      {items.map((e) => (
        <li key={e.label} className="relative pb-4 last:pb-0">
          <span className={cn('absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface-1', e.dot)} aria-hidden />
          <p className="text-xs font-medium tabular-nums text-ink-3">{formatTime(e.time)}</p>
          <p className="text-sm font-medium">{e.label}</p>
          {e.detail && <p className="text-xs text-ink-3">{e.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

function BackLink() {
  return (
    <Link to="/incidents" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink-1">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to incidents
    </Link>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-2.5 sm:px-5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}
