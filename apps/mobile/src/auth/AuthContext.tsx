import {
  AuthRequest,
  CodeChallengeMethod,
  exchangeCodeAsync,
  ResponseType,
} from 'expo-auth-session';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, type ApiClient, createApiClient } from '../api/client';
import { devHostFrom, loadConfig, OIDC_SCOPES, oidcEndpoints } from '../config';
import { redirectUri as runtimeRedirectUri } from './redirect';
import { Session } from './session';
import { signIn as runSignIn } from './sign-in';
import { tokenStore } from './token-store';

WebBrowser.maybeCompleteAuthSession();

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  /** Why the user was signed out (e.g. the session expired), shown on the sign-in screen. */
  notice: string | null;
  error: string | null;
  /** A sign-in is in progress (the button is disabled meanwhile). */
  busy: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  api: ApiClient;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Sign-in with the existing Keycloak realm through the system browser: OAuth 2.0
 * Authorization Code flow with PKCE (S256), public client, no secret. Tokens go to secure
 * storage only.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const config = useMemo(
    () => loadConfig(undefined, devHostFrom(Constants.expoConfig?.hostUri)),
    [],
  );
  const endpoints = useMemo(() => oidcEndpoints(config), [config]);
  const [status, setStatus] = useState<Status>('loading');
  const statusRef = useRef<Status>('loading');
  statusRef.current = status;
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inProgress = useRef(false);

  const session = useMemo(
    () =>
      new Session(endpoints, config.clientId, tokenStore, undefined, undefined, () => {
        setNotice('Your session has ended. Please sign in again.');
        setStatus('signedOut');
      }),
    [endpoints, config.clientId],
  );
  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiUrl,
        getToken: () => session.accessToken(),
        refreshToken: () => session.refresh(),
        // A request found the session over (e.g. tokens revoked): back to sign-in, with a reason.
        onUnauthorized: () => {
          if (statusRef.current !== 'signedIn') return;
          void tokenStore.clear();
          setNotice('Your session has ended. Please sign in again.');
          setStatus('signedOut');
        },
      }),
    [config.apiUrl, session],
  );

  useEffect(() => {
    void tokenStore
      .load()
      .then((t) => setStatus(t ? 'signedIn' : 'signedOut'))
      .catch(() => setStatus('signedOut'));
  }, []);

  const signIn = useCallback(async () => {
    if (inProgress.current) return; // repeated taps start only one sign-in
    inProgress.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    // The exact URI for this runtime, used for both the request and the code exchange.
    const redirectUri = runtimeRedirectUri();
    const request = new AuthRequest({
      clientId: config.clientId,
      redirectUri,
      scopes: OIDC_SCOPES,
      responseType: ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: CodeChallengeMethod.S256,
    });
    try {
      const outcome = await runSignIn({
        config,
        redirectUri,
        fetchFn: (url, init) => fetch(url, init),
        prompt: async () => {
          const r = await request.promptAsync(endpoints);
          return r.type === 'success' || r.type === 'error'
            ? { type: r.type, params: r.params }
            : { type: r.type };
        },
        exchange: (code, uri) =>
          exchangeCodeAsync(
            {
              clientId: config.clientId,
              code,
              redirectUri: uri,
              // The verifier generated for this request (PKCE S256); never logged or stored.
              extraParams: { code_verifier: request.codeVerifier ?? '' },
            },
            endpoints,
          ),
        save: (t) => tokenStore.save(t),
        clear: () => tokenStore.clear(),
        verifyApi: async () => {
          try {
            await api.me();
            return 'ok';
          } catch (e) {
            return e instanceof ApiError && e.kind === 'unauthorized' ? 'rejected' : 'unreachable';
          }
        },
      });
      if (outcome.kind === 'signed-in') {
        setNotice(outcome.warning);
        setStatus('signedIn');
      } else if (outcome.kind === 'cancelled') {
        setNotice('Sign-in was cancelled.');
      } else {
        setError(outcome.message);
      }
    } finally {
      inProgress.current = false;
      setBusy(false);
    }
  }, [config, endpoints, api]);

  const signOut = useCallback(async () => {
    await session.signOut();
    setStatus('signedOut');
  }, [session]);

  const value = useMemo(
    () => ({ status, notice, error, busy, signIn, signOut, api }),
    [status, notice, error, busy, signIn, signOut, api],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** For tests and previews: provide a ready-made auth value. */
export const AuthTestProvider = AuthContext.Provider;
