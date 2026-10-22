import type { InViewKind, PersonInView } from '@/types';
import { cn, inViewKindLabel, inViewName } from '@/utils/format';

/** Same colours as the boxes drawn into the live frame (see the legend on Live Monitoring). */
export const IN_VIEW_STYLE: Record<InViewKind, { dot: string; chip: string }> = {
  family: { dot: 'bg-ok', chip: 'border-ok/40 bg-ok/10 text-ok-fg' },
  guest_allowed: { dot: 'bg-visitor', chip: 'border-visitor/40 bg-visitor/10 text-visitor-fg' },
  guest_outside: { dot: 'bg-caution', chip: 'border-caution/40 bg-caution/10 text-caution-fg' },
  unknown: { dot: 'bg-danger', chip: 'border-danger/40 bg-danger/10 text-danger-fg' },
};

/** Chips for everyone in view right now: colour dot + name, with the kind as text for screen readers. */
export function PeopleInView({ people }: { people: PersonInView[] }) {
  if (!people.length) return <p className="text-sm text-ink-3">Nobody in view right now.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {people.map((p, i) => {
        const style = IN_VIEW_STYLE[p.kind] ?? IN_VIEW_STYLE.unknown;
        const label = inViewKindLabel[p.kind] ?? p.kind;
        return (
          <li
            key={`${p.kind}-${p.name}-${i}`}
            title={label}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', style.chip)}
          >
            <span className={cn('h-2 w-2 rounded-full', style.dot)} aria-hidden />
            {inViewName(p)}
            <span className="sr-only">({label})</span>
          </li>
        );
      })}
    </ul>
  );
}
