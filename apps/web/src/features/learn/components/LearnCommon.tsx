import { ArrowLeft, SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { EmptyState } from '../../../shared/ui/EmptyState';

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

export function NotFound({ what }: { what: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`${what} not found`}
      description="It may have been removed, or the link is wrong. Browse the catalogue for available courses."
    >
      <Link to="/learn" className={buttonClasses('secondary')}>
        Browse courses
      </Link>
    </EmptyState>
  );
}

export function TextList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
