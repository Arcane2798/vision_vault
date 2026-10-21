import { useEffect, useState } from 'react';
import { Moon } from 'lucide-react';
import { useSecurity } from '@/context/SecurityContext';
import type { SecurityLevel, SecurityUpdate } from '@/types';
import { cn, effectiveLevelText, nightModeActive, securityLevelLabel } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { LEVEL_STYLE } from './SecurityBadge';

const LEVELS: Array<{ value: SecurityLevel; description: string }> = [
  { value: 'normal', description: 'Default: alert 3 s after an unknown person appears.' },
  { value: 'high', description: 'Alert after 1 s with a stricter face match. Use at night or when extra caution is needed.' },
];

/** Normal / High segmented control plus the "Night mode - auto High" schedule. */
export function SecurityLevelControl() {
  const { security, error, update, reload } = useSecurity();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  // keep the time inputs in sync with the backend unless the user is editing them
  const savedStart = security?.night.start ?? '';
  const savedEnd = security?.night.end ?? '';
  useEffect(() => setStart(savedStart), [savedStart]);
  useEffect(() => setEnd(savedEnd), [savedEnd]);

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
  const timesDirty = start !== night.start || end !== night.end;
  const timesValid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start !== end;

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

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Moon className="h-4 w-4 text-ink-2" aria-hidden /> Night mode - auto High
              </p>
              <p className="text-xs text-ink-3">Switches to High between these times every night, whatever level is set above.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={night.enabled}
              aria-label="Night mode - auto High"
              disabled={busy}
              onClick={() => save({ night: { enabled: !night.enabled } }, night.enabled ? 'Night mode turned off.' : 'Night mode turned on.')}
              className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-wait', night.enabled ? 'bg-brand' : 'bg-surface-3')}
            >
              <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all', night.enabled ? 'left-[1.375rem]' : 'left-0.5')} aria-hidden />
            </button>
          </div>
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
              <Button size="sm" variant="primary" disabled={!timesValid} loading={busy} onClick={() => save({ night: { start, end } }, `Night mode times saved: ${start} - ${end}.`)}>
                Save times
              </Button>
            )}
          </div>
          {nightModeActive(security) && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-red-300">
              Night mode is on now: the camera is in <b>High</b> until {night.end}, then returns to {securityLevelLabel[security.level]}.
            </p>
          )}
        </div>

        {message && (
          <p role="status" className={message.ok ? 'text-sm text-green-300' : 'text-sm text-red-300'}>
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}
