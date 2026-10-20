import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/States';
import { cn } from '@/utils/format';

interface StatCardProps {
  label: string;
  value?: number;
  suffix?: ReactNode;
  hint?: string;
  icon: ReactNode;
  tone?: 'default' | 'warn' | 'danger' | 'ok';
  to?: string;
  loading?: boolean;
}

const toneCls = { default: 'bg-brand/15 text-blue-300', warn: 'bg-warn/15 text-amber-300', danger: 'bg-danger/15 text-red-300', ok: 'bg-ok/15 text-green-300' };

export function StatCard({ label, value, suffix, hint, icon, tone = 'default', to, loading }: StatCardProps) {
  const body = (
    <Card className={cn('h-full p-4', to && 'transition-colors hover:border-ink-3')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-2">{label}</p>
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', toneCls[tone])} aria-hidden>
          {icon}
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {value ?? '-'}
          {suffix && <span className="ml-1 text-base font-normal text-ink-3">{suffix}</span>}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
      {body}
    </Link>
  ) : (
    body
  );
}
