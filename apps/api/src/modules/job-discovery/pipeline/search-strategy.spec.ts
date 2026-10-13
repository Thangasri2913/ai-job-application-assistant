import { buildSearchStrategy, type ProfileTerms, remoteFromWorkModes } from './search-strategy.js';

const alert = {
  keywords: ['Angular Developer'],
  locations: [] as string[],
  remotePreference: 'ANY' as const,
  employmentTypes: [],
  experienceLevel: null,
};

const profile = (over: Partial<ProfileTerms> = {}): ProfileTerms => ({
  preferredRoles: ['Frontend Engineer', 'angular developer'],
  currentJobTitle: 'UI Developer',
  preferredLocations: ['Chennai', 'Bengaluru'],
  location: 'Madurai',
  workModes: ['REMOTE', 'HYBRID'],
  employmentTypes: ['FULL_TIME'],
  ...over,
});

describe('search strategy', () => {
  it('keeps the alert’s terms first and adds alternate titles from the Career Profile', () => {
    expect(buildSearchStrategy(alert, profile())).toEqual({
      keywords: ['Angular Developer', 'Frontend Engineer', 'UI Developer'],
      alternateTitles: ['Frontend Engineer', 'UI Developer'],
      locations: ['Chennai', 'Bengaluru'],
      remotePreference: 'HYBRID',
      employmentTypes: ['FULL_TIME'],
      experienceLevel: null,
      basis: { locations: 'PROFILE', remotePreference: 'PROFILE', employmentTypes: 'PROFILE' },
    });
  });

  it('never overrides criteria the alert states', () => {
    const s = buildSearchStrategy(
      {
        ...alert,
        locations: ['Pune'],
        remotePreference: 'ONSITE',
        employmentTypes: ['CONTRACT'],
        experienceLevel: 'SENIOR',
      },
      profile(),
    );
    expect(s).toMatchObject({
      locations: ['Pune'],
      remotePreference: 'ONSITE',
      employmentTypes: ['CONTRACT'],
      experienceLevel: 'SENIOR',
      basis: { locations: 'ALERT', remotePreference: 'ALERT', employmentTypes: 'ALERT' },
    });
  });

  it('uses only what the profile states (nothing is invented)', () => {
    const empty = profile({
      preferredRoles: [],
      currentJobTitle: null,
      preferredLocations: [],
      location: null,
      workModes: [],
      employmentTypes: [],
    });
    expect(buildSearchStrategy(alert, empty)).toMatchObject({
      keywords: ['Angular Developer'],
      alternateTitles: [],
      locations: [],
      remotePreference: 'ANY',
      employmentTypes: [],
      basis: { locations: 'NONE', remotePreference: 'ALERT', employmentTypes: 'ALERT' },
    });
    expect(buildSearchStrategy(alert, profile({ preferredLocations: [] })).locations).toEqual([
      'Madurai',
    ]);
    expect(buildSearchStrategy(alert, null).keywords).toEqual(['Angular Developer']);
  });

  it('maps preferred work modes to a remote preference', () => {
    expect(remoteFromWorkModes(['REMOTE'])).toBe('REMOTE');
    expect(remoteFromWorkModes(['HYBRID'])).toBe('HYBRID');
    expect(remoteFromWorkModes(['ONSITE', 'HYBRID'])).toBe('ONSITE');
    expect(remoteFromWorkModes(['ONSITE', 'REMOTE'])).toBe('ANY');
    expect(remoteFromWorkModes([])).toBe('ANY');
  });
});
