import { cn } from './cn';

export const controlClasses = (hasError?: boolean, className?: string) =>
  cn(
    'w-full rounded-lg border bg-surface px-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60',
    hasError ? 'border-danger' : 'border-border',
    className,
  );
