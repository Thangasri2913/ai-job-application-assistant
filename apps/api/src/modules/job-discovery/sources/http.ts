import type { WorkMode } from '@job-assist/shared';
import { JobSourceError } from './job-source-adapter.js';

/** The subset of `fetch` adapters use; injectable so tests never touch the network. */
export type Fetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export const defaultFetch: Fetch = (url, init) => fetch(url, init);

/**
 * GETs JSON from a public endpoint. Failures become JobSourceErrors with safe messages: the
 * URL and the provider's raw output never reach logs or users.
 */
export async function getJson(
  fetchFn: Fetch,
  url: string,
  sourceName: string,
  signal: AbortSignal,
): Promise<{ status: number; body: unknown }> {
  let response;
  try {
    response = await fetchFn(url, { signal, headers: { Accept: 'application/json' } });
  } catch {
    throw new JobSourceError(
      `${sourceName} could not be reached. It will be tried again on the next run.`,
    );
  }
  if (response.status === 404) return { status: 404, body: null };
  if (response.status === 429) {
    throw new JobSourceError(
      `${sourceName}’s request limit was reached. It will be tried again later.`,
    );
  }
  if (!response.ok) {
    throw new JobSourceError(`${sourceName} returned an error (HTTP ${response.status}).`);
  }
  try {
    return { status: response.status, body: await response.json() };
  } catch {
    throw new JobSourceError(`${sourceName} returned an unexpected response.`);
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, e: string) => {
    if (e.startsWith('#x') || e.startsWith('#X')) return safeChar(parseInt(e.slice(2), 16));
    if (e.startsWith('#') && e !== '#39') return safeChar(parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? match;
  });
}

const safeChar = (code: number) =>
  Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';

/**
 * Readable plain text from provider HTML (Greenhouse escapes its HTML, so entities are
 * decoded first). Block elements become line breaks so requirement lists stay separate.
 */
export function htmlToText(html: string): string {
  return decodeEntities(decodeEntities(html))
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/ul|\/ol|\/tr)\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+(?=- )/g, '\n')
    .trim();
}

/** A source-wide response cache, so many alerts share one request within the TTL. */
export class TtlCache<T> {
  private readonly entries = new Map<string, { at: number; value: Promise<T> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number,
  ) {}

  /** Returns the cached value, or loads it (concurrent callers share one load). */
  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const value = load();
    this.entries.set(key, { at: this.now(), value });
    // A failed load is not cached: the next run tries again.
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }
}

/** Parses "a,b=Name,c" into [{ id: 'a' }, { id: 'b', name: 'Name' }, { id: 'c' }]. */
export function parseBoardList(value: string | undefined): { id: string; name?: string }[] {
  if (!value) return [];
  const boards: { id: string; name?: string }[] = [];
  for (const part of value.split(',')) {
    const [rawId, ...rest] = part.split('=');
    const id = rawId!.trim();
    const name = rest.join('=').trim();
    if (!id || boards.some((b) => b.id === id)) continue;
    boards.push(name ? { id, name } : { id });
  }
  return boards;
}

/**
 * Board sources return a company's whole board; only postings whose title matches one of the
 * search keywords (whole words, any order) are kept, so the shared pipeline sees relevant
 * postings first. The pipeline still applies the full alert criteria afterwards.
 */
export function titleMatchesAny(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/front[\s-]?end/g, 'frontend')
      .replace(/back[\s-]?end/g, 'backend')
      .replace(/full[\s-]?stack/g, 'fullstack');
  const words = new Set(
    norm(title)
      .split(/[^\p{L}\p{N}+#]+/u)
      .filter(Boolean),
  );
  return keywords.some((k) => {
    const parts = norm(k)
      .split(/[^\p{L}\p{N}+#]+/u)
      .filter(Boolean);
    return parts.length > 0 && parts.every((p) => words.has(p));
  });
}

/** Only an explicit "remote" or "hybrid" in the location counts; otherwise unknown. */
export function workModeFrom(location: string | null): WorkMode | null {
  if (!location) return null;
  if (/\bhybrid\b/i.test(location)) return 'HYBRID';
  if (/\bremote\b/i.test(location)) return 'REMOTE';
  return null;
}

/** Runs `fn` over items with at most `limit` in flight; never rejects. */
export async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]!) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
