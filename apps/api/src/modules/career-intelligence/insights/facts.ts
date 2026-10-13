import { createHash } from 'node:crypto';
import type {
  CareerInsightCategory,
  CareerIntelligenceReport,
  CareerPatternKind,
  InsightConfidence,
} from '@job-assist/shared';
import { ANALYTICS_VERSION } from '../analytics/report.js';
import { confidenceFor } from '../analytics/patterns.js';
import { pct } from '../analytics/metrics.js';

export type FactKind =
  | CareerPatternKind
  | 'TOTALS'
  | 'LIMITATION'
  | 'SKILL_GAP'
  | 'SKILL_STRENGTH'
  | 'RESUME'
  | 'WEAK_TOPIC';

/** A computed statement about the user's own data. Insights may only cite these. */
export interface Fact {
  id: string;
  kind: FactKind;
  statement: string;
  sampleSize: number | null;
  confidence: InsightConfidence;
  /** Extra values rules need (never shown). */
  data?: { share?: number | null; skill?: string };
}

export interface InsightDraft {
  category: CareerInsightCategory;
  title: string;
  explanation: string;
  recommendedAction: string;
  factIds: string[];
  confidence: InsightConfidence;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Turns the report into numbered, minimal facts (no contact data, no resume text). */
export function buildFacts(report: CareerIntelligenceReport): Fact[] {
  const facts: Omit<Fact, 'id'>[] = [];
  const t = report.totals;
  const o = t.outcomes;
  if (t.submitted > 0) {
    facts.push({
      kind: 'TOTALS',
      statement: `You have ${plural(t.submitted, 'submitted application')}: ${o.interviews} reached an interview (${pct(o.interviewRate)}), ${o.offers} received an offer (${pct(o.offerRate)}) and ${o.responses} received a response (${pct(o.responseRate)}).`,
      sampleSize: t.submitted,
      confidence: confidenceFor(t.submitted),
    });
  }
  if (!report.limitations.sufficientForPatterns) {
    facts.push({
      kind: 'LIMITATION',
      statement: `You have ${plural(t.submitted, 'submitted application')}; at least ${report.limitations.minimumForPatterns} are needed before outcome patterns are identified.`,
      sampleSize: t.submitted,
      confidence: 'HIGH',
    });
  }
  for (const p of report.patterns) {
    facts.push({
      kind: p.kind,
      statement: p.finding,
      sampleSize: p.sampleSize,
      confidence: p.confidence,
      data: p.kind === 'MATCH_ALIGNMENT' ? { share: report.matchScores.alignedShare } : undefined,
    });
  }
  for (const s of report.skills.filter((s) => s.isGap).slice(0, 5)) {
    facts.push({
      kind: 'SKILL_GAP',
      statement: `${s.skill} appears in ${s.jobs} of your ${t.analysedTargetJobs} analysed target jobs (required in ${s.requiredIn}); your best-matching resume showed limited evidence for it in ${s.coverage.missing} of them.`,
      sampleSize: s.jobs,
      confidence: confidenceFor(s.jobs),
      data: { skill: s.skill },
    });
  }
  for (const s of report.skills
    .filter((s) => s.coverageLevel === 'STRONG' && s.jobs >= 3)
    .slice(0, 3)) {
    facts.push({
      kind: 'SKILL_STRENGTH',
      statement: `${s.skill} appears in ${s.jobs} of your ${t.analysedTargetJobs} analysed target jobs, and your best-matching resume showed it in ${s.coverage.matched} of them.`,
      sampleSize: s.jobs,
      confidence: confidenceFor(s.jobs),
      data: { skill: s.skill },
    });
  }
  for (const r of report.resumes.filter((r) => r.reliable)) {
    facts.push({
      kind: 'RESUME',
      statement: `Resume “${r.resumeName}” v${r.versionNumber} was used for ${plural(r.applications, 'submitted application')}: ${r.interviews} reached an interview (${pct(r.interviewRate)}).`,
      sampleSize: r.applications,
      confidence: confidenceFor(r.applications),
    });
  }
  for (const topic of report.interviewTopics.filter((x) => x.averageScore < 60).slice(0, 3)) {
    facts.push({
      kind: 'WEAK_TOPIC',
      statement: `Your interview practice on ${topic.topic} averaged ${topic.averageScore}/100 across ${plural(topic.sessions, 'completed session')} (practice feedback, not a measurement).`,
      sampleSize: topic.sessions,
      confidence: confidenceFor(topic.sessions),
      data: { skill: topic.topic },
    });
  }
  return facts.map((f, i) => ({ ...f, id: `F${i + 1}` }));
}

/** Identifies the data an insight run used: a different fingerprint means the insights are stale. */
export function factsFingerprint(facts: Fact[]): string {
  return createHash('sha256')
    .update(ANALYTICS_VERSION)
    .update(JSON.stringify(facts.map((f) => [f.kind, f.statement])))
    .digest('hex');
}

const CONFIDENCE_ORDER: InsightConfidence[] = ['LOW', 'MEDIUM', 'HIGH'];
/** The lower of two confidences. */
export const minConfidence = (a: InsightConfidence, b: InsightConfidence) =>
  CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))]!;
/** The highest confidence among the cited facts: an insight can't be surer than its evidence. */
export const evidenceConfidence = (facts: Fact[]) =>
  CONFIDENCE_ORDER[Math.max(...facts.map((f) => CONFIDENCE_ORDER.indexOf(f.confidence)))]!;
