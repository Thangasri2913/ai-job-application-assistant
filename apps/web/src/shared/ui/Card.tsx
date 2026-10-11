import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn('rounded-2xl border border-border bg-surface p-5 sm:p-6', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  id,
}: {
  title: string;
  description?: string;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
    </div>
  );
}
