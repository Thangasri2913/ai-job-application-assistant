import {
  type EmploymentType,
  type RemotePreference,
  SENIORITY_LEVELS,
  type SeniorityLevel,
} from '@job-assist/shared';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';
import { normalizeJobDescription } from '../../jobs/analysis/job-analyzer.js';
import type { SourceJobPosting } from '../sources/job-source-adapter.js';
import { canonicalUrl, dedupKey } from './dedup.js';

const MAX_DESCRIPTION = 50_000;
const MAX_FIELD = 200;

/** A posting after the pipeline's own normalisation, shared by every source. */
export interface NormalizedPosting extends SourceJobPosting {
  /** Canonical skill names found in the title and description (React.js → React). */
  skills: string[];
  canonicalUrl: string | null;
  dedupKey: string;
}

const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Validates and normalises an adapter's posting; throws if it is unusable. */
export function normalizePosting(p: SourceJobPosting): NormalizedPosting {
  const title = clean(p.title).slice(0, MAX_FIELD);
  const companyName = clean(p.companyName).slice(0, MAX_FIELD);
  const description = normalizeJobDescription(p.description).slice(0, MAX_DESCRIPTION);
  const externalId = p.externalId.trim();
  if (!title || !companyName || !description || !externalId)
    throw new Error('Posting is missing a title, company, description or id.');
  const location = p.location ? clean(p.location).slice(0, MAX_FIELD) : null;
  const sourceUrl = p.sourceUrl && /^https?:\/\//i.test(p.sourceUrl) ? p.sourceUrl : null;
  return {
    ...p,
    externalId,
    title,
    companyName,
    description,
    location,
    sourceUrl,
    seniority: p.seniority ?? inferSeniority(title),
    skills: detectSkills(`${title}\n${description}`),
    canonicalUrl: sourceUrl ? canonicalUrl(sourceUrl) : null,
    dedupKey: dedupKey(companyName, title, location),
  };
}

export function inferSeniority(title: string): SeniorityLevel | null {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return 'INTERN';
  if (/\b(principal|staff)\b/.test(t)) return 'PRINCIPAL';
  if (/\b(lead|head)\b/.test(t)) return 'LEAD';
  if (/\b(senior|sr\.?)\s/.test(`${t} `)) return 'SENIOR';
  if (/\b(junior|jr\.?|entry[- ]level|graduate)\s/.test(`${t} `)) return 'JUNIOR';
  return null;
}

// ── Alert criteria ──

export interface AlertCriteria {
  keywords: string[];
  locations: string[];
  remotePreference: RemotePreference;
  employmentTypes: EmploymentType[];
  experienceLevel: SeniorityLevel | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text: string, word: string) =>
  new RegExp(`(?<![\\w])${escape(word)}(?![\\w])`, 'i').test(text);

/**
 * A keyword matches when it is one of the posting's canonical skills (so "React.js" finds
 * "React", while "Java" never matches "JavaScript"), or when every word of it appears as
 * a whole word in the title or description.
 */
export function matchesKeyword(keyword: string, posting: NormalizedPosting): boolean {
  const key = skillKey(keyword);
  if (posting.skills.some((s) => s.toLowerCase() === key)) return true;
  const words = keyword.trim().split(/\s+/).filter(Boolean);
  const text = `${posting.title}\n${posting.description}`.replace(/front[- ]end/gi, 'frontend');
  return (
    words.length > 0 && words.every((w) => hasWord(text, w.replace(/^front[- ]end$/i, 'frontend')))
  );
}

/** Common alternative city names, so "Bangalore" finds "Bengaluru". */
const CITY_ALIASES: string[][] = [
  ['bangalore', 'bengaluru'],
  ['mumbai', 'bombay'],
  ['chennai', 'madras'],
  ['gurgaon', 'gurugram'],
  ['kolkata', 'calcutta'],
  ['new delhi', 'delhi'],
];

export function canonicalCity(value: string): string {
  const v = clean(value).toLowerCase();
  for (const group of CITY_ALIASES) if (group.some((name) => v.includes(name))) return group[0]!;
  return v;
}

export function matchesLocation(location: string | null, wanted: string): boolean {
  if (!location) return false;
  const loc = location.toLowerCase();
  const city = canonicalCity(wanted);
  const group = CITY_ALIASES.find((g) => g[0] === city) ?? [city];
  return group.some((name) => loc.includes(name));
}

/** Whether the posting's work arrangement is acceptable. Unknown counts as on-site. */
export function matchesRemote(pref: RemotePreference, posting: NormalizedPosting): boolean {
  const mode = posting.workMode ?? 'ONSITE';
  if (pref === 'ANY') return true;
  if (pref === 'REMOTE') return mode === 'REMOTE';
  if (pref === 'HYBRID') return mode === 'HYBRID' || mode === 'REMOTE';
  return mode === 'ONSITE' || mode === 'HYBRID';
}

const LEVEL_INDEX = new Map(SENIORITY_LEVELS.map((l, i) => [l, i]));

export interface CriteriaResult {
  matches: boolean;
  /** 0–1: share of the alert's stated criteria the posting explicitly satisfies (unknown = half). */
  fit: number;
  /** Human-readable criteria the posting satisfies, e.g. "Bangalore", "Full-time". */
  matched: string[];
}

/** Applies the alert's criteria. Unknown employment type or level never excludes a posting. */
export function evaluateCriteria(
  criteria: AlertCriteria,
  posting: NormalizedPosting,
): CriteriaResult {
  const matched: string[] = [];
  const parts: number[] = [];

  const keywordHit = criteria.keywords.find((k) => matchesKeyword(k, posting));
  if (criteria.keywords.length > 0) {
    if (!keywordHit) return { matches: false, fit: 0, matched };
    parts.push(1);
    matched.push(`“${keywordHit}”`);
  }

  const remoteOk = posting.workMode === 'REMOTE' && criteria.remotePreference !== 'ONSITE';
  if (criteria.locations.length > 0) {
    const city = criteria.locations.find((l) => matchesLocation(posting.location, l));
    if (!city && !remoteOk) return { matches: false, fit: 0, matched };
    parts.push(1);
    matched.push(city ? clean(city) : 'Remote');
  }

  if (!matchesRemote(criteria.remotePreference, posting))
    return { matches: false, fit: 0, matched };
  if (criteria.remotePreference !== 'ANY') {
    parts.push(posting.workMode ? 1 : 0.5);
    if (posting.workMode)
      matched.push(
        posting.workMode === 'REMOTE'
          ? 'Remote'
          : posting.workMode === 'HYBRID'
            ? 'Hybrid'
            : 'On-site',
      );
  }

  if (criteria.employmentTypes.length > 0) {
    if (posting.employmentType && !criteria.employmentTypes.includes(posting.employmentType))
      return { matches: false, fit: 0, matched };
    parts.push(posting.employmentType ? 1 : 0.5);
    if (posting.employmentType) matched.push(EMPLOYMENT_LABEL[posting.employmentType]);
  }

  if (criteria.experienceLevel) {
    if (posting.seniority) {
      const distance = Math.abs(
        LEVEL_INDEX.get(posting.seniority)! - LEVEL_INDEX.get(criteria.experienceLevel)!,
      );
      // One level either side is close enough (Mid ↔ Senior); further is excluded.
      if (distance > 1) return { matches: false, fit: 0, matched };
      parts.push(distance === 0 ? 1 : 0.5);
      if (distance === 0) matched.push('Experience level');
    } else parts.push(0.5);
  }

  const fit = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : 1;
  return { matches: true, fit, matched };
}

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  FREELANCE: 'Freelance',
  INTERNSHIP: 'Internship',
  TEMPORARY: 'Temporary',
};
