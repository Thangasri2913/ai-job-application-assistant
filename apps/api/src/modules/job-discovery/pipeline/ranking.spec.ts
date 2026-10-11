import { explainRecommendation, freshness, rankScore } from './ranking.js';

const now = new Date('2026-10-11T00:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

const base = {
  matchScore: 80,
  requiredCoverage: 1,
  skillScore: 80,
  experienceScore: 80,
  postedAt: daysAgo(1),
  criteriaFit: 1,
  now,
};

describe('ranking', () => {
  it('scores freshness from 1 (≤ 1 day) to 0 (30 days); unknown is left out', () => {
    expect(freshness(daysAgo(0.5), now)).toBe(1);
    expect(freshness(daysAgo(30), now)).toBe(0);
    expect(freshness(daysAgo(15.5), now)).toBeCloseTo(0.5, 1);
    expect(freshness(null, now)).toBeNull();
  });

  it('ranks by match, required-skill coverage, resume fit, freshness and criteria', () => {
    const top = rankScore(base);
    expect(rankScore({ ...base, matchScore: 70 })).toBeLessThan(top);
    expect(rankScore({ ...base, requiredCoverage: 0.5 })).toBeLessThan(top);
    expect(rankScore({ ...base, skillScore: 40 })).toBeLessThan(top);
    expect(rankScore({ ...base, postedAt: daysAgo(20) })).toBeLessThan(top);
    expect(rankScore({ ...base, criteriaFit: 0.5 })).toBeLessThan(top);
    // Match weighs more than freshness.
    expect(rankScore({ ...base, matchScore: 95, postedAt: daysAgo(25) })).toBeGreaterThan(
      rankScore({ ...base, matchScore: 70, postedAt: daysAgo(0) }),
    );
  });

  it('re-normalises when a component is unknown', () => {
    const score = rankScore({ ...base, requiredCoverage: null, postedAt: null });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('explains a recommendation from stored facts, without promises', () => {
    const { reason, reasons } = explainRecommendation({
      matchScore: 82,
      resumeName: 'Angular Resume',
      versionNumber: 2,
      resumesCompared: 3,
      requiredMatched: ['Angular', 'TypeScript'],
      requiredMissing: ['Docker'],
      criteriaMatched: ['“Frontend Developer”', 'Bangalore'],
      postedAt: daysAgo(2),
      strengths: ['Required skill: Angular (in work experience)'],
      now,
    });
    expect(reason).toBe(
      'Strong match (82%) with “Angular Resume” v2. It shows 2 of 3 required skills (not found: Docker).',
    );
    expect(reasons).toEqual([
      '“Angular Resume” v2 scored highest of the 3 resumes compared',
      'Matches your alert: “Frontend Developer” · Bangalore',
      'Posted 2 days ago',
      'Required skill: Angular (in work experience)',
    ]);
    expect([reason, ...reasons].join(' ')).not.toMatch(/guarantee|will get|hired|chance/i);
  });
});
