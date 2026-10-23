import { CalendarClock, CheckCircle2, Clock, EyeOff, Home, ShieldCheck, UserRound } from 'lucide-react';
import type { Person } from '@/types';
import { cn, personRoleLabel } from '@/utils/format';

/** Same pill style as StatusBadge: icon + text + colour, never colour alone. */
const base = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium';

export function PersonRoleBadge({ role }: { role: Person['role'] }) {
  const Icon = role === 'family' ? Home : UserRound;
  return (
    <span className={cn(base, role === 'family' ? 'border-ok/40 bg-ok/10 text-green-700' : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-700')}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {personRoleLabel[role]}
    </span>
  );
}

/** Whether the camera lets this person in right now. */
export function AccessBadge({ person }: { person: Person }) {
  if (!person.recognition) {
    return (
      <span className={cn(base, 'border-danger/40 bg-danger/10 text-red-700')}>
        <EyeOff className="h-3.5 w-3.5" aria-hidden />
        Recognition off: treated as unknown
      </span>
    );
  }
  if (person.role === 'family') {
    return (
      <span className={cn(base, 'border-ok/40 bg-ok/10 text-green-700')}>
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Always allowed
      </span>
    );
  }
  if (person.active) {
    return (
      <span className={cn(base, 'border-cyan-400/40 bg-cyan-400/10 text-cyan-700')}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Allowed now
      </span>
    );
  }
  const upcoming = !!person.validFrom && new Date(person.validFrom).getTime() > Date.now();
  return upcoming ? (
    <span className={cn(base, 'border-brand/40 bg-brand/10 text-brand')}>
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      Upcoming
    </span>
  ) : (
    <span className={cn(base, 'border-orange-400/40 bg-orange-400/10 text-orange-700')}>
      <Clock className="h-3.5 w-3.5" aria-hidden />
      Outside window
    </span>
  );
}
