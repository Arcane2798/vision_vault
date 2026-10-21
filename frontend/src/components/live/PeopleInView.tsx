import type { InViewKind, PersonInView } from '@/types';
import { cn, inViewKindLabel, inViewName } from '@/utils/format';

/** Same colours as the boxes drawn into the live frame (see the legend on Live Monitoring). */
export const IN_VIEW_STYLE: Record<InViewKind, { dot: string; chip: string }> = {
  family: { dot: 'bg-green-500', chip: 'border-green-500/40 bg-green-500/10 text-green-300' },
  guest_allowed: { dot: 'bg-cyan-400', chip: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' },
  guest_outside: { dot: 'bg-orange-400', chip: 'border-orange-400/40 bg-orange-400/10 text-orange-300' },
  unknown: { dot: 'bg-red-500', chip: 'border-red-500/40 bg-red-500/10 text-red-300' },
  leaving: { dot: 'bg-slate-300', chip: 'border-line bg-surface-2 text-ink-2' },
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
