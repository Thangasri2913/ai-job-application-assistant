import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as SecureStore from 'expo-secure-store';
import { EXPIRY_SKEW_MS, Session, tokensFromResponse } from '../src/auth/session';
import { tokenStore, type StoredTokens } from '../src/auth/token-store';
import { loadConfig, OIDC_SCOPES, oidcEndpoints } from '../src/config';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    setItemAsync: jest.fn((k: string, v: string) => Promise.resolve(void store.set(k, v))),
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    deleteItemAsync: jest.fn((k: string) => Promise.resolve(void store.delete(k))),
  };
});

const endpoints = oidcEndpoints({ keycloakUrl: 'http://kc.test', realm: 'ai-job-assistant' });

describe('mobile authentication configuration', () => {
  it('uses the realm’s standard OIDC endpoints and a public client (no secret)', () => {
    const config = loadConfig({
      EXPO_PUBLIC_API_URL: 'https://api.example.test/api/v1/',
      EXPO_PUBLIC_KEYCLOAK_URL: 'https://auth.example.test',
      EXPO_PUBLIC_KEYCLOAK_REALM: 'ai-job-assistant',
      EXPO_PUBLIC_KEYCLOAK_CLIENT_ID: 'ai-job-assistant-mobile',
    });
    expect(config).toEqual({
      apiUrl: 'https://api.example.test/api/v1',
      keycloakUrl: 'https://auth.example.test',
      realm: 'ai-job-assistant',
      clientId: 'ai-job-assistant-mobile',
      scheme: 'jobassist',
    });
    expect(Object.keys(config).some((k) => /secret/i.test(k))).toBe(false);
    expect(oidcEndpoints(config).tokenEndpoint).toBe(
      'https://auth.example.test/realms/ai-job-assistant/protocol/openid-connect/token',
    );
    expect(OIDC_SCOPES).toEqual(['openid', 'profile', 'email']);
    expect(() => loadConfig({ EXPO_PUBLIC_API_URL: 'ftp://x' })).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('signs in with Authorization Code + PKCE (S256) and never embeds a client secret', () => {
    const source = readFileSync(join(__dirname, '../src/auth/AuthContext.tsx'), 'utf8');
    expect(source).toMatch(/usePKCE: true/);
    expect(source).toMatch(/CodeChallengeMethod\.S256/);
    expect(source).toMatch(/ResponseType\.Code/);
    for (const file of sourceFiles(join(__dirname, '../src'))) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/client_secret|clientSecret/);
      // Tokens never go to ordinary storage or logs.
      expect(text).not.toMatch(/from ['"]@react-native-async-storage/);
      expect(text).not.toMatch(/console\.(log|info|debug)/);
    }
  });
});

describe('token storage', () => {
  it('keeps tokens only in secure storage, one entry each, and clears them', async () => {
    const tokens: StoredTokens = {
      accessToken: 'a'.repeat(1800),
      refreshToken: 'r',
      idToken: null,
      expiresAt: 123,
    };
    await tokenStore.save(tokens);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'jobassist.access_token',
      tokens.accessToken,
      {
        keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
      },
    );
    expect(await tokenStore.load()).toEqual(tokens);
    await tokenStore.clear();
    expect(await tokenStore.load()).toBeNull();
  });
});

describe('session', () => {
  const memory = () => {
    let saved: StoredTokens | null = null;
    return {
      save: jest.fn((t: StoredTokens) => Promise.resolve(void (saved = t))),
      load: jest.fn(() => Promise.resolve(saved)),
      clear: jest.fn(() => Promise.resolve(void (saved = null))),
    };
  };
  const response = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

  it('returns a valid token without refreshing', async () => {
    const store = memory();
    await store.save({
      accessToken: 'a1',
      refreshToken: 'r1',
      idToken: null,
      expiresAt: 1_000_000,
    });
    const fetchFn = jest.fn();
    const session = new Session(endpoints, 'ai-job-assistant-mobile', store, fetchFn, () => 0);
    expect(await session.accessToken()).toBe('a1');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token once, with the public client id only', async () => {
    const store = memory();
    await store.save({
      accessToken: 'old',
      refreshToken: 'r1',
      idToken: 'id1',
      expiresAt: EXPIRY_SKEW_MS,
    });
    const fetchFn = jest.fn(() =>
      response(200, { access_token: 'new', refresh_token: 'r2', expires_in: 300 }),
    );
    const session = new Session(endpoints, 'ai-job-assistant-mobile', store, fetchFn, () => 1000);
    const [a, b] = await Promise.all([session.accessToken(), session.accessToken()]);
    expect([a, b]).toEqual(['new', 'new']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe(endpoints.tokenEndpoint);
    expect(init.body).toBe(
      'grant_type=refresh_token&client_id=ai-job-assistant-mobile&refresh_token=r1',
    );
    expect(await store.load()).toEqual({
      accessToken: 'new',
      refreshToken: 'r2',
      idToken: 'id1',
      expiresAt: 301_000,
    });
  });

  it('ends the session when the refresh token is rejected, and reports it once', async () => {
    const store = memory();
    await store.save({ accessToken: 'old', refreshToken: 'r1', idToken: null, expiresAt: 0 });
    const onExpired = jest.fn();
    const session = new Session(
      endpoints,
      'c',
      store,
      () => response(400, { error: 'invalid_grant' }),
      () => 1000,
      onExpired,
    );
    expect(await session.accessToken()).toBeNull();
    expect(await store.load()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('keeps the tokens when offline (the caller shows a connection error)', async () => {
    const store = memory();
    await store.save({ accessToken: 'old', refreshToken: 'r1', idToken: null, expiresAt: 0 });
    const session = new Session(
      endpoints,
      'c',
      store,
      () => Promise.reject(new Error('Network request failed')),
      () => 1000,
    );
    await expect(session.accessToken()).rejects.toThrow('offline');
    expect(await store.load()).not.toBeNull();
  });

  it('signs out locally even if Keycloak can’t be reached', async () => {
    const store = memory();
    await store.save({ accessToken: 'a', refreshToken: 'r1', idToken: null, expiresAt: 0 });
    const session = new Session(endpoints, 'c', store, () => Promise.reject(new Error('offline')));
    await session.signOut();
    expect(await store.load()).toBeNull();
  });

  it('requires an access token in the token response', () => {
    expect(() => tokensFromResponse({}, 0)).toThrow(/no access token/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}
