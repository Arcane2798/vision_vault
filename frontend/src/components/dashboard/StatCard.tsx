import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/States';
import { cn } from '@/utils/format';

interface StatCardProps {
  label: string;
  value?: number;
  suffix?: ReactNode;
  hint?: string;
  icon: ReactNode;
  /** state of the metric; shown as an accent bar + coloured icon, always with the hint text */
  tone?: 'default' | 'warn' | 'danger' | 'ok';
  to?: string;
  loading?: boolean;
}

const toneBar = { default: 'bg-line-strong', warn: 'bg-warn', danger: 'bg-danger', ok: 'bg-ok' };
const toneIcon = { default: 'text-ink-3', warn: 'text-warn-fg', danger: 'text-danger-fg', ok: 'text-ok-fg' };

export function StatCard({ label, value, suffix, hint, icon, tone = 'default', to, loading }: StatCardProps) {
  const body = (
    <Card className={cn('relative h-full overflow-hidden p-4 pl-5', to && 'transition-colors group-hover:border-line-strong')}>
      <span className={cn('absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full', toneBar[tone])} aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <span className={cn('shrink-0', toneIcon[tone])} aria-hidden>
            {icon}
          </span>
          {label}
        </p>
        {to && <ArrowUpRight className="h-4 w-4 text-ink-3 transition-colors group-hover:text-ink-1" aria-hidden />}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-20" />
      ) : (
        <p className="mt-2 text-[2.15rem] font-light leading-none tracking-tight tabular-nums">
          {value ?? '-'}
          {suffix && <span className="ml-1.5 text-base font-normal text-ink-3">{suffix}</span>}
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-ink-3">{hint}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="group block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      {body}
    </Link>
  ) : (
    body
  );
}
