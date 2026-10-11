import { mockApi } from '../../test/api-mock';
import { tokenSource } from '../auth/token-source';
import { ApiError } from './api-error';
import { apiRequest } from './http';

function useToken(
  token: string | null,
  renew: () => Promise<string | null> = () => Promise.resolve(null),
) {
  const onSessionExpired = vi.fn();
  tokenSource.register({ getAccessToken: () => Promise.resolve(token), renew, onSessionExpired });
  return { onSessionExpired };
}

describe('apiRequest', () => {
  it('sends the Keycloak access token as a Bearer token', async () => {
    useToken('kc-access-token');
    const api = mockApi({ 'GET /auth/me': { body: { ok: true } } });
    await apiRequest('/auth/me');
    expect(api.calls).toHaveLength(1);
    const headers = new Headers((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer kc-access-token');
  });

  it('sends no Authorization header without a session', async () => {
    useToken(null);
    mockApi({ 'GET /health': { body: { status: 'ok' } } });
    await apiRequest('/health');
    const headers = new Headers((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('renews the token once on 401 and retries', async () => {
    const renew = vi.fn(() => Promise.resolve('renewed-token'));
    useToken('expired-token', renew);
    let call = 0;
    mockApi({
      'GET /profile': () =>
        ++call === 1
          ? { status: 401, body: { code: 'TOKEN_EXPIRED', message: 'expired' } }
          : { body: { ok: true } },
    });

    await expect(apiRequest('/profile')).resolves.toEqual({ ok: true });
    expect(renew).toHaveBeenCalledTimes(1);
    const retryHeaders = new Headers((vi.mocked(fetch).mock.calls[1]![1] as RequestInit).headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer renewed-token');
  });

  it('ends the session when renewal fails', async () => {
    const { onSessionExpired } = useToken('expired-token');
    mockApi({
      'GET /profile': {
        status: 401,
        body: { code: 'TOKEN_EXPIRED', message: 'Your session has expired.' },
      },
    });

    await expect(apiRequest('/profile')).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_EXPIRED',
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('shares one renewal between concurrent 401s', async () => {
    const renew = vi.fn(
      () => new Promise<string | null>((resolve) => setTimeout(() => resolve('renewed'), 10)),
    );
    useToken('expired', renew);
    const seen = new Map<string, number>();
    mockApi({
      'GET /a': () =>
        seen.set('a', (seen.get('a') ?? 0) + 1).get('a') === 1 ? { status: 401 } : { body: 'a' },
      'GET /b': () =>
        seen.set('b', (seen.get('b') ?? 0) + 1).get('b') === 1 ? { status: 401 } : { body: 'b' },
    });
    await expect(Promise.all([apiRequest('/a'), apiRequest('/b')])).resolves.toEqual(['a', 'b']);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('does not renew on 403 and surfaces the server message', async () => {
    const renew = vi.fn(() => Promise.resolve('x'));
    useToken('token', renew);
    mockApi({
      'GET /auth/me': {
        status: 403,
        body: { code: 'ACCOUNT_DISABLED', message: 'This account has been disabled.' },
      },
    });
    const error = await apiRequest('/auth/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, message: 'This account has been disabled.' });
    expect(renew).not.toHaveBeenCalled();
  });

  it('reports network failures with a friendly message', async () => {
    useToken('token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiRequest('/auth/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
