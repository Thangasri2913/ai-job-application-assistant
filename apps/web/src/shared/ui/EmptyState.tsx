import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span
        className="grid size-12 place-items-center rounded-full bg-surface-muted text-muted"
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
