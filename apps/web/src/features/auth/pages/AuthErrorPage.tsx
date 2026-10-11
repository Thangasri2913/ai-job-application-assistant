import { CircleAlert } from 'lucide-react';
import { Button } from '../../../shared/ui/Button';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { useAuth } from '../auth-context';

/** Shown when signing in or loading the account failed (e.g. Keycloak or the API is down). */
export function AuthErrorPage({ message }: { message: string }) {
  const { retry, signOut } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <EmptyState icon={CircleAlert} title="We couldn’t sign you in" description={message}>
        <div className="flex gap-2">
          <Button onClick={retry}>Try again</Button>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </EmptyState>
    </div>
  );
}
