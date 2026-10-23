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

const toneCls = { default: 'bg-accent/15 text-accent', warn: 'bg-warn/15 text-amber-700', danger: 'bg-danger/15 text-red-700', ok: 'bg-ok/15 text-green-700' };

export function StatCard({ label, value, suffix, hint, icon, tone = 'default', to, loading }: StatCardProps) {
  const body = (
    <Card className={cn('h-full p-5', to && 'transition-colors hover:border-brand/40')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-2">{label}</p>
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', toneCls[tone])} aria-hidden>
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
    <Link to={to} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
      {body}
    </Link>
  ) : (
    body
  );
}
