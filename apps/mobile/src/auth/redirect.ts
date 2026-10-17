import Constants, { ExecutionEnvironment } from 'expo-constants';
import { makeRedirectUri } from 'expo-auth-session';

/** The callback registered for development and release builds (app.json "scheme"). */
export const NATIVE_REDIRECT_URI = 'jobassist://auth/callback';

export type Runtime = 'expo-go' | 'native-build';

export function currentRuntime(): Runtime {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? 'expo-go'
    : 'native-build';
}

/**
 * The redirect URI for the runtime the app is actually in. Expo Go can't register the app's
 * own `jobassist://` scheme, so there the callback is Expo Go's `exp://<computer>:8081/--/auth/
 * callback` (expo-linking resolves it from the dev server's address). A development or release
 * build uses `jobassist://auth/callback`. The same value must be used for the authorization
 * request and the code exchange, and must be allowed by the Keycloak client.
 */
export function redirectUri(): string {
  return makeRedirectUri({
    scheme: 'jobassist',
    path: 'auth/callback',
    native: NATIVE_REDIRECT_URI,
  });
}
