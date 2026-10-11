/**
 * Bridge between the OIDC session (React) and the non-React API client. The session
 * provider registers how to read and renew the access token; the client never stores it.
 */
interface TokenSource {
  /** Async so it can read the OIDC store directly — no race with React effects. */
  getAccessToken: () => Promise<string | null>;
  /** Silently renews the session (refresh token). Resolves to the new token or null. */
  renew: () => Promise<string | null>;
  /** Called when the session cannot be recovered (renewal failed). */
  onSessionExpired: () => void;
}

let source: TokenSource = {
  getAccessToken: () => Promise.resolve(null),
  renew: () => Promise.resolve(null),
  onSessionExpired: () => undefined,
};

export const tokenSource = {
  register(next: TokenSource): void {
    source = next;
  },
  getAccessToken: () => source.getAccessToken(),
  renew: () => source.renew(),
  sessionExpired: () => source.onSessionExpired(),
};

let renewing: Promise<string | null> | null = null;

/** Renews at most once at a time; concurrent 401s share the same renewal. */
export function renewAccessToken(): Promise<string | null> {
  renewing ??= tokenSource
    .renew()
    .catch(() => null)
    .finally(() => {
      renewing = null;
    });
  return renewing;
}
