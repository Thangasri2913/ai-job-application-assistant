import {
  type BreakdownRow,
  CAREER_MIN_GROUP_SIZE,
  type CareerIntelligenceReport,
  type CareerPattern,
  type CareerPatternKind,
  type InsightConfidence,
  REJECTION_CATEGORY_LABELS,
  type ResumeVersionPerformance,
} from '@job-assist/shared';
import { pct } from './metrics.js';

/** Confidence from the smallest sample a statement relies on. */
export function confidenceFor(sampleSize: number): InsightConfidence {
  if (sampleSize >= 30) return 'HIGH';
  if (sampleSize >= 10) return 'MEDIUM';
  return 'LOW';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface Comparable {
  label: string;
  applications: number;
  interviews: number;
  interviewRate: number | null;
  reliable: boolean;
}

/**
 * The group with the highest interview rate, compared with the other groups that have enough
 * data. Null unless at least two groups are reliable and they actually differ.
 */
export function strongest(
  kind: CareerPatternKind,
  noun: string,
  rows: Comparable[],
): CareerPattern | null {
  const reliable = rows.filter((r) => r.reliable && r.interviewRate !== null);
  if (reliable.length < 2) return null;
  const sorted = [...reliable].sort(
    (a, b) => b.interviewRate! - a.interviewRate! || b.applications - a.applications,
  );
  const best = sorted[0]!;
  const rest = sorted.slice(1);
  const restApps = rest.reduce((s, r) => s + r.applications, 0);
  const restInterviews = rest.reduce((s, r) => s + r.interviews, 0);
  const restRate = restInterviews / restApps;
  if (best.interviewRate! <= restRate) return null;
  return {
    kind,
    title: `Strongest observed ${noun}: ${best.label}`,
    finding: `${best.label} had a ${pct(best.interviewRate)} interview rate across ${plural(best.applications, 'application')}, compared with ${pct(restRate)} across ${plural(restApps, 'application')} in your other ${noun}s with enough data.`,
    sampleSize: best.applications + restApps,
    confidence: confidenceFor(Math.min(best.applications, restApps)),
  };
}

const resumeLabel = (r: ResumeVersionPerformance) => `“${r.resumeName}” v${r.versionNumber}`;

type ReportParts = Omit<CareerIntelligenceReport, 'patterns' | 'calculatedAt'>;

/** Deterministic, threshold-guarded findings. Outcome comparisons need enough submitted applications. */
export function buildPatterns(r: ReportParts): CareerPattern[] {
  const patterns: CareerPattern[] = [];
  const add = (p: CareerPattern | null) => p && patterns.push(p);
  const outcomes = r.limitations.sufficientForPatterns;
  const known = (rows: BreakdownRow[]) => rows.filter((row) => !row.key.startsWith('_'));

  if (outcomes) {
    add(strongest('STRONGEST_ROLE', 'role', known(r.breakdowns.role)));
    add(
      strongest(
        'STRONGEST_RESUME',
        'resume version',
        r.resumes.map((v) => ({ ...v, label: resumeLabel(v) })),
      ),
    );
    add(strongest('STRONGEST_SOURCE', 'source', known(r.breakdowns.source)));
    add(strongest('STRONGEST_LOCATION', 'location', known(r.breakdowns.location)));
    add(strongest('STRONGEST_WORK_MODE', 'work arrangement', known(r.breakdowns.workMode)));

    const buckets = r.matchScores.buckets.filter((b) => b.reliable && b.interviewRate !== null);
    if (buckets.length >= 2) {
      const low = buckets[0]!;
      const high = buckets[buckets.length - 1]!;
      add({
        kind: 'MATCH_OUTCOME_TREND',
        title: 'Interview rate by match score',
        finding: `Applications with match scores ${high.min}–${high.max} had a ${pct(high.interviewRate)} interview rate (${plural(high.applications, 'application')}); those with ${low.min}–${low.max} had ${pct(low.interviewRate)} (${plural(low.applications, 'application')}).`,
        sampleSize: high.applications + low.applications,
        confidence: confidenceFor(Math.min(high.applications, low.applications)),
      });
    }

    const weekdays = r.breakdowns.weekday;
    if (weekdays.length > 0) {
      const top = [...weekdays].sort((a, b) => b.applications - a.applications)[0]!;
      add({
        kind: 'APPLICATION_TIMING',
        title: 'When you apply',
        finding: `You submitted the most applications on ${top.label}s (${top.applications} of ${r.totals.submitted}).`,
        sampleSize: r.totals.submitted,
        confidence: confidenceFor(r.totals.submitted),
      });
    }
  }

  const scored = r.matchScores.buckets.reduce((s, b) => s + b.applications, 0);
  if (r.matchScores.alignedShare !== null && scored >= CAREER_MIN_GROUP_SIZE) {
    add({
      kind: 'MATCH_ALIGNMENT',
      title: 'How well your applications match your profile',
      finding: `${pct(r.matchScores.alignedShare)} of your ${scored} scored applications were to jobs where the resume you used scored 65 or higher.`,
      sampleSize: scored,
      confidence: confidenceFor(scored),
    });
  }

  const frequent = r.skills.filter((s) => s.jobs >= 3).slice(0, 5);
  if (frequent.length > 0) {
    add({
      kind: 'FREQUENT_SKILLS',
      title: 'Skills your target jobs ask for most',
      finding: `Across your ${plural(r.totals.analysedTargetJobs, 'analysed target job')}, the most frequent skills are ${frequent.map((s) => `${s.skill} (${s.jobs})`).join(', ')}.`,
      sampleSize: r.totals.analysedTargetJobs,
      confidence: confidenceFor(r.totals.analysedTargetJobs),
    });
  }

  const gaps = r.skills.filter((s) => s.isGap).slice(0, 5);
  if (gaps.length > 0) {
    add({
      kind: 'RECURRING_GAPS',
      title: 'Frequently requested skills with limited resume evidence',
      finding: gaps
        .map(
          (s) =>
            `${s.skill} appears in ${s.jobs} of your ${r.totals.analysedTargetJobs} analysed target jobs; your best-matching resume showed limited evidence for it in ${s.coverage.missing} of them`,
        )
        .join('. ')
        .concat('.'),
      sampleSize: Math.min(...gaps.map((s) => s.jobs)),
      confidence: confidenceFor(Math.min(...gaps.map((s) => s.jobs))),
    });
  }

  const weakTopics = r.interviewTopics.filter((t) => t.averageScore < 60).slice(0, 3);
  if (weakTopics.length > 0) {
    const sessions = Math.max(...weakTopics.map((t) => t.sessions));
    add({
      kind: 'INTERVIEW_TOPICS',
      title: 'Interview practice topics with the lowest practice scores',
      finding: `In your completed practice sessions, the lowest practice scores were for ${weakTopics.map((t) => `${t.topic} (${t.averageScore}/100)`).join(', ')}.`,
      sampleSize: sessions,
      confidence: confidenceFor(sessions),
    });
  }

  const recorded = r.funnel.rejectionCategories.filter((c) => c.category !== 'NOT_RECORDED');
  const recordedTotal = recorded.reduce((s, c) => s + c.count, 0);
  if (recordedTotal >= 3) {
    const top = [...recorded].sort((a, b) => b.count - a.count)[0]!;
    add({
      kind: 'REJECTION_CATEGORIES',
      title: 'Most common recorded rejection reason',
      finding: `Of the ${recordedTotal} rejections with a recorded reason, ${top.count} were “${REJECTION_CATEGORY_LABELS[top.category as keyof typeof REJECTION_CATEGORY_LABELS]}”.`,
      sampleSize: recordedTotal,
      confidence: confidenceFor(recordedTotal),
    });
  }
  return patterns;
}
