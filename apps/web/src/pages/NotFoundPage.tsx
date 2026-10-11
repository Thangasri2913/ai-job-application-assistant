import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses } from '../shared/ui/button-classes';
import { EmptyState } from '../shared/ui/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you’re looking for doesn’t exist or has moved."
    >
      <Link to="/dashboard" className={buttonClasses()}>
        Go to dashboard
      </Link>
    </EmptyState>
  );
}
