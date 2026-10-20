import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-blue-500',
  secondary: 'bg-surface-3 text-ink-1 hover:bg-[#2b3848] border border-line',
  ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink-1',
  danger: 'bg-danger text-white hover:bg-red-500',
};

export const buttonStyles = (variant: Variant = 'secondary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
    variants[variant],
    className,
  );

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={buttonStyles(variant, size, className)} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/** A router link that looks like a button (never nest <button> inside <a>). */
export function LinkButton({ variant, size, icon, className, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonStyles(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
