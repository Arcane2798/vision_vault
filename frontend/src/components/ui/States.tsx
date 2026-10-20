import type { ReactNode } from 'react';
import { AlertOctagon, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-ink-2">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <Inbox className="h-8 w-8 text-ink-3" aria-hidden />
      <p className="font-medium text-ink-1">{title}</p>
      {message && <p className="max-w-sm text-sm text-ink-3">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <AlertOctagon className="h-8 w-8 text-danger" aria-hidden />
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
  return <div className={`animate-pulse rounded bg-surface-3 ${className}`} aria-hidden />;
}
