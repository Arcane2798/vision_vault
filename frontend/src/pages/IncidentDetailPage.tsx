import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, Loader2, Lock, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useDataVersion } from '@/hooks/useDataVersion';
import { incidentService } from '@/services';
import type { Incident, IncidentStatus } from '@/types';
import { clipProcessing, eventTypeLabel, formatConfidence, formatDateTime, formatGuardAck, incidentIdentity, incidentStatusLabel, isRuleBased } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { AiPredictionTag, IncidentStatusBadge } from '@/components/ui/StatusBadge';
import { DetectionOverlay } from '@/components/cameras/DetectionOverlay';
import { GuardNotifiedBadge } from '@/components/incidents/GuardNotifiedBadge';

/** Re-fetch this often while the clip is being converted. */
const CLIP_POLL_MS = 3000;
/** Stop polling after this long: the conversion most likely failed. */
const CLIP_WAIT_MS = 3 * 60000;
/** Keep checking for the guard house's acknowledgement this long after the alert. */
const GUARD_WAIT_MS = 30 * 60000;

export default function IncidentDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const changed = useDataVersion('incidents'); // e.g. reviewed from the assistant chat
  const incident = useAsync(() => incidentService.get(id), [id, changed]);
  const [local, setLocal] = useState<Incident | null>(null);
  // a change made elsewhere wins over this page's last review result
  useEffect(() => setLocal(null), [changed]);
  const inc = local?.id === id ? local : incident.data;

  // clip fields always come from the latest fetch (local only holds the review result)
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
          {inc.guardNotified && <GuardNotifiedBadge />}
          <IncidentStatusBadge status={inc.status} />
        </div>
      </div>

      {inc.status === 'new' || inc.status === 'under_review' ? (
        <div className="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-amber-200">
          This is an <b>automated alert</b>, not proof of an intrusion. Review the snapshot and clip before taking action.
        </div>
      ) : null}

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
              {ruleBased ? (
                <Row label="Detection">Rule-based alert (no model confidence)</Row>
              ) : (
                <Row label="Confidence">{formatConfidence(inc.confidence)}</Row>
              )}
              {inc.guardNotified !== undefined && (
                <Row label="Guard house">
                  {inc.guardNotified ? <GuardNotifiedBadge /> : <span className="text-ink-3">{inc.label === 'intrusion' ? 'Not notified' : 'Not notified (homeowner only)'}</span>}
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
              <Row label="Status">{incidentStatusLabel[inc.status]}</Row>
              {inc.reviewedBy && <Row label="Reviewed by">{inc.reviewedBy}</Row>}
              {inc.reviewedAt && <Row label="Reviewed at">{formatDateTime(inc.reviewedAt)}</Row>}
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

          {can('review:incidents') && <ReviewPanel incident={inc} onUpdated={setLocal} />}
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

const ACTIONS: Array<{ status: IncidentStatus; label: string; Icon: typeof Eye; variant: 'secondary' | 'danger' | 'ghost'; confirm?: string }> = [
  { status: 'under_review', label: 'Mark under review', Icon: Eye, variant: 'secondary' },
  { status: 'confirmed', label: 'Confirm intrusion', Icon: CheckCircle2, variant: 'danger', confirm: 'Confirm that this was a real intrusion? It will be counted as confirmed in reports.' },
  { status: 'dismissed', label: 'Dismiss as false alarm', Icon: XCircle, variant: 'ghost', confirm: 'Dismiss this incident as a false alarm?' },
];

function ReviewPanel({ incident, onUpdated }: { incident: Incident; onUpdated: (i: Incident) => void }) {
  const [notes, setNotes] = useState(incident.notes ?? '');
  const [pending, setPending] = useState<(typeof ACTIONS)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = async (status: IncidentStatus) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await incidentService.setStatus(incident.id, status, notes.trim() || undefined);
      onUpdated(updated);
      setMessage({ ok: true, text: `Saved: ${incidentStatusLabel[status]}.` });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <Card>
      <CardHeader title="Review" subtitle="Record the decision of an authorised person" />
      <div className="space-y-3 p-4">
        <label className="block text-xs font-medium text-ink-2" htmlFor="review-notes">
          Notes (optional)
        </label>
        <textarea
          id="review-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          placeholder="e.g. Resident identified, police report #…"
        />
        <div className="flex flex-col gap-2">
          {ACTIONS.filter((a) => a.status !== incident.status).map((a) => (
            <Button key={a.status} variant={a.variant} icon={<a.Icon className="h-4 w-4" />} disabled={busy} onClick={() => (a.confirm ? setPending(a) : apply(a.status))}>
              {a.label}
            </Button>
          ))}
        </div>
        {message && (
          <p role="status" className={message.ok ? 'text-sm text-green-300' : 'text-sm text-red-300'}>
            {message.text}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={!!pending}
        title={pending?.label ?? ''}
        message={pending?.confirm}
        confirmLabel={pending?.label}
        danger={pending?.status === 'confirmed'}
        busy={busy}
        onConfirm={() => pending && apply(pending.status)}
        onCancel={() => setPending(null)}
      />
    </Card>
  );
}
