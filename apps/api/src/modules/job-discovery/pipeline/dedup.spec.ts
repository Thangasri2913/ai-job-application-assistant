import {
  canonicalUrl,
  dedupKey,
  descriptionSimilarity,
  findDuplicate,
  normalizeCompany,
  normalizeTitle,
} from './dedup.js';

const job = (overrides: Partial<Parameters<typeof findDuplicate>[1][number]> = {}) => ({
  id: 'job-1',
  title: 'Frontend Developer',
  companyName: 'Acme Technologies Pvt Ltd',
  location: 'Bangalore',
  jobUrl: null as string | null,
  normalizedDescription:
    'Build Angular dashboards and integrate REST APIs for our customers every day.',
  ...overrides,
});

describe('duplicate detection', () => {
  it('canonicalises URLs (tracking params, www, trailing slash, fragment)', () => {
    expect(canonicalUrl('http://WWW.Example.com/jobs/42/?utm_source=li&b=2&a=1#apply')).toBe(
      'https://example.com/jobs/42?a=1&b=2',
    );
    expect(canonicalUrl('not a url')).toBeNull();
    expect(canonicalUrl('ftp://example.com/x')).toBeNull();
  });

  it('normalises companies, titles and locations', () => {
    expect(normalizeCompany('Acme Technologies Pvt. Ltd.')).toBe('acme');
    expect(normalizeTitle('Sr. Front-End Engineer')).toBe('senior frontend developer');
    expect(dedupKey('Acme Inc', 'Frontend Developer', 'Bengaluru, India')).toBe(
      dedupKey('ACME', 'Front end developer', 'Bangalore'),
    );
  });

  it('scores description similarity', () => {
    const a = 'Build Angular dashboards and integrate REST APIs for our customers every day.';
    expect(descriptionSimilarity(a, a)).toBe(1);
    expect(descriptionSimilarity(a, 'Completely unrelated text about Java services.')).toBe(0);
  });

  it('finds duplicates by URL, by company + title + location, then by description', () => {
    const posting = {
      canonicalUrl: 'https://example.com/jobs/42',
      dedupKey: dedupKey('Other Co', 'Designer', 'Pune'),
      companyName: 'Other Co',
      title: 'Designer',
      location: 'Pune',
      description: 'Something else entirely for a designer role in Pune.',
    };
    expect(
      findDuplicate(posting, [job({ jobUrl: 'https://www.example.com/jobs/42/' })])?.reason,
    ).toBe('URL');
    expect(
      findDuplicate(
        {
          ...posting,
          canonicalUrl: null,
          dedupKey: dedupKey('Acme', 'Front-end Developer', 'Bengaluru'),
        },
        [job()],
      )?.reason,
    ).toBe('COMPANY_TITLE_LOCATION');
    // A re-posted copy (location not stated) with the same text is the same job…
    const copy = {
      canonicalUrl: null,
      dedupKey: dedupKey('Acme', 'Frontend Engineer', null),
      companyName: 'Acme Technologies',
      title: 'Frontend Engineer',
      location: null,
      description: job().normalizedDescription,
    };
    expect(findDuplicate(copy, [job()])?.reason).toBe('DESCRIPTION');
    // …but a different role or the same role in another city never is, however similar.
    expect(findDuplicate({ ...copy, title: 'UI Engineer' }, [job()])).toBeNull();
    expect(findDuplicate({ ...copy, location: 'Chennai' }, [job()])).toBeNull();
    expect(findDuplicate(posting, [job()])).toBeNull();
  });
});
