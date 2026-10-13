import { JobSourceError } from './job-source-adapter.js';
import { type LeverPosting, LeverJobSourceAdapter } from './lever-job-source.js';
import { fakeFetch, testCriteria, testSignal } from './test-fetch.fixture.js';

// Responses shaped like Lever's Postings API (mode=json); no network is used.
const posting = (id: string, over: Partial<LeverPosting> = {}): LeverPosting => ({
  id,
  text: 'Frontend Developer',
  hostedUrl: `https://jobs.lever.co/initech/${id}`,
  applyUrl: `https://jobs.lever.co/initech/${id}/apply`,
  createdAt: 1_791_000_000_000,
  workplaceType: 'hybrid',
  categories: { location: 'Chennai', commitment: 'Full-time', team: 'Web' },
  descriptionPlain: 'Join our web team.',
  lists: [{ text: 'Requirements', content: '<li>React</li><li>TypeScript</li>' }],
  additionalPlain: 'We value learning.',
  ...over,
});

describe('LeverJobSourceAdapter', () => {
  it('reads the configured sites from the right data centre', async () => {
    const { fn, calls } = fakeFetch([
      [
        'https://api.eu.lever.co/v0/postings/initech',
        { body: [posting('a'), posting('b', { text: 'Office Manager' })] },
      ],
    ]);
    const adapter = new LeverJobSourceAdapter(
      { sites: [{ id: 'initech', name: 'Initech' }], region: 'eu' },
      fn,
    );
    expect(adapter.descriptor).toMatchObject({ key: 'lever', postingOrigin: 'EMPLOYER' });
    const found = await adapter.searchJobs(testCriteria, testSignal());
    expect(found.map((p) => p.id)).toEqual(['a']);
    expect(calls).toEqual(['https://api.eu.lever.co/v0/postings/initech?mode=json']);
  });

  it('normalises a posting from its structured fields', () => {
    const adapter = new LeverJobSourceAdapter({ sites: [], region: 'global' });
    const p = adapter.normalizeJob({ ...posting('a'), site: { id: 'initech', name: 'Initech' } });
    expect(p).toEqual({
      externalId: 'initech:a',
      title: 'Frontend Developer',
      companyName: 'Initech',
      location: 'Chennai',
      workMode: 'HYBRID',
      employmentType: 'FULL_TIME',
      seniority: null,
      description:
        'Join our web team.\n\nRequirements\n- React\n- TypeScript\n\nWe value learning.',
      sourceUrl: 'https://jobs.lever.co/initech/a',
      postedAt: new Date(1_791_000_000_000),
      discoveredFrom: 'Lever job site: initech',
    });
    const other = adapter.normalizeJob({
      ...posting('b', {
        workplaceType: 'unspecified',
        createdAt: undefined,
        categories: { commitment: 'Intern' },
      }),
      site: { id: 'initech', name: 'Initech' },
    });
    expect(other).toMatchObject({
      workMode: null,
      location: null,
      employmentType: 'INTERNSHIP',
      postedAt: null,
    });
  });

  it('reports a missing site with a safe message', async () => {
    const { fn } = fakeFetch([]);
    const adapter = new LeverJobSourceAdapter({ sites: [{ id: 'nope' }], region: 'global' }, fn);
    const error = await adapter.searchJobs(testCriteria, testSignal()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JobSourceError);
    expect((error as Error).message).toBe('The Lever job site “nope” was not found.');
  });
});
