import { type ReactNode, useEffect, useMemo } from 'react';
import { AuthProvider as OidcProvider, useAuth as useOidc } from 'react-oidc-context';
import { type User, UserManager } from 'oidc-client-ts';
import { tokenSource } from '../../../lib/auth/token-source';
import { type AuthSession, AuthSessionContext } from '../auth-session';
import { CALLBACK_PATH, oidcSettings } from '../oidc-config';
import { safeReturnUrl } from '../safe-return-url';

interface RedirectState {
  returnUrl?: string;
}

const UNAVAILABLE = 'We couldn’t reach the sign-in service. Please try again in a moment.';

function describeError(error: Error | undefined): string | null {
  if (!error) return null;
  // Never surface raw library/protocol messages; they can include URLs or parameters.
  return /fetch|network|Failed to load/i.test(error.message)
    ? UNAVAILABLE
    : 'Sign-in couldn’t be completed. Please try again.';
}

let userManager: UserManager | null = null;
/** Set by the provider; called when the session cannot be renewed. */
let handleSessionExpired: () => void = () => undefined;

/**
 * One UserManager per page (a module singleton, so React StrictMode's double render can't
 * create a second one). The API client reads tokens straight from it (async), so requests
 * made during the first render already carry the token.
 */
function getUserManager(): UserManager {
  if (userManager) return userManager;
  const manager = new UserManager(oidcSettings());
  tokenSource.register({
    getAccessToken: async () => {
      const user = await manager.getUser();
      return user && !user.expired ? user.access_token : null;
    },
    renew: async () => (await manager.signinSilent().catch(() => null))?.access_token ?? null,
    // Drop the dead session first, otherwise /login would bounce back to the app (loop).
    onSessionExpired: () => {
      void manager.removeUser().finally(() => handleSessionExpired());
    },
  });
  userManager = manager;
  return manager;
}

/** Adapts react-oidc-context to the app's AuthSession. */
function SessionAdapter({ children }: { children: ReactNode }) {
  const oidc = useOidc();
  const session = useMemo<AuthSession>(
    () => ({
      status: oidc.isLoading
        ? 'loading'
        : oidc.error
          ? 'error'
          : oidc.isAuthenticated
            ? 'authenticated'
            : 'unauthenticated',
      error: describeError(oidc.error),
      accessToken: oidc.user?.access_token ?? null,
      signIn: (returnUrl) => oidc.signinRedirect({ state: { returnUrl } satisfies RedirectState }),
      // Keycloak shows its registration page for prompt=create.
      register: (returnUrl) =>
        oidc.signinRedirect({ state: { returnUrl } satisfies RedirectState, prompt: 'create' }),
      // Sends id_token_hint, removes the local user, and ends the Keycloak session.
      signOut: () => oidc.signoutRedirect(),
      renew: async () => (await oidc.signinSilent().catch(() => null))?.access_token ?? null,
      clear: () => oidc.removeUser(),
    }),
    [oidc],
  );
  return <AuthSessionContext.Provider value={session}>{children}</AuthSessionContext.Provider>;
}

export function OidcSessionProvider({
  children,
  onSignedIn,
  onSessionExpired,
}: {
  children: ReactNode;
  /** Navigate within the SPA after Keycloak redirects back. */
  onSignedIn: (returnUrl: string) => void;
  onSessionExpired: () => void;
}) {
  useEffect(() => {
    handleSessionExpired = onSessionExpired;
  }, [onSessionExpired]);
  const manager = getUserManager();

  return (
    <OidcProvider
      userManager={manager}
      // Only the callback route carries ?code&state for us to process.
      skipSigninCallback={window.location.pathname !== CALLBACK_PATH}
      onSigninCallback={(user: User | undefined) => {
        const state = user?.state as RedirectState | undefined;
        window.history.replaceState({}, document.title, window.location.pathname);
        onSignedIn(safeReturnUrl(state?.returnUrl));
      }}
    >
      <SessionAdapter>{children}</SessionAdapter>
    </OidcProvider>
  );
}
