import { TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/format';

/** "Carrying: knife" pill for an intruder seen with a weapon or tool (AI prototype, may miss items). */
export function ItemsBadge({ items, className }: { items?: string[]; className?: string }) {
  if (!items?.length) return null;
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 px-2 py-0.5 text-xs font-semibold text-fuchsia-200', className)}
      title="Detected near the unknown person by the AI (prototype: it can miss items)"
    >
      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
      Carrying: {items.join(', ')}
    </span>
  );
}
