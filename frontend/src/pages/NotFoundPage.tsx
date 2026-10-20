import { LinkButton } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="font-mono text-5xl font-semibold text-ink-3">404</p>
      <p className="font-medium">Page not found</p>
      <LinkButton to="/" variant="primary">
        Go to dashboard
      </LinkButton>
    </div>
  );
}
