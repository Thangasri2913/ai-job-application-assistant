import type { OidcEndpoints } from '../config';
import type { StoredTokens } from './token-store';

/** Refresh this long before expiry, so a request never leaves with an expiring token. */
export const EXPIRY_SKEW_MS = 30_000;

export interface TokenStoreLike {
  save(t: StoredTokens): Promise<void>;
  load(): Promise<StoredTokens | null>;
  clear(): Promise<void>;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface TokenEndpointResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

export function tokensFromResponse(
  r: TokenEndpointResponse,
  now: number,
  previous?: StoredTokens | null,
): StoredTokens {
  if (!r.access_token) throw new Error('The sign-in response had no access token.');
  return {
    accessToken: r.access_token,
    // Keycloak rotates refresh tokens; keep the old one only if no new one is sent.
    refreshToken: r.refresh_token ?? previous?.refreshToken ?? null,
    idToken: r.id_token ?? previous?.idToken ?? null,
    expiresAt: now + (r.expires_in ?? 60) * 1000,
  };
}

/**
 * Keeps the user's session: hands out a valid access token, refreshing it with the refresh
 * token when it is about to expire, and ends the session (clearing every token) when that
 * is no longer possible. Public client: no client secret is ever sent.
 */
export class Session {
  private refreshing: Promise<string | null> | null = null;

  constructor(
    private readonly endpoints: OidcEndpoints,
    private readonly clientId: string,
    private readonly store: TokenStoreLike,
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
    private readonly now: () => number = () => Date.now(),
    /** Called once when the session can't be renewed (the UI returns to sign-in). */
    private readonly onExpired: () => void = () => undefined,
  ) {}

  async accessToken(): Promise<string | null> {
    const tokens = await this.store.load();
    if (!tokens) return null;
    if (tokens.expiresAt - EXPIRY_SKEW_MS > this.now()) return tokens.accessToken;
    return this.refresh();
  }

  /** Renews the access token (one refresh at a time). Null when the session has ended. */
  refresh(): Promise<string | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    const tokens = await this.store.load();
    await this.store.clear();
    if (!tokens?.refreshToken) return;
    // End the Keycloak session too; failures (e.g. offline) don't keep the user signed in.
    try {
      await this.fetchFn(this.endpoints.endSessionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ client_id: this.clientId, refresh_token: tokens.refreshToken }),
      });
    } catch {
      // Ignored: local tokens are already gone.
    }
  }

  private async doRefresh(): Promise<string | null> {
    const tokens = await this.store.load();
    if (!tokens?.refreshToken) return this.expire();
    let response;
    try {
      response = await this.fetchFn(this.endpoints.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          refresh_token: tokens.refreshToken,
        }),
      });
    } catch {
      // Offline: keep the tokens and let the caller show a connection error.
      throw new Error('offline');
    }
    if (!response.ok) return this.expire();
    const next = tokensFromResponse(
      (await response.json()) as TokenEndpointResponse,
      this.now(),
      tokens,
    );
    await this.store.save(next);
    return next.accessToken;
  }

  private async expire(): Promise<null> {
    await this.store.clear();
    this.onExpired();
    return null;
  }
}

const form = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
