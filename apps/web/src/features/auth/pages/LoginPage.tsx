import { LogIn, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { useAuth } from '../auth-context';
import { useAuthSession } from '../auth-session';
import { safeReturnUrl } from '../safe-return-url';

/**
 * Entry point for signed-out users. Credentials are entered on Keycloak's own pages —
 * this app never sees a password.
 */
export function LoginPage() {
  const { signIn, register } = useAuth();
  const session = useAuthSession();
  const [searchParams] = useSearchParams();
  const [starting, setStarting] = useState<'signin' | 'register' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const returnUrl = safeReturnUrl(searchParams.get('returnUrl'));
  const expired = searchParams.get('reason') === 'expired';

  const start = async (kind: 'signin' | 'register') => {
    setError(null);
    setStarting(kind);
    try {
      await (kind === 'signin' ? signIn(returnUrl) : register(returnUrl));
    } catch {
      setError('We couldn’t reach the sign-in service. Please try again in a moment.');
      setStarting(null);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to JobAssist</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Keep a resume for every role, track your applications, and find the right resume for each
        job.
      </p>

      {expired ? (
        <div className="mb-4">
          <Alert>Your session has expired. Please sign in again.</Alert>
        </div>
      ) : null}
      {error || session.error ? (
        <div className="mb-4">
          <Alert>{error ?? session.error}</Alert>
        </div>
      ) : null}

      <p className="mb-2 text-sm font-medium">Sign in with your account</p>
      <Button
        className="h-11 w-full"
        loading={starting === 'signin'}
        disabled={starting !== null}
        onClick={() => void start('signin')}
      >
        <LogIn className="size-4" aria-hidden />
        Sign in
      </Button>

      <p className="mt-6 mb-2 text-sm text-muted">Don’t have an account?</p>
      <Button
        variant="secondary"
        className="h-11 w-full"
        loading={starting === 'register'}
        disabled={starting !== null}
        onClick={() => void start('register')}
      >
        <UserPlus className="size-4" aria-hidden />
        Create account
      </Button>
    </>
  );
}
