import { useEffect, useState, type ReactNode } from 'react';
import { Moon, Plane } from 'lucide-react';
import { useSecurity } from '@/context/SecurityContext';
import type { SecurityLevel, SecurityUpdate } from '@/types';
import { cn, effectiveLevelText, formatDateTime, fromDateTimeLocal, scheduleHighActive, securityLevelLabel, toDateTimeLocal } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { LEVEL_STYLE } from './SecurityBadge';

const LEVELS: Array<{ value: SecurityLevel; description: string }> = [
  { value: 'normal', description: 'Default: alert 3 s after an unknown person appears.' },
  { value: 'high', description: 'Alert after 1 s with a stricter face match. Used automatically during sleep time and while you are away from home.' },
];

/** Normal / High segmented control plus the two schedules that switch to High: daily sleep time and away-from-home dates. */
export function SecurityLevelControl() {
  const { security, error, update, reload } = useSecurity();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [awayFrom, setAwayFrom] = useState('');
  const [awayTo, setAwayTo] = useState('');

  // keep the inputs in sync with the backend unless the user is editing them
  const savedStart = security?.night.start ?? '';
  const savedEnd = security?.night.end ?? '';
  const savedAwayFrom = toDateTimeLocal(security?.away.from ?? null);
  const savedAwayTo = toDateTimeLocal(security?.away.to ?? null);
  useEffect(() => setStart(savedStart), [savedStart]);
  useEffect(() => setEnd(savedEnd), [savedEnd]);
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

  if (!security) {
    return (
      <Card>
        <CardHeader title="Security level" />
        {error ? <ErrorState error={error} onRetry={reload} /> : <LoadingState label="Loading security level…" />}
      </Card>
    );
  }

  const night = security.night;
  const away = security.away;
  const timesDirty = start !== night.start || end !== night.end;
  const timesValid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start !== end;
  const awayDirty = awayFrom !== savedAwayFrom || awayTo !== savedAwayTo;
  const awayValid = !awayFrom || !awayTo || awayFrom < awayTo;
  const scheduled = scheduleHighActive(security);

  return (
    <Card>
      <CardHeader title="Security level" subtitle={<>Now: <b className="text-ink-1">{effectiveLevelText(security)}</b></>} />
      <div className="space-y-4 p-4">
        <div role="radiogroup" aria-label="Security level" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2 p-1">
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
                onClick={() => !selected && save({ level: value }, `Security level set to ${securityLevelLabel[value]}.`)}
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
        <ul className="space-y-1.5 text-xs">
          {LEVELS.map(({ value, description }) => (
            <li key={value} className={security.level === value ? 'text-ink-1' : 'text-ink-3'}>
              <b>{securityLevelLabel[value]}</b> - {description}
            </li>
          ))}
        </ul>

        {/* daily sleep time (API: night) */}
        <div className="space-y-3 border-t border-line pt-4">
          <ScheduleHeader
            icon={<Moon className="h-4 w-4 text-ink-2" aria-hidden />}
            title="Sleep time - auto High"
            hint="Every night between these times, while everyone is asleep."
            on={night.enabled}
            busy={busy}
            onToggle={() => save({ night: { enabled: !night.enabled } }, night.enabled ? 'Sleep time turned off.' : 'Sleep time turned on.')}
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs font-medium text-ink-2">
              <span className="block">From</span>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-32 [color-scheme:dark]" />
            </label>
            <label className="space-y-1 text-xs font-medium text-ink-2">
              <span className="block">Until</span>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-32 [color-scheme:dark]" />
            </label>
            {timesDirty && (
              <Button size="sm" variant="primary" disabled={!timesValid} loading={busy} onClick={() => save({ night: { start, end } }, `Sleep time saved: ${start} - ${end}.`)}>
                Save times
              </Button>
            )}
          </div>
        </div>

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
            {security.highReason === 'away' ? (
              <>
                Away from home: the camera is in <b>High</b>
                {away.to ? <> until {formatDateTime(away.to)}</> : ' until you turn this off'}, then returns to {securityLevelLabel[security.level]}.
              </>
            ) : (
              <>
                Sleep time: the camera is in <b>High</b> until {night.end}, then returns to {securityLevelLabel[security.level]}.
              </>
            )}
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
