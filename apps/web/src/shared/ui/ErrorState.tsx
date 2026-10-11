import { CircleAlert } from 'lucide-react';
import { errorMessage } from '../../lib/api/api-error';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState icon={CircleAlert} title="Couldn’t load this" description={errorMessage(error)}>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </EmptyState>
  );
}
