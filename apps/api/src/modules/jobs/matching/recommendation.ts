import type { ScoredMatch } from './match-scorer.js';

export interface RankableMatch {
  resumeVersionId: string;
  resumeName: string;
  isDefault: boolean;
  /** When the version became current; newer wins a full tie. */
  activatedAt: Date | null;
  scored: ScoredMatch;
}

/**
 * Deterministic ranking: overall score, then skills, then experience, then the default
 * resume, then the most recently activated version, then version id (total order).
 */
export function rankMatches<T extends RankableMatch>(matches: T[]): T[] {
  const n = (v: number | null) => v ?? -1;
  return [...matches].sort(
    (a, b) =>
      b.scored.overallScore - a.scored.overallScore ||
      n(b.scored.scores.skills) - n(a.scored.scores.skills) ||
      n(b.scored.scores.experience) - n(a.scored.scores.experience) ||
      Number(b.isDefault) - Number(a.isDefault) ||
      (b.activatedAt?.getTime() ?? 0) - (a.activatedAt?.getTime() ?? 0) ||
      a.resumeVersionId.localeCompare(b.resumeVersionId),
  );
}

/** Why the top-ranked resume is recommended, built only from stored match results. */
export function recommendationReasons(ranked: RankableMatch[]): {
  reasons: string[];
  gaps: string[];
} {
  const [best, second] = ranked;
  if (!best) return { reasons: [], gaps: [] };
  const reasons = [...best.scored.strengths.slice(0, 5)];
  if (ranked.length > 1 && second) {
    const lead = best.scored.overallScore - second.scored.overallScore;
    reasons.push(
      lead > 0
        ? `Highest compatibility of the ${ranked.length} resumes compared (${lead} points ahead of “${second.resumeName}”)`
        : `Tied with “${second.resumeName}” on overall score; ranked first on ${tieBreaker(best, second)}`,
    );
  } else {
    reasons.push('The only active resume that could be compared');
  }
  return { reasons, gaps: best.scored.gaps.slice(0, 5) };
}

function tieBreaker(a: RankableMatch, b: RankableMatch): string {
  if ((a.scored.scores.skills ?? -1) !== (b.scored.scores.skills ?? -1)) return 'skills';
  if ((a.scored.scores.experience ?? -1) !== (b.scored.scores.experience ?? -1))
    return 'experience';
  if (a.isDefault !== b.isDefault) return 'being your default resume';
  return 'being the most recently updated';
}
