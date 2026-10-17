import { createApiClient, OFFLINE_MESSAGE, SESSION_EXPIRED_MESSAGE } from '../src/api/client';

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

function client(
  responses: (() => Promise<Response>)[],
  token: string | null = 't1',
  renewed: string | null = 't2',
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = jest.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responses[Math.min(calls.length - 1, responses.length - 1)]!();
  }) as unknown as typeof fetch;
  const refreshToken = jest.fn(() => Promise.resolve(renewed));
  const api = createApiClient({
    baseUrl: 'https://api.test/api/v1',
    getToken: () => Promise.resolve(token),
    refreshToken,
    fetchFn,
  });
  return { api, calls, refreshToken };
}

describe('mobile API client', () => {
  it('sends the access token as a Bearer token to the existing API', async () => {
    const { api, calls } = client([
      () => json(200, { items: [], total: 0, page: 1, pageSize: 20 }),
    ]);
    await api.applications();
    expect(calls[0]!.url).toBe(
      'https://api.test/api/v1/smart-apply/applications?page=1&pageSize=20',
    );
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe('Bearer t1');
  });

  it('renews the token once after a 401 and retries', async () => {
    const { api, calls, refreshToken } = client([() => json(401, {}), () => json(200, [])]);
    await expect(api.questions()).resolves.toEqual([]);
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(new Headers(calls[1]!.init.headers).get('Authorization')).toBe('Bearer t2');
  });

  it('reports an ended session clearly', async () => {
    const { api } = client([() => json(401, {})], 't1', null);
    await expect(api.questions()).rejects.toMatchObject({
      kind: 'unauthorized',
      message: SESSION_EXPIRED_MESSAGE,
    });
    const signedOut = client([() => json(200, [])], null);
    await expect(signedOut.api.questions()).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('reports offline and server errors with safe messages', async () => {
    const offline = client([() => Promise.reject(new TypeError('Network request failed'))]);
    await expect(offline.api.questions()).rejects.toMatchObject({
      kind: 'offline',
      // Names the server it tried, so a missing USB forward or wrong URL is easy to spot.
      message: `${OFFLINE_MESSAGE} (Tried api.test.)`,
    });
    const conflict = client([() => json(409, { message: 'Approve the application first.' })]);
    await expect(conflict.api.approve('sa1')).rejects.toMatchObject({
      status: 409,
      message: 'Approve the application first.',
    });
    const broken = client([() => Promise.resolve(new Response('oops', { status: 500 }))]);
    await expect(broken.api.questions()).rejects.toMatchObject({
      message: 'Something went wrong (HTTP 500). Please try again.',
    });
  });

  it('sends answers and user-reported submissions as JSON', async () => {
    const { api, calls } = client([() => json(200, {})]);
    await api.answer('sa1', 'q1', { answer: 'No', confirm: true, saveForReuse: false });
    await api.reportSubmitted('sa1', { confirm: true });
    expect(calls.map((c) => [c.init.method, c.url, c.init.body])).toEqual([
      [
        'PUT',
        'https://api.test/api/v1/smart-apply/applications/sa1/questions/q1/answer',
        '{"answer":"No","confirm":true,"saveForReuse":false}',
      ],
      [
        'POST',
        'https://api.test/api/v1/smart-apply/applications/sa1/manual-submission',
        '{"confirm":true}',
      ],
    ]);
  });
});
