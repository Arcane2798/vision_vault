import { config } from '@/config/env';
import type { CameraStatus, Incident, IncidentStatus, Role } from '@/types';

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

export const roleLabel: Record<Role, string> = { admin: 'Administrator', operator: 'Security operator', viewer: 'Viewer' };

export const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');
