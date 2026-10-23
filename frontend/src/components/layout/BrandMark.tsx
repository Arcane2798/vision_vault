import { config } from '@/config/env';
import { cn } from '@/utils/format';

/**
 * Vision Vault symbol: viewfinder corners framing a lens, on a navy tile.
 * Colours come from the brand tokens, so it follows the theme.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden fill="none">
      <rect width="32" height="32" rx="7" className="fill-brand" />
      <g className="stroke-brand-on" strokeWidth="2" strokeLinecap="round">
        <path d="M8 12V9.5A1.5 1.5 0 0 1 9.5 8H12" />
        <path d="M20 8h2.5A1.5 1.5 0 0 1 24 9.5V12" />
        <path d="M24 20v2.5a1.5 1.5 0 0 1-1.5 1.5H20" />
        <path d="M12 24H9.5A1.5 1.5 0 0 1 8 22.5V20" />
        <circle cx="16" cy="16" r="4" />
      </g>
      <circle cx="16" cy="16" r="1.4" className="fill-brand-on" />
    </svg>
  );
}

/** Symbol + wordmark. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <BrandMark />
      <span className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink-1">{config.appName}</span>
    </span>
  );
}
