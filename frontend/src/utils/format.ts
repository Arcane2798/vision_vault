import { config } from '@/config/env';
import type { CameraStatus, Incident, IncidentStatus, InViewKind, PersonInView, PersonRole, Role, SecurityLevel, SecuritySettings } from '@/types';

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: config.timezone,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const timeOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: config.timezone,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** One timestamp format everywhere: 19 Oct 2026, 14:05:09 */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));

export function formatRelative(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const formatConfidence = (c: number) => `${Math.round(c * 100)}%`;

/** Backend `event_type` values -> display text. These alerts come from rules, not a model score. */
const EVENT_TYPE_LABELS: Record<string, string> = {
  intrusion: 'Unknown person',
  guest_outside_window: 'Visitor outside allowed time',
};

export const eventTypeLabel = (type: string) => EVENT_TYPE_LABELS[type] ?? type;

/** Rule-based events have no meaningful confidence (the backend sends a fixed 1.0), so it is hidden. */
export const isRuleBased = (type: string) => type in EVENT_TYPE_LABELS;

/** One-line description: "Unknown person" for rule-based alerts, "person · 87%" for model detections. */
export const incidentHeadline = (i: Pick<Incident, 'label' | 'confidence'>) =>
  isRuleBased(i.label) ? eventTypeLabel(i.label) : `${i.label} · ${formatConfidence(i.confidence)}`;

/** Who the engine matched. Backend logs "unknown" when no face matched. */
export function incidentIdentity(i: Pick<Incident, 'label' | 'identity'>): string {
  if (i.identity && i.identity.toLowerCase() !== 'unknown') return i.identity;
  if (i.identity || i.label === 'intrusion') return 'Unknown (no face match)';
  return 'Not recorded';
}

/** The backend is still recording / converting the clip (older backends omit clipReady = ready). */
export const clipProcessing = (i: Pick<Incident, 'clipReady'>) => i.clipReady === false;

export const incidentStatusLabel: Record<IncidentStatus, string> = {
  new: 'Potential - not reviewed',
  under_review: 'Under review',
  confirmed: 'Confirmed intrusion',
  dismissed: 'Dismissed (false alarm)',
};

export const cameraStatusLabel: Record<CameraStatus, string> = {
  online: 'Online',
  degraded: 'Unstable',
  offline: 'Offline',
};

export const securityLevelLabel: Record<SecurityLevel, string> = { home: 'Home', normal: 'Normal', away: 'Away' };

/** True when the engine is in Away only because the night schedule applies right now. */
export const nightModeActive = (s: SecuritySettings) => s.night.enabled && s.effectiveLevel === 'away' && s.level !== 'away';

/** "Away (night mode until 06:00)" while the schedule applies, else the plain level name. */
export const effectiveLevelText = (s: SecuritySettings) =>
  nightModeActive(s) ? `Away (night mode until ${s.night.end})` : securityLevelLabel[s.effectiveLevel];

/** /api/status peopleInView kinds -> display text (same meaning as the live-frame colours). */
export const inViewKindLabel: Record<InViewKind, string> = {
  family: 'Resident',
  guest_allowed: 'Visitor (allowed now)',
  guest_outside: 'Visitor outside allowed time',
  unknown: 'Unknown person',
};

/** Name to show for someone in view; unknown people have no name. */
export const inViewName = (p: PersonInView) => (p.kind === 'unknown' || !p.name || p.name.toLowerCase() === 'unknown' ? 'Unknown' : p.name);

/** Backend keeps family / guest; the UI says Resident / Visitor (never "guest"). */
export const personRoleLabel: Record<PersonRole, string> = { family: 'Resident', guest: 'Visitor' };

const shortDateTime = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const hourMinute = new Intl.DateTimeFormat('en-GB', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hour12: false });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const sameDay = (a: Date, b: Date) => dayKey.format(a) === dayKey.format(b);

/** "21 Oct, 14:00 - 18:00" (same day) or "21 Oct, 14:00 - 22 Oct, 10:00" */
export function formatWindow(from: string | null, to: string | null): string {
  if (!from && !to) return 'No time window set';
  if (!from) return `Until ${shortDateTime.format(new Date(to!))}`;
  if (!to) return `From ${shortDateTime.format(new Date(from))}`;
  const a = new Date(from);
  const b = new Date(to);
  return `${shortDateTime.format(a)} - ${sameDay(a, b) ? hourMinute.format(b) : shortDateTime.format(b)}`;
}

/** One camera, so "where" is always the front door: "Last seen at the front door at 14:32". */
export function formatLastSeen(iso: string | null): string {
  if (!iso) return 'Not seen yet';
  const d = new Date(iso);
  return `Last seen at the front door ${sameDay(d, new Date()) ? `at ${hourMinute.format(d)}` : `on ${shortDateTime.format(d)}`}`;
}

/** ISO -> value for <input type="datetime-local"> in the browser's local time. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value -> ISO (UTC), or undefined when empty. */
export const fromDateTimeLocal = (value: string): string | undefined => (value ? new Date(value).toISOString() : undefined);

export const roleLabel: Record<Role, string> = { admin: 'Administrator', operator: 'Security operator', viewer: 'Viewer' };

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
