import type { Fetch } from './http.js';

export interface FakeResponse {
  status?: number;
  body?: unknown;
  throws?: boolean;
}

/**
 * A deterministic fetch for adapter tests: answers by URL prefix (first match wins) and
 * records every requested URL. No network is ever used.
 */
export function fakeFetch(routes: [prefix: string, response: FakeResponse][]) {
  const calls: string[] = [];
  const fn = vi.fn<Fetch>((url) => {
    calls.push(url);
    const route = routes.find(([prefix]) => url.startsWith(prefix));
    if (!route) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    const r = route[1];
    if (r.throws) return Promise.reject(new Error(`network error for ${url}`));
    const status = r.status ?? 200;
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(r.body) });
  });
  return { fn, calls };
}

export const testSignal = () => new AbortController().signal;

export const testCriteria = {
  keywords: ['Frontend Developer'],
  locations: [] as string[],
  remotePreference: 'ANY' as const,
  employmentTypes: [],
  experienceLevel: null,
  limit: 50,
};
