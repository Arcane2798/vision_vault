import { Link } from 'react-router-dom';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useSecurity } from '@/context/SecurityContext';
import type { SecurityLevel } from '@/types';
import { cn, effectiveLevelText, formatUntil } from '@/utils/format';

export const LEVEL_STYLE: Record<SecurityLevel, { cls: string; Icon: typeof ShieldCheck }> = {
  on: { cls: 'border-ok/40 bg-ok/10 text-ok-fg', Icon: ShieldCheck },
  off: { cls: 'border-warn/40 bg-warn/10 text-warn-fg', Icon: ShieldOff },
};

/** Small top-bar pill: ON (green) or OFF (amber, with the until-time); links to the control on Live Monitoring. */
export function SecurityBadge() {
  const { security } = useSecurity();
  if (!security) return null;
  const off = security.effectiveLevel === 'off';
  const { cls, Icon } = LEVEL_STYLE[off ? 'off' : 'on'];
  return (
    <Link
      to="/live"
      title={`Security: ${effectiveLevelText(security)} - change it on Live Monitoring`}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium hover:brightness-125', cls)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Security: </span>
      {off ? 'OFF' : 'ON'}
      {off && security.offUntil && <span className="font-normal">until {formatUntil(security.offUntil)}</span>}
    </Link>
  );
}
