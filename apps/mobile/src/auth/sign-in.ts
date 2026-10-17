import { expectedIssuer, type MobileConfig } from '../config';
import type { StoredTokens } from './token-store';
import { tokensFromResponse } from './session';

/**
 * The sign-in sequence, separated from React and Expo so every step and failure can be
 * tested. Messages are safe to show: they never contain tokens, codes or verifiers.
 */

/** What the browser step returned (subset of expo-auth-session's AuthSessionResult). */
export type PromptResult =
  | { type: 'success'; params: Record<string, string> }
  | { type: 'error'; params: Record<string, string> }
  | { type: 'cancel' | 'dismiss' | 'locked' | 'opened' };

export interface SignInDeps {
  config: Pick<MobileConfig, 'keycloakUrl' | 'realm' | 'apiUrl'>;
  redirectUri: string;
  fetchFn: (
    url: string,
    init?: { signal?: AbortSignal },
  ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  /** Opens the system browser at Keycloak (PKCE S256); resolves when it returns. */
  prompt: () => Promise<PromptResult>;
  /** Exchanges the code with the original PKCE verifier and the same redirect URI. */
  exchange: (
    code: string,
    redirectUri: string,
  ) => Promise<{
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresIn?: number;
  }>;
  save: (tokens: StoredTokens) => Promise<void>;
  clear: () => Promise<void>;
  /** Calls the API with the new access token (GET /auth/me). */
  verifyApi: () => Promise<'ok' | 'rejected' | 'unreachable'>;
  now?: () => number;
}

export type SignInOutcome =
  | { kind: 'signed-in'; warning: string | null }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

const TIMEOUT_MS = 10_000;

/** Checks that Keycloak is reachable and reports the issuer this configuration expects. */
export async function preflight(
  deps: Pick<SignInDeps, 'config' | 'fetchFn'>,
): Promise<string | null> {
  const issuer = expectedIssuer(deps.config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let doc: { issuer?: unknown };
  try {
    const res = await deps.fetchFn(`${issuer}/.well-known/openid-configuration`, {
      signal: controller.signal,
    });
    if (res.status === 404)
      return `The sign-in realm was not found at ${deps.config.keycloakUrl}. Check EXPO_PUBLIC_KEYCLOAK_REALM.`;
    if (!res.ok)
      return `The sign-in server at ${deps.config.keycloakUrl} returned an error (HTTP ${res.status}).`;
    doc = (await res.json()) as { issuer?: unknown };
  } catch {
    return `Can’t reach the sign-in server at ${deps.config.keycloakUrl}. Make sure this phone can reach your computer (same Wi‑Fi, or USB with adb reverse) and that Keycloak accepts connections from it — see docs/MOBILE.md.`;
  } finally {
    clearTimeout(timer);
  }
  if (doc.issuer !== issuer) {
    // e.g. Keycloak's hostname is fixed to localhost: its login page would send the phone
    // to "localhost", and the API would reject tokens with the wrong issuer.
    return `Keycloak is reachable at ${deps.config.keycloakUrl} but is configured for ${String(doc.issuer)}. Set Keycloak's public URL (KEYCLOAK_PUBLIC_URL) to ${deps.config.keycloakUrl} — see docs/MOBILE.md.`;
  }
  return null;
}

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'Sign-in was cancelled or access was denied.',
  state_mismatch: 'The sign-in response did not match this sign-in attempt. Please try again.',
  unauthorized_client:
    'This app is not allowed to sign in with the configured Keycloak client (check the client id and that it is a public client).',
  invalid_request:
    'Keycloak rejected the sign-in request (often a redirect URI that is not allowed for the mobile client).',
  login_required: 'Please sign in again.',
};

export async function signIn(deps: SignInDeps): Promise<SignInOutcome> {
  const problem = await preflight(deps);
  if (problem) return { kind: 'failed', message: problem };

  let result: PromptResult;
  try {
    result = await deps.prompt();
  } catch {
    return { kind: 'failed', message: 'The sign-in page could not be opened. Please try again.' };
  }
  if (result.type === 'cancel' || result.type === 'dismiss') return { kind: 'cancelled' };
  if (result.type === 'locked')
    return { kind: 'failed', message: 'A sign-in is already in progress.' };
  if (result.type === 'error') {
    const code = result.params.error ?? 'unknown_error';
    return {
      kind: 'failed',
      message:
        OAUTH_ERRORS[code] ?? `Sign-in failed (${code.replace(/[^\w.-]/g, '')}). Please try again.`,
    };
  }
  if (result.type !== 'success' || !result.params.code) {
    return {
      kind: 'failed',
      message: 'Sign-in did not return to the app correctly. Please try again.',
    };
  }

  let tokens: StoredTokens;
  try {
    const r = await deps.exchange(result.params.code, deps.redirectUri);
    tokens = tokensFromResponse(
      {
        access_token: r.accessToken,
        refresh_token: r.refreshToken,
        id_token: r.idToken,
        expires_in: r.expiresIn,
      },
      (deps.now ?? Date.now)(),
    );
  } catch {
    return {
      kind: 'failed',
      message:
        'Signing in could not be completed (the code exchange with Keycloak failed). Please try again.',
    };
  }
  await deps.save(tokens);

  const api = await deps.verifyApi();
  if (api === 'rejected') {
    await deps.clear();
    return {
      kind: 'failed',
      message:
        'You signed in, but the API rejected the session. The API must accept the mobile client (KEYCLOAK_MOBILE_CLIENT_ID) and the same Keycloak issuer — see docs/MOBILE.md.',
    };
  }
  return {
    kind: 'signed-in',
    warning:
      api === 'unreachable'
        ? `Signed in, but the API at ${deps.config.apiUrl} can’t be reached right now.`
        : null,
  };
}
