import { type UserManagerSettings, WebStorageStateStore } from 'oidc-client-ts';

export const CALLBACK_PATH = '/auth/callback';

/**
 * OIDC Authorization Code Flow with PKCE against the Keycloak realm. Only public values:
 * the web client is a public client and has no secret.
 */
export function oidcSettings(origin = window.location.origin): UserManagerSettings {
  const { VITE_KEYCLOAK_URL, VITE_KEYCLOAK_REALM, VITE_KEYCLOAK_CLIENT_ID } = import.meta.env;
  return {
    authority: `${VITE_KEYCLOAK_URL}/realms/${VITE_KEYCLOAK_REALM}`,
    client_id: VITE_KEYCLOAK_CLIENT_ID,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}/login`,
    response_type: 'code',
    scope: 'openid profile email',
    // Tokens live in sessionStorage (per tab, cleared with the tab) — never localStorage.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
    monitorSession: false,
    loadUserInfo: false,
  };
}
