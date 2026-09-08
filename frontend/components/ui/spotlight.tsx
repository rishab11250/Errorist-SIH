import { cn } from '@/lib/cn';

interface SpotlightProps {
  className?: string;
}

export function Spotlight({ className }: SpotlightProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden opacity-70',
        'bg-[radial-gradient(circle_at_20%_15%,hsl(var(--accent-strong)/0.16),transparent_32%),radial-gradient(circle_at_85%_25%,hsl(var(--primary)/0.14),transparent_38%)]',
        className,
      )}
    />
  );
}
