/**
 * Public configuration, compiled into the app from EXPO_PUBLIC_* variables (see .env.example).
 * There are no secrets here: the app is a public OAuth client (Authorization Code + PKCE).
 */
export interface MobileConfig {
  apiUrl: string;
  keycloakUrl: string;
  realm: string;
  clientId: string;
  /** Custom URL scheme Keycloak redirects back to (app.json "scheme"). */
  scheme: string;
}

export interface OidcEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string;
  endSessionEndpoint: string;
}

/**
 * Expo inlines EXPO_PUBLIC_* values only where they are written out literally as
 * `process.env.EXPO_PUBLIC_…`; reading them from the `process.env` object at runtime yields
 * nothing in the app. So every variable is referenced explicitly here.
 */
export const PUBLIC_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_KEYCLOAK_URL: process.env.EXPO_PUBLIC_KEYCLOAK_URL,
  EXPO_PUBLIC_KEYCLOAK_REALM: process.env.EXPO_PUBLIC_KEYCLOAK_REALM,
  EXPO_PUBLIC_KEYCLOAK_CLIENT_ID: process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID,
};

const trimSlash = (s: string) => s.replace(/\/+$/, '');

/**
 * The development computer's address as the device sees it: the host Metro serves the app
 * from (e.g. "192.168.1.20:8081" → "192.168.1.20"). Works on a physical phone over Wi-Fi and
 * on the emulator; null in release builds (no Metro).
 */
export function devHostFrom(hostUri: string | null | undefined): string | null {
  if (!hostUri) return null;
  const host = hostUri
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]!
    .replace(/:\d+$/, '');
  return host || null;
}

/**
 * Reads and validates the configuration. EXPO_PUBLIC_* values win; otherwise, during
 * development, the API and Keycloak are assumed to run on the computer serving the app.
 * (The old fixed default, 10.0.2.2, only exists inside the Android emulator: on a phone the
 * sign-in page could never load.)
 */
export function loadConfig(
  env: Record<string, string | undefined> = PUBLIC_ENV,
  devHost: string | null = null,
): MobileConfig {
  const host = devHost ?? '10.0.2.2';
  const config: MobileConfig = {
    apiUrl: trimSlash(env.EXPO_PUBLIC_API_URL || `http://${host}:3000/api/v1`),
    keycloakUrl: trimSlash(env.EXPO_PUBLIC_KEYCLOAK_URL || `http://${host}:8180`),
    realm: env.EXPO_PUBLIC_KEYCLOAK_REALM || 'ai-job-assistant',
    clientId: env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID || 'ai-job-assistant-mobile',
    scheme: 'jobassist',
  };
  for (const [key, value] of [
    ['EXPO_PUBLIC_API_URL', config.apiUrl],
    ['EXPO_PUBLIC_KEYCLOAK_URL', config.keycloakUrl],
  ] as const) {
    if (!/^https?:\/\//.test(value)) throw new Error(`${key} must be an http(s) URL.`);
  }
  return config;
}

/** The issuer Keycloak must report for this configuration (tokens carry it as `iss`). */
export const expectedIssuer = (c: Pick<MobileConfig, 'keycloakUrl' | 'realm'>) =>
  `${c.keycloakUrl}/realms/${encodeURIComponent(c.realm)}`;

/** Keycloak's standard OpenID Connect endpoints for the realm. */
export function oidcEndpoints(c: Pick<MobileConfig, 'keycloakUrl' | 'realm'>): OidcEndpoints {
  const base = `${c.keycloakUrl}/realms/${encodeURIComponent(c.realm)}/protocol/openid-connect`;
  return {
    authorizationEndpoint: `${base}/auth`,
    tokenEndpoint: `${base}/token`,
    revocationEndpoint: `${base}/revoke`,
    endSessionEndpoint: `${base}/logout`,
  };
}

/** Scopes requested at sign-in. No offline_access: the session ends with the Keycloak session. */
export const OIDC_SCOPES = ['openid', 'profile', 'email'];
