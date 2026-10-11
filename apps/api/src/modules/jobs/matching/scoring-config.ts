import type { EvidenceLocation, MatchDimension } from '@job-assist/shared';

/** Bump when scoring rules change, so stored matches say which rules produced them. */
export const SCORING_VERSION = 'match-scoring@1';

/**
 * Relative weight of each dimension. A dimension the job states nothing about (e.g. no
 * education requirement) is left out and the remaining weights are re-normalised.
 */
export const SCORING_WEIGHTS: Record<MatchDimension, number> = {
  skills: 40,
  experience: 25,
  responsibilities: 15,
  projects: 10,
  education: 5,
  keywords: 5,
};

/** Credit for a required/preferred skill, by where the evidence was found (best wins). */
export const SKILL_CREDIT: Record<EvidenceLocation, number> = {
  EXPERIENCE: 1,
  SKILLS: 0.8,
  PROJECTS: 0.5,
  CERTIFICATIONS: 0.5,
  SUMMARY: 0.4,
  RELATED_SKILL: 0.3,
};

/** Preferred (nice-to-have) requirements count half as much as required ones. */
export const IMPORTANCE_WEIGHT = { REQUIRED: 1, PREFERRED: 0.5 } as const;

/** Experience score = years part × this + role-relevance part × (1 − this), when years are stated. */
export const EXPERIENCE_YEARS_SHARE = 0.7;

/** A responsibility counts as covered when this share of its significant words appears in one line. */
export const RESPONSIBILITY_FULL_OVERLAP = 0.5;
export const RESPONSIBILITY_PARTIAL_OVERLAP = 0.25;
