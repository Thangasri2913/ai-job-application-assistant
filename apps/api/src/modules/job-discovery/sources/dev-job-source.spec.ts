import { normalizePosting } from '../pipeline/normalize.js';
import { DEV_JOB_FIXTURES } from './dev-job-fixtures.js';
import { DevJobSourceAdapter } from './dev-job-source.js';

const now = new Date('2026-10-11T00:00:00Z');
const adapter = new DevJobSourceAdapter(DEV_JOB_FIXTURES, () => now);
const criteria = {
  keywords: ['Frontend Developer'],
  locations: [],
  remotePreference: 'ANY' as const,
  employmentTypes: [],
  experienceLevel: null,
  limit: 50,
};

describe('DevJobSourceAdapter (development fixtures)', () => {
  it('is clearly a development source', () => {
    expect(adapter.descriptor).toMatchObject({
      key: 'dev',
      kind: 'DEVELOPMENT',
      isDevelopment: true,
    });
  });

  it('labels every fixture as sample data', () => {
    for (const f of DEV_JOB_FIXTURES) {
      expect(f.employer).toMatch(/\(sample\)$/);
      expect(f.body).toMatch(/^Sample posting \(development fixture\)/);
    }
    expect(new Set(DEV_JOB_FIXTURES.map((f) => f.ref)).size).toBe(DEV_JOB_FIXTURES.length);
  });

  it('searches, fetches details and normalises into the common shape', async () => {
    const results = await adapter.searchJobs(criteria, new AbortController().signal);
    expect(results.length).toBeGreaterThan(0);
    const raw = (await adapter.getJobDetails('sample-fe-angular-remote'))!;
    const posting = adapter.normalizeJob(raw);
    expect(posting).toMatchObject({
      externalId: 'sample-fe-angular-remote',
      location: 'Remote',
      workMode: 'REMOTE',
      employmentType: 'FULL_TIME',
      seniority: 'SENIOR',
      sourceUrl: 'https://example.com/dev-job-source/sample-fe-angular-remote',
    });
    expect(posting.postedAt!.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(() => normalizePosting(posting)).not.toThrow();
    expect(await adapter.getJobDetails('missing')).toBeNull();
  });
});
