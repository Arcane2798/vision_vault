import { config } from '@/config/env';
import { cn } from '@/utils/format';

/**
 * Vision Vault symbol: viewfinder corners framing a lens, with a small status dot.
 * Uses currentColor for the frame so it works on dark and light surfaces; the dot is the brand accent.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden fill="none">
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" className="fill-surface-3 stroke-line-strong" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M8 12V9.5A1.5 1.5 0 0 1 9.5 8H12" />
        <path d="M20 8h2.5A1.5 1.5 0 0 1 24 9.5V12" />
        <path d="M24 20v2.5a1.5 1.5 0 0 1-1.5 1.5H20" />
        <path d="M12 24H9.5A1.5 1.5 0 0 1 8 22.5V20" />
      </g>
      <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="1.4" className="fill-brand" />
    </svg>
  );
}

/** Symbol + wordmark. `compact` hides the text (collapsed sidebar). */
export function BrandLockup({ compact, subtitle = 'Home security' }: { compact?: boolean; subtitle?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <BrandMark className="text-ink-1" />
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-semibold tracking-tight">{config.appName}</span>
          <span className="block truncate text-[11px] text-ink-3">{subtitle}</span>
        </span>
      )}
    </span>
  );
}
