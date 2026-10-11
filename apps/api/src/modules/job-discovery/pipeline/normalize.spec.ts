import type { SourceJobPosting } from '../sources/job-source-adapter.js';
import {
  type AlertCriteria,
  evaluateCriteria,
  matchesKeyword,
  normalizePosting,
} from './normalize.js';

const base: SourceJobPosting = {
  externalId: ' ext-1 ',
  title: '  Front-end   Developer ',
  companyName: 'Sample Co',
  location: 'Bengaluru, India',
  workMode: 'HYBRID',
  employmentType: 'FULL_TIME',
  seniority: null,
  description:
    'We build things.\r\n\r\n\r\nRequirements:\n• Experience with React.js and TypeScript',
  sourceUrl: 'https://www.example.com/jobs/1/?utm_source=x',
  postedAt: null,
};

const criteria = (overrides: Partial<AlertCriteria> = {}): AlertCriteria => ({
  keywords: ['Frontend Developer'],
  locations: [],
  remotePreference: 'ANY',
  employmentTypes: [],
  experienceLevel: null,
  ...overrides,
});

describe('normalizePosting', () => {
  it('cleans text, normalises skills and computes duplicate keys', () => {
    const p = normalizePosting(base);
    expect(p.externalId).toBe('ext-1');
    expect(p.title).toBe('Front-end Developer');
    expect(p.description).toContain('- Experience with React.js and TypeScript');
    expect(p.description).not.toMatch(/\n{3}/);
    expect(p.skills).toEqual(expect.arrayContaining(['React', 'TypeScript']));
    expect(p.skills).not.toContain('React.js');
    expect(p.canonicalUrl).toBe('https://example.com/jobs/1');
    expect(p.dedupKey).toBe('sample|frontend developer|bangalore');
  });

  it('rejects unusable postings and non-http URLs', () => {
    expect(() => normalizePosting({ ...base, title: '  ' })).toThrow();
    expect(() => normalizePosting({ ...base, description: '' })).toThrow();
    expect(normalizePosting({ ...base, sourceUrl: 'javascript:alert(1)' }).sourceUrl).toBeNull();
  });

  it('infers seniority from the title when the source has none', () => {
    expect(normalizePosting({ ...base, title: 'Sr. Frontend Developer' }).seniority).toBe('SENIOR');
    expect(normalizePosting({ ...base, title: 'Frontend Intern' }).seniority).toBe('INTERN');
    expect(normalizePosting(base).seniority).toBeNull();
  });
});

describe('keyword matching', () => {
  const posting = (title: string, description: string) =>
    normalizePosting({ ...base, title, description });

  it('matches skill aliases (React.js → React)', () => {
    expect(matchesKeyword('React.js', posting('UI Developer', 'We use React daily.'))).toBe(true);
    expect(matchesKeyword('ReactJS', posting('UI Developer', 'We use React daily.'))).toBe(true);
  });

  it('never matches Java to JavaScript', () => {
    const js = posting('Web Developer', 'Strong JavaScript skills required.');
    expect(matchesKeyword('Java', js)).toBe(false);
    expect(matchesKeyword('JavaScript', js)).toBe(true);
    expect(matchesKeyword('Java', posting('Backend Developer', 'Java and Spring Boot.'))).toBe(
      true,
    );
  });

  it('matches every word of a phrase, treating front-end as frontend', () => {
    expect(matchesKeyword('Frontend Developer', posting('Front-end Developer', 'x y z'))).toBe(
      true,
    );
    expect(matchesKeyword('Frontend Developer', posting('Backend Developer', 'x y z'))).toBe(false);
  });
});

describe('evaluateCriteria', () => {
  const p = normalizePosting(base);

  it('requires a keyword match', () => {
    expect(evaluateCriteria(criteria({ keywords: ['Python'] }), p).matches).toBe(false);
    const ok = evaluateCriteria(criteria(), p);
    expect(ok.matches).toBe(true);
    expect(ok.fit).toBe(1);
  });

  it('matches city aliases and lets remote postings through a location filter', () => {
    expect(evaluateCriteria(criteria({ locations: ['Bangalore'] }), p).matched).toContain(
      'Bangalore',
    );
    expect(evaluateCriteria(criteria({ locations: ['Chennai'] }), p).matches).toBe(false);
    const remote = normalizePosting({ ...base, location: 'Remote', workMode: 'REMOTE' });
    expect(evaluateCriteria(criteria({ locations: ['Chennai'] }), remote).matches).toBe(true);
    expect(
      evaluateCriteria(criteria({ locations: ['Chennai'], remotePreference: 'ONSITE' }), remote)
        .matches,
    ).toBe(false);
  });

  it('applies remote preference, employment type and experience level', () => {
    expect(evaluateCriteria(criteria({ remotePreference: 'REMOTE' }), p).matches).toBe(false);
    expect(evaluateCriteria(criteria({ remotePreference: 'HYBRID' }), p).matches).toBe(true);
    expect(evaluateCriteria(criteria({ employmentTypes: ['CONTRACT'] }), p).matches).toBe(false);
    const senior = normalizePosting({ ...base, seniority: 'SENIOR' });
    expect(evaluateCriteria(criteria({ experienceLevel: 'MID' }), senior).matches).toBe(true);
    expect(evaluateCriteria(criteria({ experienceLevel: 'JUNIOR' }), senior).matches).toBe(false);
  });

  it('never excludes on unknown values, but lowers the fit', () => {
    const unknown = normalizePosting({ ...base, employmentType: null, seniority: null });
    const r = evaluateCriteria(
      criteria({ employmentTypes: ['FULL_TIME'], experienceLevel: 'MID' }),
      unknown,
    );
    expect(r.matches).toBe(true);
    expect(r.fit).toBeLessThan(1);
  });
});
