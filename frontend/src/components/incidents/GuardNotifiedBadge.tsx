import { Building2, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/format';

/** Pill for an alert the township guard house received; green once the guard house responded. */
export function GuardNotifiedBadge({ className, acknowledged }: { className?: string; acknowledged?: boolean }) {
  return acknowledged ? (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-300', className)}
      title="The township guard house acknowledged this alert"
    >
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      Guard house responded
    </span>
  ) : (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-xs font-medium text-violet-300', className)}
      title="The township guard house received this alert with the unit address and snapshot"
    >
      <Building2 className="h-3.5 w-3.5" aria-hidden />
      Guard house notified
    </span>
  );
}
