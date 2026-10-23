import { AlertTriangle, CheckCircle2, CircleDot, Eye, ShieldAlert, WifiOff, XCircle } from 'lucide-react';
import type { CameraStatus, IncidentStatus } from '@/types';
import { cameraStatusLabel, cn, incidentStatusLabel } from '@/utils/format';

/** Status is always icon + text + colour - never colour alone (accessibility). */
const base = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium';

const incidentStyle: Record<IncidentStatus, { cls: string; Icon: typeof Eye }> = {
  new: { cls: 'border-warn/40 bg-warn/10 text-warn-fg', Icon: AlertTriangle },
  under_review: { cls: 'border-brand/40 bg-brand/10 text-brand-fg', Icon: Eye },
  confirmed: { cls: 'border-danger/40 bg-danger/10 text-danger-fg', Icon: ShieldAlert },
  dismissed: { cls: 'border-line bg-surface-3 text-ink-2', Icon: XCircle },
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const { cls, Icon } = incidentStyle[status];
  return (
    <span className={cn(base, cls)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {incidentStatusLabel[status]}
    </span>
  );
}

const cameraStyle: Record<CameraStatus, { cls: string; Icon: typeof Eye }> = {
  online: { cls: 'border-ok/40 bg-ok/10 text-ok-fg', Icon: CheckCircle2 },
  degraded: { cls: 'border-warn/40 bg-warn/10 text-warn-fg', Icon: CircleDot },
  offline: { cls: 'border-danger/40 bg-danger/10 text-danger-fg', Icon: WifiOff },
};

export function CameraStatusBadge({ status }: { status: CameraStatus }) {
  const { cls, Icon } = cameraStyle[status];
  return (
    <span className={cn(base, cls)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {cameraStatusLabel[status]}
    </span>
  );
}

/** Marks anything that is an unreviewed model output. */
export function AiPredictionTag({ className }: { className?: string }) {
  return (
    <span className={cn(base, 'border-warn/40 bg-transparent text-warn-fg', className)} title="Automated alert - not proof of an intrusion until reviewed">
      AI prediction
    </span>
  );
}
