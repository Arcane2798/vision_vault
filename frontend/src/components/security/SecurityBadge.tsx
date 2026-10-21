import { Link } from 'react-router-dom';
import { Moon, Shield, ShieldAlert } from 'lucide-react';
import { useSecurity } from '@/context/SecurityContext';
import type { SecurityLevel } from '@/types';
import { cn, effectiveLevelText, nightModeActive, securityLevelLabel } from '@/utils/format';

export const LEVEL_STYLE: Record<SecurityLevel, { cls: string; Icon: typeof Shield }> = {
  normal: { cls: 'border-brand/40 bg-brand/10 text-blue-300', Icon: Shield },
  high: { cls: 'border-danger/40 bg-danger/10 text-red-300', Icon: ShieldAlert },
};

/** Small top-bar pill with the effective security level; links to the control on Live Monitoring. */
export function SecurityBadge() {
  const { security } = useSecurity();
  if (!security) return null;
  const night = nightModeActive(security);
  const { cls, Icon } = LEVEL_STYLE[security.effectiveLevel];
  const BadgeIcon = night ? Moon : Icon;
  return (
    <Link
      to="/live"
      title={`Security level: ${effectiveLevelText(security)} - change it on Live Monitoring`}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium hover:brightness-125', cls)}
    >
      <BadgeIcon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Security level: </span>
      {securityLevelLabel[security.effectiveLevel]}
      {night && <span className="hidden sm:inline">· night</span>}
    </Link>
  );
}
