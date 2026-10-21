import { useEffect, useState, type ReactNode } from 'react';
import { Plane } from 'lucide-react';
import { useSecurity } from '@/context/SecurityContext';
import type { SecurityLevel, SecurityUpdate } from '@/types';
import { cn, effectiveLevelText, formatDateTime, formatUntil, fromDateTimeLocal, scheduleHighActive, securityLevelLabel, toDateTimeLocal } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { LEVEL_STYLE } from './SecurityBadge';

const LEVELS: Array<{ value: SecurityLevel; description: string }> = [
  { value: 'off', description: 'No alerts or recordings, e.g. while you have a party. Choose how long; it switches back on by itself.' },
  { value: 'normal', description: 'Default: alerts 5 s after an unknown person has been in view (seen for 10 frames).' },
  { value: 'high', description: 'Most sensitive: also waits 5 s, but is stricter about face matches and starts counting sooner (3 frames). Used automatically while you are away from home.' },
];

/** quick timers for Off */
const OFF_HOURS = [1, 2, 4, 8];

/** Normal / High segmented control plus the the away-from-home dates that switch to High. */
export function SecurityLevelControl() {
  const { security, error, update, reload } = useSecurity();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [awayFrom, setAwayFrom] = useState('');
  const [awayTo, setAwayTo] = useState('');
  const [offOpen, setOffOpen] = useState(false);
  const [offUntilInput, setOffUntilInput] = useState('');

  // keep the inputs in sync with the backend unless the user is editing them
  const savedAwayFrom = toDateTimeLocal(security?.away.from ?? null);
  const savedAwayTo = toDateTimeLocal(security?.away.to ?? null);
  useEffect(() => setAwayFrom(savedAwayFrom), [savedAwayFrom]);
  useEffect(() => setAwayTo(savedAwayTo), [savedAwayTo]);

  const save = async (patch: SecurityUpdate, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await update(patch);
      setMessage({ ok: true, text: ok });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (offUntil: string | null, label: string) => {
    await save({ level: 'off', offUntil }, `Alerts off ${label.startsWith('until') ? label : `for ${label}`}.`);
    setOffOpen(false);
    setOffUntilInput('');
  };

  if (!security) {
    return (
      <Card>
        <CardHeader title="Security level" />
        {error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading security level…" />}
      </Card>
    );
  }

  const away = security.away;
  const awayDirty = awayFrom !== savedAwayFrom || awayTo !== savedAwayTo;
  const awayValid = !awayFrom || !awayTo || awayFrom < awayTo;
  const scheduled = scheduleHighActive(security);

  return (
    <Card>
      <CardHeader title="Security level" subtitle={<>Now: <b className="text-ink-1">{effectiveLevelText(security)}</b></>} />
      <div className="space-y-4 p-4">
        <div role="radiogroup" aria-label="Security level" className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {LEVELS.map(({ value }) => {
            const selected = security.level === value;
            const { Icon, cls } = LEVEL_STYLE[value];
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() =>
                  value === 'off' ? setOffOpen(!selected || !offOpen) : !selected && save({ level: value }, `Security level set to ${securityLevelLabel[value]}.`)
                }
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-sm font-medium transition-colors disabled:cursor-wait',
                  selected ? cls : 'border-transparent text-ink-2 hover:bg-surface-3 hover:text-ink-1',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {securityLevelLabel[value]}
              </button>
            );
          })}
        </div>
        {security.level === 'off' && !offOpen && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              Alerts are <b>off</b>
              {security.offUntil ? <> until {formatUntil(security.offUntil)}, then back to {securityLevelLabel[security.resumeLevel]}</> : ' until you turn them back on'}.
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOffOpen(true)}>
              Change time
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={() => save({ level: security.resumeLevel }, `Alerts back on: ${securityLevelLabel[security.resumeLevel]}.`)}>
              Turn back on
            </Button>
          </div>
        )}
        {offOpen && (
          <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-sm font-medium">Turn alerts off for…</p>
            <div className="flex flex-wrap gap-2">
              {OFF_HOURS.map((h) => (
                <Button key={h} size="sm" disabled={busy} onClick={() => turnOff(new Date(Date.now() + h * 3600_000).toISOString(), `${h} hour${h > 1 ? 's' : ''}`)}>
                  {h} hour{h > 1 ? 's' : ''}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs font-medium text-ink-2">
                <span className="block">…or until</span>
                <Input type="datetime-local" value={offUntilInput} onChange={(e) => setOffUntilInput(e.target.value)} className="w-52 [color-scheme:dark]" />
              </label>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !offUntilInput || new Date(offUntilInput).getTime() <= Date.now()}
                onClick={() => turnOff(fromDateTimeLocal(offUntilInput) ?? null, `until ${formatUntil(fromDateTimeLocal(offUntilInput)!)}`)}
              >
                Turn off until then
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => turnOff(null, 'until you turn them back on')}>
                Until I turn it back on
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOffOpen(false)} className="ml-auto">
                Cancel
              </Button>
            </div>
            <p className="text-xs text-ink-3">While off, people are still tracked on the live view, but nothing is recorded and no one is alerted.</p>
          </div>
        )}
        <ul className="space-y-1.5 text-xs">
          {LEVELS.map(({ value, description }) => (
            <li key={value} className={security.level === value ? 'text-ink-1' : 'text-ink-3'}>
              <b>{securityLevelLabel[value]}</b> - {description}
            </li>
          ))}
        </ul>

        {/* away from home, e.g. a vacation */}
        <div className="space-y-3 border-t border-line pt-4">
          <ScheduleHeader
            icon={<Plane className="h-4 w-4 text-ink-2" aria-hidden />}
            title="Away from home - auto High"
            hint="For trips and vacations: High for the whole time nobody is home."
            on={away.enabled}
            busy={busy}
            onToggle={() => save({ away: { enabled: !away.enabled } }, away.enabled ? 'Away from home turned off.' : 'Away from home turned on.')}
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs font-medium text-ink-2">
              <span className="block">Leaving</span>
              <Input type="datetime-local" value={awayFrom} onChange={(e) => setAwayFrom(e.target.value)} className="w-52 [color-scheme:dark]" aria-invalid={!awayValid} />
            </label>
            <label className="space-y-1 text-xs font-medium text-ink-2">
              <span className="block">Back home</span>
              <Input type="datetime-local" value={awayTo} onChange={(e) => setAwayTo(e.target.value)} className="w-52 [color-scheme:dark]" aria-invalid={!awayValid} />
            </label>
            {awayDirty && (
              <Button
                size="sm"
                variant="primary"
                disabled={!awayValid}
                loading={busy}
                onClick={() => save({ away: { from: fromDateTimeLocal(awayFrom) ?? null, to: fromDateTimeLocal(awayTo) ?? null } }, 'Away-from-home dates saved.')}
              >
                Save dates
              </Button>
            )}
          </div>
          {!awayValid && <p className="text-xs text-red-300">"Back home" must be after "Leaving".</p>}
          {away.enabled && !away.from && !away.to && <p className="text-xs text-ink-3">No dates set: High stays on until you turn this off.</p>}
        </div>

        {scheduled && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-red-300">
            
              <>
                Away from home: the camera is in <b>High</b>
                {away.to ? <> until {formatDateTime(away.to)}</> : ' until you turn this off'}, then returns to {securityLevelLabel[security.level]}.
              </>
            
          </p>
        )}

        {message && (
          <p role="status" className={message.ok ? 'text-sm text-green-300' : 'text-sm text-red-300'}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}

function ScheduleHeader({ icon, title, hint, on, busy, onToggle }: { icon: ReactNode; title: string; hint: string; on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {icon} {title}
        </p>
        <p className="text-xs text-ink-3">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={busy}
        onClick={onToggle}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-wait', on ? 'bg-brand' : 'bg-surface-3')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', on ? 'left-[1.375rem]' : 'left-0.5')} aria-hidden />
      </button>
    </div>
  );
}
