import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/format';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-line/70 bg-surface-1 shadow-card', className)} {...rest} />;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-1">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
