import { Building2 } from 'lucide-react';
import { cn } from '@/utils/format';

/** Small pill shown when the township guard house got a Telegram copy of the alert. */
export function GuardNotifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-xs font-medium text-violet-300', className)}
      title="The township guard house received this alert with the unit address and snapshot"
    >
      <Building2 className="h-3.5 w-3.5" aria-hidden />
      Guard house notified
    </span>
  );
}
