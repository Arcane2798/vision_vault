import { useState } from 'react';
import { useSecurity } from '@/context/SecurityContext';
import type { SecurityUpdate } from '@/types';
import { cn, effectiveLevelText, formatUntil, fromDateTimeLocal } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { LEVEL_STYLE } from './SecurityBadge';

const ON_DESCRIPTION = 'Alerts after an unknown person has been in view for 5 s; residents and visitors pass silently.';

/** Next 01:00 in the browser's local time (tonight, or tomorrow night if it is already past 1 am). */
function next1am(): Date {
  const d = new Date();
  d.setHours(1, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000);

/** Off choices: a fixed end time (computed when clicked) or null = until turned back on. */
const OFF_CHOICES: Array<{ label: string; until: () => Date | null }> = [
  { label: '1 hour', until: () => hoursFromNow(1) },
  { label: '3 hours', until: () => hoursFromNow(3) },
  { label: 'Until 1:00 am', until: next1am },
  { label: 'Until I turn it back on', until: () => null },
];

/** Security On / Off switch. Turning off asks how long (e.g. a party); while off, alerts and recordings are paused. */
export function SecurityLevelControl() {
  const { security, error, update, reload } = useSecurity();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [offOpen, setOffOpen] = useState(false);
  const [customUntil, setCustomUntil] = useState('');

  const save = async (patch: SecurityUpdate, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await update(patch);
      setMessage({ ok: true, text: ok });
      return true;
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (until: Date | null) => {
    const iso = until ? until.toISOString() : null;
    const done = await save(
      { level: 'off', offUntil: iso },
      iso ? `Security off until ${formatUntil(iso)}.` : 'Security off until you turn it back on.',
    );
    if (done) {
      setOffOpen(false);
      setCustomUntil('');
    }
  };

  const turnOn = () => {
    setOffOpen(false);
    save({ level: 'on' }, 'Security is on.');
  };

  if (!security) {
    return (
      <Card>
        <CardHeader title="Security" />
        {error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading security…" />}
      </Card>
    );
  }

  const isOn = security.effectiveLevel !== 'off';
  const { Icon, cls } = LEVEL_STYLE[isOn ? 'on' : 'off'];
  const customIso = fromDateTimeLocal(customUntil);
  const customValid = !!customIso && new Date(customIso).getTime() > Date.now();

  return (
    <Card>
      <CardHeader title="Security" subtitle={<>Now: <b className="text-ink-1">{effectiveLevelText(security)}</b></>} />
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full border', cls)}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Security is {isOn ? 'on' : 'off'}</p>
              <p className="text-xs text-ink-3">{isOn ? ON_DESCRIPTION : 'People are still tracked on the live view, but nothing is recorded and no one is alerted.'}</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label="Security"
            disabled={busy}
            onClick={() => (isOn ? setOffOpen(!offOpen) : turnOn())}
            className={cn('relative h-7 w-14 shrink-0 rounded-full transition-colors disabled:cursor-wait', isOn ? 'bg-brand' : 'bg-surface-4')}
          >
            <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all', isOn ? 'left-[1.875rem]' : 'left-0.5')} aria-hidden />
          </button>
        </div>

        {!isOn && !offOpen && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn-fg">
            <span className="min-w-0 flex-1">
              Security is off {security.offUntil ? `until ${formatUntil(security.offUntil)}` : 'until you turn it back on'} — alerts and recordings are paused.
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOffOpen(true)}>
              Change time
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={turnOn}>
              Turn on now
            </Button>
          </div>
        )}

        {offOpen && (
          <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-sm font-medium">Turn security off…</p>
            <div className="flex flex-wrap gap-2">
              {OFF_CHOICES.map(({ label, until }) => (
                <Button key={label} size="sm" disabled={busy} onClick={() => turnOff(until())}>
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs font-medium text-ink-2">
                <span className="block">…or until</span>
                <Input type="datetime-local" value={customUntil} onChange={(e) => setCustomUntil(e.target.value)} className="w-52" />
              </label>
              <Button size="sm" variant="primary" disabled={busy || !customValid} onClick={() => customIso && turnOff(new Date(customIso))}>
                Turn off until then
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOffOpen(false)} className="ml-auto">
                Cancel
              </Button>
            </div>
            {customUntil && !customValid && <p className="text-xs text-danger-fg">Pick a time in the future.</p>}
            <p className="text-xs text-ink-3">While off, people are still tracked on the live view, but nothing is recorded and no one is alerted.</p>
          </div>
        )}

        {message && (
          <p role="status" className={message.ok ? 'text-sm text-ok-fg' : 'text-sm text-danger-fg'}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}
