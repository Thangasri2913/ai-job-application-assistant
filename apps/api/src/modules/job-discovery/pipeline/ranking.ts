import { MATCH_LEVEL_LABELS, matchLevel } from '@job-assist/shared';

/**
 * Ranking of recommendations (higher first). Salary is deliberately absent: sources don't
 * report it reliably. Components without data are left out and the rest re-normalised.
 */
export const RANKING_WEIGHTS = {
  /** Compatibility score of the recommended resume version. */
  match: 45,
  /** Required skills the recommended version covers. */
  requiredSkills: 20,
  /** Skills and experience sub-scores of the recommended version. */
  resumeFit: 15,
  /** How recently the posting was published. */
  freshness: 10,
  /** How explicitly the posting meets the alert's criteria. */
  criteria: 10,
} as const;

export const FRESHNESS_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RankingInput {
  matchScore: number;
  /** 0–1, null when the job lists no required skills. */
  requiredCoverage: number | null;
  skillScore: number | null;
  experienceScore: number | null;
  postedAt: Date | null;
  /** 0–1 from the criteria check. */
  criteriaFit: number;
  now: Date;
}

/** 1 for postings up to a day old, falling linearly to 0 at 30 days; null if unknown. */
export function freshness(postedAt: Date | null, now: Date): number | null {
  if (!postedAt) return null;
  const days = Math.max(0, (now.getTime() - postedAt.getTime()) / DAY_MS);
  if (days <= 1) return 1;
  return Math.max(0, 1 - (days - 1) / (FRESHNESS_WINDOW_DAYS - 1));
}

export function rankScore(input: RankingInput): number {
  const fitParts = [input.skillScore, input.experienceScore].filter((v): v is number => v !== null);
  const components: [number, number | null][] = [
    [RANKING_WEIGHTS.match, input.matchScore / 100],
    [RANKING_WEIGHTS.requiredSkills, input.requiredCoverage],
    [
      RANKING_WEIGHTS.resumeFit,
      fitParts.length > 0 ? fitParts.reduce((a, b) => a + b, 0) / fitParts.length / 100 : null,
    ],
    [RANKING_WEIGHTS.freshness, freshness(input.postedAt, input.now)],
    [RANKING_WEIGHTS.criteria, input.criteriaFit],
  ];
  const present = components.filter((c): c is [number, number] => c[1] !== null);
  const total = present.reduce((sum, [w]) => sum + w, 0);
  return Math.round((present.reduce((sum, [w, v]) => sum + w * v, 0) / total) * 100);
}

export function postedAgo(postedAt: Date | null, now: Date): string | null {
  if (!postedAt) return null;
  const days = Math.floor((now.getTime() - postedAt.getTime()) / DAY_MS);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  return `Posted ${days} days ago`;
}

/**
 * Why a job is recommended, built only from stored match results and the posting. States
 * compatibility, never a likelihood of being hired.
 */
export function explainRecommendation(input: {
  matchScore: number;
  resumeName: string | null;
  versionNumber: number | null;
  resumesCompared: number;
  requiredMatched: string[];
  requiredMissing: string[];
  criteriaMatched: string[];
  postedAt: Date | null;
  strengths: string[];
  now: Date;
}): { reason: string; reasons: string[] } {
  const resume =
    input.resumeName !== null
      ? `“${input.resumeName}”${input.versionNumber !== null ? ` v${input.versionNumber}` : ''}`
      : 'your resume';
  const required = input.requiredMatched.length + input.requiredMissing.length;
  const coverage =
    required > 0
      ? ` It shows ${input.requiredMatched.length} of ${required} required skills${
          input.requiredMissing.length > 0
            ? ` (not found: ${input.requiredMissing.slice(0, 3).join(', ')})`
            : ''
        }.`
      : '';
  const reason = `${MATCH_LEVEL_LABELS[matchLevel(input.matchScore)]} (${input.matchScore}%) with ${resume}.${coverage}`;
  const reasons = [
    input.resumesCompared > 1
      ? `${resume} scored highest of the ${input.resumesCompared} resumes compared`
      : `${resume} was compared with this job`,
    ...(input.criteriaMatched.length > 0
      ? [`Matches your alert: ${input.criteriaMatched.join(' · ')}`]
      : []),
    ...[postedAgo(input.postedAt, input.now)].filter((v): v is string => v !== null),
    ...input.strengths.slice(0, 3),
  ];
  return { reason, reasons };
}
