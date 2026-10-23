import { Building2, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/format';

/** Pill for an alert the township guard house received; solid navy once the guard house responded. */
export function GuardNotifiedBadge({ className, acknowledged, compact }: { className?: string; acknowledged?: boolean; compact?: boolean }) {
  return acknowledged ? (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded bg-brand px-1.5 py-0.5 text-[11px] font-medium text-brand-on', className)}
      title="The township guard house acknowledged this alert"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      {compact ? 'Guard replied' : 'Guard house responded'}
    </span>
  ) : (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded border border-guard/30 bg-guard/10 px-1.5 py-0.5 text-[11px] font-medium text-guard-fg', className)}
      title="The township guard house received a text alert with the house address and time (no images of the home)"
    >
      <Building2 className="h-3 w-3" aria-hidden />
      {compact ? 'Guard notified' : 'Guard house notified'}
    </span>
  );
}
