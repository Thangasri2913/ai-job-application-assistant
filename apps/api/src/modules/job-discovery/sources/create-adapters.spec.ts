import { describeSelection, selectJobSources, type SourcesConfig } from './create-adapters.js';

const config = (over: Partial<SourcesConfig['adzuna']> = {}): SourcesConfig => ({
  adzuna: {
    appId: undefined,
    appKey: undefined,
    country: 'in',
    maxDaysOld: 30,
    dailyRequestLimit: 200,
    ...over,
  },
  remotive: { dailyRequestLimit: 4 },
  greenhouse: { boards: [] },
  lever: { sites: [], region: 'global' },
});
const configured = config({ appId: 'test-id', appKey: 'test-key' });

describe('job source selection (JOB_SOURCES)', () => {
  it('enables the development source outside production', () => {
    const s = selectJobSources(['dev'], 'development', config());
    expect(s.adapters.map((a) => a.descriptor.key)).toEqual(['dev']);
    expect(describeSelection(s)).toEqual({
      level: 'log',
      message: 'Job discovery sources: dev (sample data).',
    });
  });

  it('refuses development sample data in production', () => {
    const s = selectJobSources(['dev'], 'production', config());
    expect(s).toMatchObject({ adapters: [], refusedInProduction: ['dev'] });
    const d = describeSelection(s);
    expect(d.level).toBe('warn');
    expect(d.message).toBe(
      'Job discovery has no usable job sources: job alerts will run but cannot find any jobs ("dev" provides development sample data and is disabled in production). Supported sources: adzuna, remotive, greenhouse, lever, dev.',
    );
  });

  it('enables Adzuna (real jobs) in production when its credentials are set', () => {
    const s = selectJobSources(['adzuna', 'dev'], 'production', configured);
    expect(s.adapters.map((a) => [a.descriptor.key, a.descriptor.isDevelopment])).toEqual([
      ['adzuna', false],
    ]);
    expect(describeSelection(s)).toEqual({
      level: 'warn',
      message:
        'Job discovery sources: adzuna (real jobs); "dev" provides development sample data and is disabled in production.',
    });
    expect(describeSelection(selectJobSources(['adzuna'], 'production', configured))).toEqual({
      level: 'log',
      message: 'Job discovery sources: adzuna (real jobs).',
    });
  });

  it('reports Adzuna enabled without credentials, never printing values', () => {
    const s = selectJobSources(['adzuna'], 'production', config());
    expect(s.notConfigured).toEqual(['adzuna']);
    const d = describeSelection(s);
    expect(d).toEqual({
      level: 'warn',
      message:
        'Job discovery has no usable job sources: job alerts will run but cannot find any jobs ("adzuna" is enabled but not configured (ADZUNA_APP_ID and ADZUNA_APP_KEY are not set)). Supported sources: adzuna, remotive, greenhouse, lever, dev.',
    });
    expect(
      describeSelection(selectJobSources(['adzuna'], 'production', configured)).message,
    ).not.toMatch(/test-key|test-id/);
  });

  it('warns when JOB_SOURCES is empty, and ignores unknown keys', () => {
    expect(describeSelection(selectJobSources([], 'production', config())).message).toMatch(
      /no usable job sources: .*\(JOB_SOURCES is empty\)/,
    );
    const s = selectJobSources(['linkedin', 'dev'], 'test', config());
    expect(s.unknown).toEqual(['linkedin']);
    expect(describeSelection(s).message).toBe(
      'Job discovery sources: dev (sample data); "linkedin" is not a supported source and was ignored.',
    );
  });

  it('enables the employer-board and Remotive sources from their settings', () => {
    const s = selectJobSources(['adzuna', 'remotive', 'greenhouse', 'lever'], 'production', {
      ...config(),
      greenhouse: { boards: [{ id: 'acme' }] },
    });
    expect(s.adapters.map((a) => [a.descriptor.key, a.isConfigured()])).toEqual([
      ['adzuna', false],
      ['remotive', true],
      ['greenhouse', true],
      ['lever', false],
    ]);
    expect(s.notConfigured).toEqual(['adzuna', 'lever']);
    expect(describeSelection(s)).toEqual({
      level: 'warn',
      message: expect.stringMatching(
        /^Job discovery sources: remotive \(real jobs\), greenhouse \(real jobs\); .*ADZUNA_APP_ID.*LEVER_SITES is empty/,
      ),
    });
  });
});
