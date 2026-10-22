import { useState } from 'react';
import { CheckCircle2, Lock, MapPin, ShieldAlert } from 'lucide-react';
import { guardService } from '@/services';
import type { GuardAlert } from '@/types';
import { cn, formatGuardAck, formatRelative, formatTime } from '@/utils/format';
import { Button } from '@/components/ui/Button';

const QUICK_NOTES = ['Guard dispatched', 'Calling homeowner', 'False alarm']; // guards no longer see the home's CCTV
const NOTE_MAX = 200;

/**
 * One guard-house alert, text only: address, camera and time. No snapshot, clip, identity or people data -
 * images of the home stay with the homeowner (privacy).
 * `now` is passed in so "x min ago" refreshes with the page clock.
 */
export function GuardAlertCard({ alert, now, onAcknowledged }: { alert: GuardAlert; now: number; onAcknowledged: (a: GuardAlert) => void }) {
  return alert.acknowledgedAt ? <AcknowledgedAlert alert={alert} now={now} /> : <OpenAlert alert={alert} now={now} onAcknowledged={onAcknowledged} />;
}

function OpenAlert({ alert, now, onAcknowledged }: { alert: GuardAlert; now: number; onAcknowledged: (a: GuardAlert) => void }) {
  const [acking, setAcking] = useState(false);
  return (
    <article className="relative overflow-hidden rounded-2xl border-2 border-red-600 bg-surface-1" aria-label={`Open alert at ${alert.houseUnit}`}>
      {/* pulsing red border; only the border pulses so the text stays readable */}
      <div className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl border-4 border-red-500" aria-hidden />
      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-5">
        <div className="flex flex-col gap-4 md:col-span-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-red-400">
            <ShieldAlert className="h-5 w-5" aria-hidden />
            Unknown person alert
          </p>
          <div>
            <p className="flex items-start gap-2 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              <MapPin className="mt-1 h-7 w-7 shrink-0 text-red-400" aria-hidden />
              <span className="break-words">{alert.houseUnit}</span>
            </p>
            <p className="mt-1 text-sm text-ink-2">{alert.cameraName}</p>
          </div>
          <p className="text-lg text-white">
            <span className="font-semibold tabular-nums">{formatTime(alert.timestamp)}</span>
            <span className="text-ink-2"> · {relative(alert.timestamp, now)}</span>
          </p>
          <p className="mt-auto flex items-center gap-1.5 text-xs text-ink-3">
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Camera images stay with the homeowner. Contact them or go to the unit.
          </p>
        </div>
        <div className="flex flex-col justify-end md:col-span-2">
          {acking ? (
            <AckPanel alert={alert} onDone={onAcknowledged} onCancel={() => setAcking(false)} />
          ) : (
            <Button variant="danger" className="h-14 w-full text-lg" icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setAcking(true)}>
              Acknowledge
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function AcknowledgedAlert({ alert, now }: { alert: GuardAlert; now: number }) {
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface-1/60 text-ink-3" aria-label={`Acknowledged alert at ${alert.houseUnit}`}>
      <div className="p-3 opacity-70">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-xl font-bold text-ink-2">{alert.houseUnit}</p>
          <p className="text-sm">
            <span className="tabular-nums">{formatTime(alert.timestamp)}</span> · {relative(alert.timestamp, now)}
          </p>
          <p className="inline-flex items-center gap-1.5 text-sm text-ink-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden />
            Acknowledged {formatGuardAck(alert.acknowledgedAt!, alert.ackNote)}
          </p>
        </div>
      </div>
    </article>
  );
}

function AckPanel({ alert, onDone, onCancel }: { alert: GuardAlert; onDone: (a: GuardAlert) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const text = note.trim();
      onDone(await guardService.acknowledge(alert.id, text ? { note: text } : {}));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-sm font-semibold text-white">Acknowledge with a note</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_NOTES.map((q) => (
          <button
            key={q}
            type="button"
            aria-pressed={note === q}
            onClick={() => setNote(note === q ? '' : q)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              note === q ? 'border-white bg-white text-black' : 'border-line bg-surface-3 text-ink-1 hover:border-ink-2',
            )}
          >
            {q}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor={`ack-note-${alert.id}`} className="sr-only">
          Note
        </label>
        <textarea
          id={`ack-note-${alert.id}`}
          rows={2}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Or type a note (optional)"
          className="w-full rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <p className="text-right text-xs text-ink-3">
          {note.length}/{NOTE_MAX}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="danger" className="h-12 flex-1" loading={busy} onClick={submit}>
          Confirm
        </Button>
        <Button variant="ghost" className="h-12" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** formatRelative against the page clock, so it ticks without re-fetching. */
function relative(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? 'just now' : formatRelative(iso);
}
