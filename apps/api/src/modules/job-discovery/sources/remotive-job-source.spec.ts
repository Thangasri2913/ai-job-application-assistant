import { normalizePosting } from '../pipeline/normalize.js';
import { JobSourceError } from './job-source-adapter.js';
import { type RemotiveJob, RemotiveJobSourceAdapter } from './remotive-job-source.js';
import { fakeFetch, testCriteria, testSignal } from './test-fetch.fixture.js';

// Responses shaped like Remotive's documented /api/remote-jobs output (no network is used).
const job = (id: number, over: Partial<RemotiveJob> = {}): RemotiveJob => ({
  id,
  url: `https://remotive.com/remote-jobs/software-dev/frontend-developer-${id}`,
  title: 'Senior Frontend Developer',
  company_name: 'Remote Co',
  category: 'Software Development',
  job_type: 'full_time',
  publication_date: '2026-10-09T10:00:00',
  candidate_required_location: 'Worldwide',
  salary: '',
  description: '<p>Build UIs with <b>React</b> and TypeScript.</p><ul><li>3+ years</li></ul>',
  ...over,
});

const FEED = 'https://remotive.com/api/remote-jobs';
const feed = (jobs: RemotiveJob[]) => ({ body: { 'job-count': jobs.length, jobs } });

describe('RemotiveJobSourceAdapter', () => {
  it('is a real remote-jobs source that credits and links back to Remotive', () => {
    const adapter = new RemotiveJobSourceAdapter({ dailyRequestLimit: 4 });
    expect(adapter.descriptor).toMatchObject({
      key: 'remotive',
      isDevelopment: false,
      postingOrigin: 'AGGREGATOR',
      attribution: { label: 'Jobs from Remotive', url: 'https://remotive.com' },
    });
    expect(adapter.isConfigured()).toBe(true);
  });

  it('fetches the feed once and serves every search from the cache', async () => {
    let now = 0;
    const { fn, calls } = fakeFetch([
      [FEED, feed([job(1), job(2, { title: 'Backend Engineer (Go)' })])],
    ]);
    const adapter = new RemotiveJobSourceAdapter({ dailyRequestLimit: 4 }, fn, () => now);
    const first = await adapter.searchJobs(testCriteria, testSignal());
    expect(first.map((j) => j.id)).toEqual([1]); // only titles matching a keyword
    const backend = await adapter.searchJobs(
      { ...testCriteria, keywords: ['Backend Engineer'] },
      testSignal(),
    );
    expect(backend.map((j) => j.id)).toEqual([2]);
    expect(calls).toEqual([FEED]);
    now += 6 * 60 * 60 * 1000; // after the cache expires
    await adapter.searchJobs(testCriteria, testSignal());
    expect(calls).toHaveLength(2);
  });

  it('never exceeds the daily request allowance', async () => {
    let now = 0;
    const { fn } = fakeFetch([[FEED, feed([job(1)])]]);
    const adapter = new RemotiveJobSourceAdapter({ dailyRequestLimit: 2 }, fn, () => now);
    await adapter.searchJobs(testCriteria, testSignal());
    now += 6 * 60 * 60 * 1000;
    await adapter.searchJobs(testCriteria, testSignal());
    now += 6 * 60 * 60 * 1000;
    await expect(adapter.searchJobs(testCriteria, testSignal())).rejects.toThrow(
      /daily Remotive request allowance/,
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns nothing for on-site-only searches without calling Remotive', async () => {
    const { fn } = fakeFetch([[FEED, feed([job(1)])]]);
    const adapter = new RemotiveJobSourceAdapter({ dailyRequestLimit: 4 }, fn);
    expect(
      await adapter.searchJobs({ ...testCriteria, remotePreference: 'ONSITE' }, testSignal()),
    ).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('normalises a job without inventing facts', () => {
    const adapter = new RemotiveJobSourceAdapter({ dailyRequestLimit: 4 });
    const posting = adapter.normalizeJob(job(7));
    expect(posting).toEqual({
      externalId: '7',
      title: 'Senior Frontend Developer',
      companyName: 'Remote Co',
      location: 'Remote (Worldwide)',
      workMode: 'REMOTE',
      employmentType: 'FULL_TIME',
      seniority: null,
      description: 'Build UIs with React and TypeScript.\n- 3+ years',
      sourceUrl: 'https://remotive.com/remote-jobs/software-dev/frontend-developer-7',
      postedAt: new Date('2026-10-09T10:00:00'),
      discoveredFrom: 'Remotive public API',
    });
    expect(normalizePosting(posting).skills).toEqual(expect.arrayContaining(['React']));
    expect(adapter.normalizeJob(job(1, { job_type: 'other' })).employmentType).toBeNull();
    expect(adapter.normalizeJob(job(1, { candidate_required_location: '' })).location).toBe(
      'Remote',
    );
    expect(() => adapter.normalizeJob(job(1, { company_name: '' }))).toThrow();
  });

  it('reports failures with safe messages and retries after a failure', async () => {
    for (const [response, message] of [
      [{ throws: true }, /could not be reached/],
      [{ status: 429 }, /request limit was reached/],
      [{ status: 500 }, /HTTP 500/],
      [{ body: { nope: 1 } }, /unexpected response/],
    ] as const) {
      const { fn } = fakeFetch([[FEED, response]]);
      const adapter = new RemotiveJobSourceAdapter({ dailyRequestLimit: 4 }, fn);
      const error = await adapter.searchJobs(testCriteria, testSignal()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(JobSourceError);
      expect((error as Error).message).toMatch(message);
      expect((error as Error).message).not.toContain('https://');
      await adapter.searchJobs(testCriteria, testSignal()).catch(() => undefined);
      expect(fn).toHaveBeenCalledTimes(2); // failures are not cached
    }
  });
});
