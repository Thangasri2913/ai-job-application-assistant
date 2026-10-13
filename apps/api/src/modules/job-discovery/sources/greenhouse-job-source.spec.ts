import { type GreenhouseJob, GreenhouseJobSourceAdapter } from './greenhouse-job-source.js';
import { JobSourceError } from './job-source-adapter.js';
import { fakeFetch, testCriteria, testSignal } from './test-fetch.fixture.js';

// Responses shaped like the Greenhouse Job Board API (content=true); no network is used.
const job = (id: number, over: Partial<GreenhouseJob> = {}): GreenhouseJob => ({
  id,
  title: 'Frontend Engineer',
  absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  location: { name: 'Bengaluru, India' },
  updated_at: '2026-10-11T09:00:00-04:00',
  first_published: '2026-10-01T09:00:00-04:00',
  content: '&lt;p&gt;We use &lt;strong&gt;Angular&lt;/strong&gt; &amp;amp; RxJS.&lt;/p&gt;',
  ...over,
});

const BASE = 'https://boards-api.greenhouse.io/v1/boards';

describe('GreenhouseJobSourceAdapter', () => {
  it('reads only the configured boards and keeps titles matching the search', async () => {
    const { fn, calls } = fakeFetch([
      [`${BASE}/acme/jobs`, { body: { jobs: [job(1), job(2, { title: 'Accountant' })] } }],
      [`${BASE}/acme`, { body: { name: 'Acme Corp' } }],
      [`${BASE}/globex/jobs`, { body: { jobs: [job(3, { title: 'Senior Front-end Engineer' })] } }],
    ]);
    const adapter = new GreenhouseJobSourceAdapter(
      { boards: [{ id: 'acme' }, { id: 'globex', name: 'Globex' }] },
      fn,
    );
    expect(adapter.descriptor).toMatchObject({
      key: 'greenhouse',
      isDevelopment: false,
      postingOrigin: 'EMPLOYER',
    });
    const jobs = await adapter.searchJobs(
      { ...testCriteria, keywords: ['Frontend Engineer'] },
      testSignal(),
    );
    expect(jobs.map((j) => [j.id, j.board?.name])).toEqual([
      [1, 'Acme Corp'],
      [3, 'Globex'],
    ]);
    // The board name is read from the board itself only when not configured.
    expect(calls.sort()).toEqual([
      `${BASE}/acme`,
      `${BASE}/acme/jobs?content=true`,
      `${BASE}/globex/jobs?content=true`,
    ]);
    await adapter.searchJobs(testCriteria, testSignal());
    expect(calls).toHaveLength(3); // cached
  });

  it('normalises a job, decoding its escaped HTML, without inventing facts', () => {
    const adapter = new GreenhouseJobSourceAdapter({ boards: [{ id: 'acme' }] });
    const posting = adapter.normalizeJob({ ...job(5), board: { token: 'acme', name: 'Acme' } });
    expect(posting).toEqual({
      externalId: 'acme:5',
      title: 'Frontend Engineer',
      companyName: 'Acme',
      location: 'Bengaluru, India',
      workMode: null,
      employmentType: null,
      seniority: null,
      description: 'We use Angular & RxJS.',
      sourceUrl: 'https://boards.greenhouse.io/acme/jobs/5',
      postedAt: new Date('2026-10-01T13:00:00Z'),
      discoveredFrom: 'Greenhouse job board: acme',
    });
    const remote = adapter.normalizeJob({
      ...job(6, { location: { name: 'Remote - India' }, first_published: undefined }),
      board: { token: 'acme', name: 'Acme' },
    });
    expect(remote.workMode).toBe('REMOTE');
    expect(remote.postedAt).toBeNull(); // updated_at is not used as a posting date
    expect(() => adapter.normalizeJob(job(7))).toThrow(); // no known employer name
  });

  it('skips a missing board but keeps the others', async () => {
    const { fn } = fakeFetch([
      [`${BASE}/gone`, { status: 404 }],
      [`${BASE}/acme/jobs`, { body: { jobs: [job(1)] } }],
    ]);
    const adapter = new GreenhouseJobSourceAdapter(
      {
        boards: [
          { id: 'gone', name: 'Gone' },
          { id: 'acme', name: 'Acme' },
        ],
      },
      fn,
    );
    const found = await adapter.searchJobs(
      { ...testCriteria, keywords: ['Frontend Engineer'] },
      testSignal(),
    );
    expect(found.map((j) => j.id)).toEqual([1]);
  });

  it('fails with a safe message when no board can be read', async () => {
    const { fn } = fakeFetch([[`${BASE}/gone`, { status: 404 }]]);
    const adapter = new GreenhouseJobSourceAdapter({ boards: [{ id: 'gone', name: 'G' }] }, fn);
    const error = await adapter.searchJobs(testCriteria, testSignal()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JobSourceError);
    expect((error as Error).message).toBe('The Greenhouse job board “gone” was not found.');
    expect(new GreenhouseJobSourceAdapter({ boards: [] }).isConfigured()).toBe(false);
  });
});
