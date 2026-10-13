/**
 * Duplicate detection for discovered postings, in order of certainty:
 * 1. same source + external id (handled by the unique key on discovered_jobs);
 * 2. same canonical URL;
 * 3. same company + normalised title + location;
 * 4. same company and title, a compatible location, and a near-identical description (a
 *    re-worded copy of the same posting). Similar titles or the same role in another city
 *    are never merged.
 */

const TRACKING_PARAMS = /^(utm_\w+|ref|refid|source|src|trk|trackingid|gclid|fbclid)$/i;

/** URL without tracking parameters, fragment, "www." or trailing slash; host lower-cased. */
export function canonicalUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length
      ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`
      : '';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '';
    return `https://${host}${u.port ? `:${u.port}` : ''}${path}${query}`;
  } catch {
    return null;
  }
}

const COMPANY_SUFFIXES =
  /\b(private|pvt|limited|ltd|llc|llp|inc|incorporated|corp|corporation|co|gmbh|plc|technologies|technology)\b\.?/g;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/front[\s-]?end/g, 'frontend')
    .replace(/back[\s-]?end/g, 'backend')
    .replace(/full[\s-]?stack/g, 'fullstack')
    .replace(/\bsr\b\.?/g, 'senior')
    .replace(/\bjr\b\.?/g, 'junior')
    .replace(/\bengineer\b/g, 'developer')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LOCATION_ALIASES: Record<string, string> = {
  bengaluru: 'bangalore',
  bombay: 'mumbai',
  madras: 'chennai',
  gurugram: 'gurgaon',
  calcutta: 'kolkata',
};

export function normalizeLocation(location: string | null): string {
  if (!location) return '';
  const first = location.toLowerCase().split(/[,/|]/)[0]!.trim();
  return LOCATION_ALIASES[first] ?? first;
}

export function dedupKey(company: string, title: string, location: string | null): string {
  return `${normalizeCompany(company)}|${normalizeTitle(title)}|${normalizeLocation(location)}`;
}

function shingles(text: string, size = 3): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) set.add(words.slice(i, i + size).join(' '));
  if (set.size === 0 && words.length > 0) set.add(words.join(' '));
  return set;
}

/** Jaccard similarity of word 3-shingles, 0–1. */
export function descriptionSimilarity(a: string, b: string): number {
  const x = shingles(a);
  const y = shingles(b);
  if (x.size === 0 || y.size === 0) return 0;
  let common = 0;
  for (const s of x) if (y.has(s)) common++;
  return common / (x.size + y.size - common);
}

export const DESCRIPTION_DUPLICATE_THRESHOLD = 0.85;

export interface DedupCandidate {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  jobUrl: string | null;
  normalizedDescription: string;
}

export type DuplicateReason = 'URL' | 'COMPANY_TITLE_LOCATION' | 'DESCRIPTION';

/** The first existing job the posting duplicates, with why; null if none. */
export function findDuplicate<T extends DedupCandidate>(
  posting: {
    canonicalUrl: string | null;
    dedupKey: string;
    companyName: string;
    title: string;
    location: string | null;
    description: string;
  },
  jobs: T[],
): { job: T; reason: DuplicateReason } | null {
  if (posting.canonicalUrl) {
    const job = jobs.find((j) => j.jobUrl && canonicalUrl(j.jobUrl) === posting.canonicalUrl);
    if (job) return { job, reason: 'URL' };
  }
  const byKey = jobs.find((j) => dedupKey(j.companyName, j.title, j.location) === posting.dedupKey);
  if (byKey) return { job: byKey, reason: 'COMPANY_TITLE_LOCATION' };
  const company = normalizeCompany(posting.companyName);
  const title = normalizeTitle(posting.title);
  const place = normalizeLocation(posting.location);
  const similar = jobs.find(
    (j) =>
      normalizeCompany(j.companyName) === company &&
      normalizeTitle(j.title) === title &&
      (!place || !j.location || normalizeLocation(j.location) === place) &&
      descriptionSimilarity(j.normalizedDescription, posting.description) >=
        DESCRIPTION_DUPLICATE_THRESHOLD,
  );
  return similar ? { job: similar, reason: 'DESCRIPTION' } : null;
}
