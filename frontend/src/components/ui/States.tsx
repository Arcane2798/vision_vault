import type { ReactNode } from 'react';
import { AlertOctagon, Inbox, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/format';
import { Button } from './Button';

/**
 * The Vision Vault loader: a camera viewfinder with a scan line. Indeterminate (no fake progress).
 * The scan line stops under prefers-reduced-motion.
 */
export function Viewfinder({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = { sm: 'h-5 w-7 [--vf-l:6px]', md: 'h-8 w-11 [--vf-l:9px]', lg: 'h-12 w-16 [--vf-l:13px]' }[size];
  return (
    <span className={cn('viewfinder relative inline-block shrink-0 overflow-hidden [--vf-c:rgb(var(--ink-2))]', dims, className)} aria-hidden>
      <span className="absolute inset-x-0 top-0 block h-1/3 animate-scan bg-gradient-to-b from-transparent to-brand/50" />
    </span>
  );
}

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-3 py-12 text-sm text-ink-3', className)}>
      <Viewfinder />
      {label}
    </div>
  );
}

export function EmptyState({ title, message, action, icon }: { title: string; message?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <span className="mb-1 grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-2 text-ink-3" aria-hidden>
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <p className="font-medium text-ink-1">{title}</p>
      {message && <p className="max-w-sm text-sm text-ink-3">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <span className="mb-1 grid h-11 w-11 place-items-center rounded-full border border-danger/30 bg-danger/10 text-danger-fg" aria-hidden>
        <AlertOctagon className="h-5 w-5" />
      </span>
      <p className="font-medium text-ink-1">Could not load data</p>
      <p className="max-w-md text-sm text-ink-3">{error.message}</p>
      {onRetry && (
        <Button size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} aria-hidden />;
}

/** Placeholder while a list or table loads: rows with a thumbnail and two lines. */
export function ListSkeleton({ rows = 4, thumb = true }: { rows?: number; thumb?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          {thumb && <Skeleton className="h-10 w-16 shrink-0 rounded-lg" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Camera-shaped placeholder (16:9) while the camera list or stream is loading. */
export function FeedSkeleton({ label = 'Connecting to camera…' }: { label?: string }) {
  return (
    <div role="status" className="relative grid aspect-video place-items-center overflow-hidden rounded-[20px] border border-line/70 panel-tint">
      <div className="flex flex-col items-center gap-3 text-sm text-ink-3">
        <Viewfinder size="lg" />
        {label}
      </div>
    </div>
  );
}
