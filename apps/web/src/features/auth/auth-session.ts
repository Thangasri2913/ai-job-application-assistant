import { createContext, useContext } from 'react';

/**
 * Identity-provider session, independent of the OIDC library in use. Implemented by
 * OidcSessionProvider in the app and by a fake in tests.
 */
export interface AuthSession {
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'error';
  /** User-facing message when the sign-in service failed (e.g. Keycloak unreachable). */
  error: string | null;
  accessToken: string | null;
  /** Starts sign-in at Keycloak; returns to `returnUrl` afterwards. */
  signIn: (returnUrl?: string) => Promise<void>;
  /** Starts Keycloak's registration page; returns to `returnUrl` afterwards. */
  register: (returnUrl?: string) => Promise<void>;
  /** Ends the local session and the Keycloak session, then returns to /login. */
  signOut: () => Promise<void>;
  /** Silently renews the access token. Resolves to the new token, or null. */
  renew: () => Promise<string | null>;
  /** Drops the local session without contacting Keycloak (e.g. after it expired). */
  clear: () => Promise<void>;
}

export const AuthSessionContext = createContext<AuthSession | null>(null);

export function useAuthSession(): AuthSession {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error('useAuthSession must be used inside an auth session provider');
  return value;
}
