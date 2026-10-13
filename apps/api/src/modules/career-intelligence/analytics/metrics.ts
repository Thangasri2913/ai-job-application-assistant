import {
  type ApplicationStatus,
  CAREER_MIN_GROUP_SIZE,
  type OutcomeMetrics,
  SUBMITTED_STATUSES,
} from '@job-assist/shared';
import type { ApplicationRecord } from './types.js';

/**
 * How far an application progressed. Stages are cumulative: an application that reached a
 * final interview also counts as having reached screening and an interview.
 */
export const STAGE_RANK: Partial<Record<ApplicationStatus, number>> = {
  APPLIED: 1,
  RECRUITER_SCREEN: 2,
  ASSESSMENT: 2,
  INTERVIEW: 3,
  TECHNICAL_INTERVIEW: 3,
  FINAL_INTERVIEW: 4,
  OFFER: 5,
  ACCEPTED: 6,
};

export const RANK = {
  APPLIED: 1,
  SCREENING: 2,
  INTERVIEW: 3,
  FINAL_INTERVIEW: 4,
  OFFER: 5,
  ACCEPTED: 6,
} as const;

/** Highest stage ever reached (0 = never submitted). */
export function highestRank(a: Pick<ApplicationRecord, 'reached' | 'appliedAt'>): number {
  const rank = Math.max(0, ...a.reached.map((s) => STAGE_RANK[s] ?? 0));
  return rank === 0 && a.appliedAt ? RANK.APPLIED : rank;
}

/** Sent to the employer: has an application date or ever entered a post-submission status. */
export function isSubmitted(a: Pick<ApplicationRecord, 'reached' | 'appliedAt'>): boolean {
  return a.appliedAt !== null || a.reached.some((s) => SUBMITTED_STATUSES.includes(s));
}

/** A share 0–1 rounded to 3 places; null when the denominator is zero (never a made-up rate). */
export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : null;
}

/** Outcome counts and rates for a set of applications (only submitted ones count). */
export function outcomeMetrics(applications: ApplicationRecord[]): OutcomeMetrics {
  const submitted = applications.filter(isSubmitted);
  let responses = 0;
  let interviews = 0;
  let offers = 0;
  let accepted = 0;
  let rejections = 0;
  for (const a of submitted) {
    const rank = highestRank(a);
    const rejected = a.reached.includes('REJECTED');
    if (rank >= RANK.SCREENING || rejected) responses++;
    if (rank >= RANK.INTERVIEW) interviews++;
    if (rank >= RANK.OFFER) offers++;
    if (rank >= RANK.ACCEPTED) accepted++;
    if (a.status === 'REJECTED') rejections++;
  }
  const n = submitted.length;
  return {
    applications: n,
    responses,
    interviews,
    offers,
    accepted,
    rejections,
    responseRate: rate(responses, n),
    interviewRate: rate(interviews, n),
    offerRate: rate(offers, n),
    interviewToOfferRate: rate(offers, interviews),
    reliable: n >= CAREER_MIN_GROUP_SIZE,
  };
}

/** "25%" — for statements. */
export const pct = (value: number | null) =>
  value === null ? 'n/a' : `${Math.round(value * 100)}%`;
