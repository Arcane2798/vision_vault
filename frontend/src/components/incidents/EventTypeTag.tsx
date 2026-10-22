import { UserX, Clock } from 'lucide-react';
import { cn, eventTypeLabel } from '@/utils/format';

/**
 * Event type as icon + text + colour (never colour alone). Unknown person = red, visitor outside
 * their window = orange: the same colours the engine draws in the live frame.
 */
export function EventTypeTag({ label, className }: { label: string; className?: string }) {
  const intrusion = label === 'intrusion';
  const Icon = intrusion ? UserX : Clock;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        intrusion ? 'border-danger/40 bg-danger/10 text-danger-fg' : 'border-caution/40 bg-caution/10 text-caution-fg',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {eventTypeLabel(label)}
    </span>
  );
}

/** Thin accent bar class for a list row of this event type. */
export const eventAccent = (label: string) => (label === 'intrusion' ? 'bg-danger' : 'bg-caution');
