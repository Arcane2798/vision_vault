import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="relative mb-7 flex flex-col gap-3 border-b border-line pb-5 after:absolute after:-bottom-px after:left-0 after:h-[2px] after:w-14 after:bg-accent after:content-[''] sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="display text-[30px] leading-[1.1] text-ink-1 sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
