import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devHostFrom, loadConfig } from '../src/config';
import { type PromptResult, preflight, type SignInDeps, signIn } from '../src/auth/sign-in';

const config = {
  keycloakUrl: 'http://192.168.1.20:8180',
  realm: 'ai-job-assistant',
  apiUrl: 'http://192.168.1.20:3000/api/v1',
};
const ISSUER = 'http://192.168.1.20:8180/realms/ai-job-assistant';
const REDIRECT = 'exp://192.168.1.20:8081/--/auth/callback';

const discovery = (issuer = ISSUER) =>
  jest.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ issuer }) }),
  );

function deps(over: Partial<SignInDeps> = {}) {
  const d = {
    config,
    redirectUri: REDIRECT,
    fetchFn: discovery(),
    prompt: jest.fn((): Promise<PromptResult> =>
      Promise.resolve({ type: 'success', params: { code: 'auth-code-123', state: 's' } }),
    ),
    exchange: jest.fn(() =>
      Promise.resolve({ accessToken: 'access-xyz', refreshToken: 'refresh-xyz', expiresIn: 300 }),
    ),
    save: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
    verifyApi: jest.fn(() => Promise.resolve('ok' as const)),
    now: () => 1000,
    ...over,
  };
  return d;
}

const SECRETS = /auth-code-123|access-xyz|refresh-xyz|verifier/;

describe('sign-in flow', () => {
  it('signs in: browser → code exchange with the same redirect URI → secure save → API check', async () => {
    const d = deps();
    expect(await signIn(d)).toEqual({ kind: 'signed-in', warning: null });
    expect(d.fetchFn).toHaveBeenCalledWith(
      `${ISSUER}/.well-known/openid-configuration`,
      expect.anything(),
    );
    expect(d.exchange).toHaveBeenCalledWith('auth-code-123', REDIRECT);
    expect(d.save).toHaveBeenCalledWith({
      accessToken: 'access-xyz',
      refreshToken: 'refresh-xyz',
      idToken: null,
      expiresAt: 301_000,
    });
    expect(d.verifyApi).toHaveBeenCalled();
  });

  it('does not open the browser when Keycloak can’t be reached (e.g. an emulator-only address)', async () => {
    const d = deps({
      fetchFn: jest.fn(() => Promise.reject(new TypeError('Network request failed'))),
    });
    const outcome = await signIn(d);
    expect(outcome).toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(
        /Can’t reach the sign-in server at http:\/\/192\.168\.1\.20:8180/,
      ),
    });
    expect(d.prompt).not.toHaveBeenCalled();
  });

  it('detects a Keycloak configured for another hostname (e.g. localhost) before opening the browser', async () => {
    const d = deps({ fetchFn: discovery('http://localhost:8180/realms/ai-job-assistant') });
    const outcome = await signIn(d);
    expect(outcome).toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(/configured for http:\/\/localhost:8180/),
    });
    expect(d.prompt).not.toHaveBeenCalled();
    expect(
      await preflight({
        config,
        fetchFn: jest.fn(() =>
          Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }),
        ),
      }),
    ).toMatch(/realm was not found/);
  });

  it('treats closing the browser as a cancellation, without an error', async () => {
    for (const type of ['cancel', 'dismiss'] as const) {
      const d = deps({ prompt: jest.fn(() => Promise.resolve({ type } as PromptResult)) });
      expect(await signIn(d)).toEqual({ kind: 'cancelled' });
      expect(d.exchange).not.toHaveBeenCalled();
      expect(d.save).not.toHaveBeenCalled();
    }
  });

  it('reports authorization errors and invalid callbacks without exchanging anything', async () => {
    const cases: [PromptResult, RegExp][] = [
      [{ type: 'error', params: { error: 'access_denied' } }, /cancelled or access was denied/],
      [
        { type: 'error', params: { error: 'state_mismatch' } },
        /did not match this sign-in attempt/,
      ],
      [{ type: 'error', params: { error: 'invalid_request' } }, /redirect URI/],
      [{ type: 'error', params: { error: 'weird<script>' } }, /Sign-in failed \(weirdscript\)/],
      [{ type: 'success', params: {} }, /did not return to the app correctly/],
      [{ type: 'locked' }, /already in progress/],
    ];
    for (const [result, message] of cases) {
      const d = deps({ prompt: jest.fn(() => Promise.resolve(result)) });
      expect(await signIn(d)).toMatchObject({
        kind: 'failed',
        message: expect.stringMatching(message),
      });
      expect(d.exchange).not.toHaveBeenCalled();
    }
  });

  it('saves nothing when the code exchange fails, and never leaks codes or tokens', async () => {
    const d = deps({
      exchange: jest.fn(() =>
        Promise.reject(new Error('invalid_grant: code auth-code-123 verifier abc')),
      ),
    });
    const outcome = await signIn(d);
    expect(outcome).toMatchObject({ kind: 'failed' });
    expect(JSON.stringify(outcome)).not.toMatch(SECRETS);
    expect(d.save).not.toHaveBeenCalled();
  });

  it('clears the session when the API rejects the token, and warns when the API is unreachable', async () => {
    const rejected = deps({ verifyApi: jest.fn(() => Promise.resolve('rejected' as const)) });
    expect(await signIn(rejected)).toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(/KEYCLOAK_MOBILE_CLIENT_ID/),
    });
    expect(rejected.clear).toHaveBeenCalled();
    const offline = deps({ verifyApi: jest.fn(() => Promise.resolve('unreachable' as const)) });
    expect(await signIn(offline)).toEqual({
      kind: 'signed-in',
      warning: expect.stringMatching(/can’t be reached/),
    });
  });
});

describe('mobile configuration', () => {
  it('defaults to the computer serving the app, so a physical phone can reach it', () => {
    expect(devHostFrom('192.168.1.20:8081')).toBe('192.168.1.20');
    expect(devHostFrom('exp://192.168.1.20:8081/--/')).toBe('192.168.1.20');
    expect(devHostFrom(undefined)).toBeNull();
    expect(loadConfig({}, '192.168.1.20')).toMatchObject({
      apiUrl: 'http://192.168.1.20:3000/api/v1',
      keycloakUrl: 'http://192.168.1.20:8180',
    });
    // Explicit settings always win.
    expect(
      loadConfig({ EXPO_PUBLIC_KEYCLOAK_URL: 'https://auth.example.test' }, '192.168.1.20')
        .keycloakUrl,
    ).toBe('https://auth.example.test');
  });

  it('references every EXPO_PUBLIC_* variable literally, so Expo inlines it into the app', () => {
    const source = readFileSync(join(__dirname, '../src/config.ts'), 'utf8');
    for (const name of [
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_KEYCLOAK_URL',
      'EXPO_PUBLIC_KEYCLOAK_REALM',
      'EXPO_PUBLIC_KEYCLOAK_CLIENT_ID',
    ]) {
      expect(source).toContain(`process.env.${name}`);
    }
    expect(source).not.toMatch(/=\s*process\.env\s*[,)]/);
  });
});
