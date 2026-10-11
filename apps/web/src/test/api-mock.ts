import { vi } from 'vitest';

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Reply = { status?: number; body?: unknown } | undefined;
type Handler = (call: Call) => Reply;

/**
 * Stateful fetch stub for page tests: handlers keyed by "METHOD /path" (path without
 * the /api/v1 prefix, including any query string) can be called any number of times.
 */
export function mockApi(handlers: Record<string, Handler | Reply>) {
  const calls: Call[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const path = `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body;
    const call = { method, path, body };
    calls.push(call);
    const handler = handlers[`${method} ${path}`];
    if (handler === undefined) {
      return new Response(
        JSON.stringify({ code: 'NOT_FOUND', message: `No mock for ${method} ${path}` }),
        { status: 404 },
      );
    }
    const reply = typeof handler === 'function' ? handler(call) : handler;
    const status = reply?.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply?.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', spy);
  return {
    calls,
    find: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}
