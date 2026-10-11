import { Link } from 'react-router';
import { Alert } from '../../../shared/ui/Alert';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { FullPageSpinner } from '../../../shared/ui/Spinner';
import { useAuthSession } from '../auth-session';

/** Keycloak redirects here; the OIDC provider exchanges the code (PKCE) and navigates on. */
export function CallbackPage() {
  const session = useAuthSession();
  if (session.status === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div className="flex max-w-md flex-col gap-4">
          <Alert>{session.error ?? 'Sign-in couldn’t be completed.'}</Alert>
          <Link to="/login" className={buttonClasses()}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }
  return <FullPageSpinner label="Completing sign-in" />;
}
