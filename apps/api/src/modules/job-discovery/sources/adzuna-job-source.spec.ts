import { normalizePosting } from '../pipeline/normalize.js';
import {
  type AdzunaAd,
  AdzunaJobSourceAdapter,
  type AdzunaConfig,
  plainText,
} from './adzuna-job-source.js';
import { JobSourceError } from './job-source-adapter.js';

// Test responses shaped like Adzuna's documented search results (no network is used).
const ad = (id: number, over: Partial<AdzunaAd> = {}): AdzunaAd => ({
  id,
  title: 'Senior <strong>Frontend</strong> Developer',
  description:
    'We build dashboards with <strong>Angular</strong> &amp; TypeScript. Requirements: 3+ years …',
  created: '2026-10-10T08:00:00Z',
  redirect_url: `https://www.adzuna.in/details/${id}?utm_source=api`,
  location: { display_name: 'Bangalore, Karnataka', area: ['India', 'Karnataka', 'Bangalore'] },
  company: { display_name: 'Acme Software' },
  contract_time: 'full_time',
  ...over,
});

const config = (over: Partial<AdzunaConfig> = {}): AdzunaConfig => ({
  appId: 'test-app-id',
  appKey: 'test-app-key-SECRET',
  country: 'in',
  maxDaysOld: 30,
  dailyRequestLimit: 200,
  ...over,
});

const criteria = {
  keywords: ['Frontend Developer'],
  locations: ['Bangalore'],
  remotePreference: 'ANY' as const,
  employmentTypes: [],
  experienceLevel: null,
  limit: 50,
};

function fakeFetch(responses: { status?: number; body?: unknown; throws?: boolean }[]) {
  const calls: string[] = [];
  const fn = vi.fn((url: string, _init?: { headers: Record<string, string> }) => {
    calls.push(url);
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    if (r.throws) return Promise.reject(new Error(`network error for ${url}`));
    const status = r.status ?? 200;
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(r.body) });
  });
  return { fn, calls };
}

const signal = () => new AbortController().signal;

describe('AdzunaJobSourceAdapter', () => {
  it('is a real (non-development) API source with the required attribution', () => {
    const adapter = new AdzunaJobSourceAdapter(config());
    expect(adapter.descriptor).toMatchObject({
      key: 'adzuna',
      kind: 'API',
      isDevelopment: false,
      attribution: { label: 'Jobs by Adzuna', url: 'https://www.adzuna.in' },
    });
    expect(adapter.isConfigured()).toBe(true);
    expect(new AdzunaJobSourceAdapter(config({ appKey: undefined })).isConfigured()).toBe(false);
  });

  it('calls the documented search endpoint with the alert’s terms', async () => {
    const { fn, calls } = fakeFetch([{ body: { results: [ad(1), ad(2)], count: 2 } }]);
    const adapter = new AdzunaJobSourceAdapter(config(), fn);
    const ads = await adapter.searchJobs({ ...criteria, employmentTypes: ['FULL_TIME'] }, signal());
    expect(ads.map((a) => a.id)).toEqual([1, 2]);
    const url = new URL(calls[0]!);
    expect(url.origin + url.pathname).toBe('https://api.adzuna.com/v1/api/jobs/in/search/1');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      app_id: 'test-app-id',
      app_key: 'test-app-key-SECRET',
      results_per_page: '50',
      max_days_old: '30',
      sort_by: 'date',
      what: 'Frontend Developer',
      where: 'Bangalore',
      full_time: '1',
    });
    expect(fn.mock.calls[0]![1]).toMatchObject({ headers: { Accept: 'application/json' } });
  });

  it('searches each keyword × location (at most 4 requests) and de-duplicates ads', async () => {
    const { fn } = fakeFetch([
      { body: { results: [ad(1), ad(2)] } },
      { body: { results: [ad(2), ad(3)] } },
    ]);
    const adapter = new AdzunaJobSourceAdapter(config(), fn);
    const ads = await adapter.searchJobs(
      { ...criteria, keywords: ['Angular', 'React', 'Vue'], locations: ['Bangalore', 'Chennai'] },
      signal(),
    );
    expect(fn).toHaveBeenCalledTimes(4);
    expect(ads.map((a) => a.id)).toEqual([1, 2, 3]);
  });

  it('normalises an ad into the common shape without inventing facts', () => {
    const adapter = new AdzunaJobSourceAdapter(config());
    const posting = adapter.normalizeJob(ad(42));
    expect(posting).toEqual({
      externalId: '42',
      title: 'Senior Frontend Developer',
      companyName: 'Acme Software',
      location: 'Bangalore, Karnataka',
      workMode: null,
      employmentType: 'FULL_TIME',
      seniority: null,
      description: 'We build dashboards with Angular & TypeScript. Requirements: 3+ years …',
      sourceUrl: 'https://www.adzuna.in/details/42?utm_source=api',
      postedAt: new Date('2026-10-10T08:00:00Z'),
      discoveredFrom: 'Adzuna search API (IN)',
    });
    // The shared pipeline then infers seniority and skills from the real text.
    const normalized = normalizePosting(posting);
    expect(normalized.seniority).toBe('SENIOR');
    expect(normalized.skills).toEqual(expect.arrayContaining(['Angular', 'TypeScript']));
    expect(adapter.normalizeJob(ad(1, { title: 'Remote React Engineer' })).workMode).toBe('REMOTE');
    expect(adapter.normalizeJob(ad(1, { contract_type: 'contract' })).employmentType).toBe(
      'CONTRACT',
    );
    expect(
      adapter.normalizeJob(ad(1, { full_description: 'Full text with <b>Docker</b>' })).description,
    ).toBe('Full text with Docker');
  });

  it('skips ads without a company or title instead of inventing one', () => {
    const adapter = new AdzunaJobSourceAdapter(config());
    expect(() => adapter.normalizeJob(ad(1, { company: undefined }))).toThrow();
    expect(() => adapter.normalizeJob(ad(1, { title: '  ' }))).toThrow();
  });

  it('reports failures with safe messages that never contain the credentials', async () => {
    const cases: [{ status?: number; throws?: boolean; body?: unknown }, RegExp][] = [
      [{ status: 401 }, /rejected the API credentials/],
      [{ status: 429 }, /request limit was reached/],
      [{ status: 500 }, /returned an error \(HTTP 500\)/],
      [{ throws: true }, /could not be reached/],
      [{ body: { unexpected: true } }, /unexpected response/],
    ];
    for (const [response, message] of cases) {
      const adapter = new AdzunaJobSourceAdapter(config(), fakeFetch([response]).fn);
      const error = await adapter.searchJobs(criteria, signal()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(JobSourceError);
      expect((error as Error).message).toMatch(message);
      expect((error as Error).message).not.toMatch(/test-app-key-SECRET|test-app-id/);
    }
  });

  it('stays within the per-minute and daily request allowance', async () => {
    let now = 0;
    const { fn } = fakeFetch([{ body: { results: [] } }]);
    const daily = new AdzunaJobSourceAdapter(config({ dailyRequestLimit: 2 }), fn, () => now);
    await daily.searchJobs(criteria, signal());
    now += 120_000;
    await daily.searchJobs(criteria, signal());
    now += 120_000;
    await expect(daily.searchJobs(criteria, signal())).rejects.toThrow(
      /daily Adzuna request allowance/,
    );
    now += 24 * 60 * 60 * 1000;
    await expect(daily.searchJobs(criteria, signal())).resolves.toEqual([]); // a day later

    const minute = new AdzunaJobSourceAdapter(config(), fn, () => 0);
    for (let i = 0; i < 20; i++) await minute.searchJobs(criteria, signal());
    await expect(minute.searchJobs(criteria, signal())).rejects.toThrow(/in the last minute/);
  });

  it('refuses to search without credentials', async () => {
    const { fn } = fakeFetch([{ body: { results: [] } }]);
    const adapter = new AdzunaJobSourceAdapter(config({ appId: undefined }), fn);
    await expect(adapter.searchJobs(criteria, signal())).rejects.toThrow(/not configured/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('strips highlight markup and entities', () => {
    expect(plainText('<strong>Angular</strong> &amp; RxJS&nbsp;dev')).toBe('Angular & RxJS dev');
  });
});
