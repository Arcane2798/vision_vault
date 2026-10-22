import { Building2, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/format';

/** Pill for an alert the township guard house received; green once the guard house responded. */
export function GuardNotifiedBadge({ className, acknowledged }: { className?: string; acknowledged?: boolean }) {
  return acknowledged ? (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ok/40 bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok-fg', className)}
      title="The township guard house acknowledged this alert"
    >
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      Guard house responded
    </span>
  ) : (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-guard/40 bg-guard/10 px-2 py-0.5 text-xs font-medium text-guard-fg', className)}
      title="The township guard house received a text alert with the house address and time (no images of the home)"
    >
      <Building2 className="h-3.5 w-3.5" aria-hidden />
      Guard house notified
    </span>
  );
}
