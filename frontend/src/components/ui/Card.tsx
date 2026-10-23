import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/format';

/** The standard panel: white on the canvas, hairline border. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel-tint rounded-xl border border-line', className)} {...rest} />;
}

/** A quiet block inside a Card (list items, small blocks). */
export function Tile({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-surface-2', className)} {...rest} />;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-[-0.005em] text-ink-1">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
