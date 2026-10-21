import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useDataVersion } from '@/hooks/useDataVersion';
import { incidentService } from '@/services';
import { clipProcessing, eventTypeLabel, formatConfidence, formatDateTime, formatGuardAck, incidentIdentity, isRuleBased } from '@/utils/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { AiPredictionTag } from '@/components/ui/StatusBadge';
import { DetectionOverlay } from '@/components/cameras/DetectionOverlay';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';
import { ItemsBadge } from '@/components/incidents/ItemsBadge';

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
        <div>
          <p className="font-mono text-xs text-ink-3">{inc.id}</p>
          <h1 className="text-xl font-semibold">
            {eventTypeLabel(inc.label)} at {inc.cameraName}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ItemsBadge items={inc.items} />
          {inc.guardNotified && <GuardNotifiedBadge acknowledged={!!fresh?.guardAcknowledgedAt} />}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Evidence" subtitle="Snapshot taken when the alert fired" action={<AiPredictionTag />} />
            <div className="p-4">
              {!canEvidence ? (
                <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-2 py-12 text-center text-sm text-ink-3">
                  <Lock className="h-6 w-6" aria-hidden />
                  Evidence is restricted to security staff.
                </div>
              ) : inc.snapshotUrl ? (
                <div className="relative overflow-hidden rounded-lg bg-black">
                  <img src={inc.snapshotUrl} alt={`Snapshot from ${inc.cameraName} at ${formatDateTime(inc.timestamp)}`} className="w-full" />
                  {/* in mock mode the box is already burnt into the sample image */}
                  {!inc.snapshotUrl.startsWith('data:') && <DetectionOverlay detections={inc.detections} />}
                </div>
              ) : (
                <p className="rounded-lg bg-surface-2 py-12 text-center text-sm text-ink-3">No snapshot was saved for this incident.</p>
              )}
            </div>
          </Card>

          {canEvidence && (
            <Card>
              <CardHeader title="Video clip" subtitle="5 s before and 5 s after the alert" />
              <div className="p-4">
                {processing && !gaveUp ? (
                  <div role="status" className="flex flex-col items-center gap-2 rounded-lg bg-surface-2 py-12 text-center text-sm text-ink-2">
                    <Loader2 className="h-6 w-6 animate-spin text-ink-3" aria-hidden />
                    Clip processing…
                    <span className="text-xs text-ink-3">The clip is still recording and converting. It appears here automatically.</span>
                  </div>
                ) : processing ? (
                  <p className="rounded-lg bg-surface-2 py-12 text-center text-sm text-ink-3">
                    The clip is not ready. It may have failed to convert - check the backend log.
                  </p>
                ) : (fresh?.clipUrl ?? inc.clipUrl) ? (
                  <video key={fresh?.clipUrl ?? inc.clipUrl} src={fresh?.clipUrl ?? inc.clipUrl} controls className="w-full rounded-lg bg-black" preload="metadata" />
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
            <dl className="divide-y divide-line text-sm">
              <Row label="Time">{formatDateTime(inc.timestamp)}</Row>
              <Row label="Event">{eventTypeLabel(inc.label)}</Row>
              <Row label="Identity">{incidentIdentity(inc)}</Row>
              {!!inc.items?.length && <Row label="Carrying">{inc.items.join(', ')} (AI prototype)</Row>}
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

          {inc.detections.length > 0 && (
            <Card>
              <CardHeader title="AI detection details" subtitle="Raw model output" />
              <ul className="divide-y divide-line text-sm">
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

function BackLink() {
  return (
    <Link to="/incidents" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink-1">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to incidents
    </Link>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-2.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}
