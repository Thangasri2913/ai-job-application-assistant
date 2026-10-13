import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type BreakdownDimension,
  type BreakdownRow,
  CAREER_MIN_APPLICATIONS_FOR_PATTERNS,
  CAREER_MIN_GROUP_SIZE,
  CAREER_MIN_SKILL_JOBS,
  type CareerFunnel,
  type CareerIntelligenceReport,
  type CareerTotals,
  type DataLimitations,
  FUNNEL_STAGE_LABELS,
  FUNNEL_STAGES,
  type FunnelStage,
  type InterviewTopicRow,
  MATCH_SCORE_BUCKETS,
  type MatchScorePerformance,
  REJECTION_CATEGORIES,
  type ResumeVersionPerformance,
  SENIORITY_LABELS,
  type SkillCoverageLevel,
  type SkillIntelligenceRow,
  WORK_MODE_LABELS,
} from '@job-assist/shared';
import { normalizeSkillName, skillKey } from '../../../common/skills/skill-normalization.js';
import {
  normalizeCompany,
  normalizeLocation,
  normalizeTitle,
} from '../../job-discovery/pipeline/dedup.js';
import { highestRank, isSubmitted, outcomeMetrics, RANK, rate } from './metrics.js';
import { buildPatterns } from './patterns.js';
import type { ApplicationRecord, CareerData } from './types.js';

/** Bump when a definition changes, so stored insights know which rules produced them. */
export const ANALYTICS_VERSION = 'career-analytics@1';

const FUNNEL_RANK: Record<FunnelStage, number> = {
  SAVED: 0,
  APPLIED: RANK.APPLIED,
  SCREENING: RANK.SCREENING,
  INTERVIEW: RANK.INTERVIEW,
  FINAL_INTERVIEW: RANK.FINAL_INTERVIEW,
  OFFER: RANK.OFFER,
  ACCEPTED: RANK.ACCEPTED,
};

const FINAL_STATUSES: ApplicationStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'NO_RESPONSE'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const zeroByStatus = () =>
  Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;

// ── Funnel ──

export function buildFunnel(applications: ApplicationRecord[]): CareerFunnel {
  const ranks = applications.map(highestRank);
  let previous: number | null = null;
  const stages = FUNNEL_STAGES.map((stage) => {
    const count = ranks.filter((r) => r >= FUNNEL_RANK[stage]).length;
    const conversionFromPrevious = previous === null ? null : rate(count, previous);
    previous = count;
    return { stage, label: FUNNEL_STAGE_LABELS[stage], count, conversionFromPrevious };
  });
  const everReached = zeroByStatus();
  const current = zeroByStatus();
  for (const a of applications) {
    for (const s of new Set(a.reached)) everReached[s]++;
    current[a.status]++;
  }
  const rejected = applications.filter((a) => a.status === 'REJECTED');
  const rejectionCategories = [
    ...REJECTION_CATEGORIES.map((category) => ({
      category,
      count: rejected.filter((a) => a.rejectionCategory === category).length,
    })),
    {
      category: 'NOT_RECORDED' as const,
      count: rejected.filter((a) => !a.rejectionCategory).length,
    },
  ].filter((r) => r.count > 0);
  return { stages, everReached, current, rejectionCategories };
}

// ── Breakdowns ──

interface GroupKey {
  key: string;
  label: string;
}

/** Groups submitted applications (an application may fall in several groups, e.g. skills). */
export function breakdown(
  applications: ApplicationRecord[],
  keysOf: (a: ApplicationRecord) => GroupKey[],
  order: 'size' | 'key' = 'size',
): BreakdownRow[] {
  const groups = new Map<string, { label: string; apps: ApplicationRecord[] }>();
  for (const a of applications.filter(isSubmitted)) {
    for (const { key, label } of keysOf(a)) {
      const group = groups.get(key) ?? { label, apps: [] };
      group.apps.push(a);
      groups.set(key, group);
    }
  }
  const rows = [...groups.entries()].map(([key, g]) => ({
    key,
    label: g.label,
    ...outcomeMetrics(g.apps),
  }));
  return rows.sort((a, b) =>
    order === 'key'
      ? a.key.localeCompare(b.key)
      : b.applications - a.applications || a.label.localeCompare(b.label),
  );
}

const one = (key: string, label: string): GroupKey[] => [{ key, label }];
const notRecorded = one('_none', 'Not recorded');

export function buildBreakdowns(
  applications: ApplicationRecord[],
): Record<BreakdownDimension, BreakdownRow[]> {
  return {
    period: breakdown(
      applications,
      (a) => {
        const d = a.appliedAt ?? a.createdAt;
        return one(d.toISOString().slice(0, 7), MONTH.format(d));
      },
      'key',
    ),
    source: breakdown(applications, (a) =>
      a.source?.trim() ? one(a.source.trim().toLowerCase(), a.source.trim()) : notRecorded,
    ),
    role: breakdown(applications, (a) => one(normalizeTitle(a.jobTitle), a.jobTitle)),
    company: breakdown(applications, (a) => one(normalizeCompany(a.companyName), a.companyName)),
    location: breakdown(applications, (a) => {
      if (a.location?.trim()) return one(normalizeLocation(a.location), a.location.trim());
      return a.workMode === 'REMOTE' ? one('_remote', 'Remote') : one('_none', 'Not specified');
    }),
    workMode: breakdown(applications, (a) =>
      a.workMode ? one(a.workMode, WORK_MODE_LABELS[a.workMode]) : one('_none', 'Not specified'),
    ),
    seniority: breakdown(applications, (a) =>
      a.seniority ? one(a.seniority, SENIORITY_LABELS[a.seniority]) : one('_none', 'Not stated'),
    ),
    skill: breakdown(applications, (a) =>
      [...new Map(a.requiredSkills.map((s) => [skillKey(s), normalizeSkillName(s)]))].map(
        ([key, label]) => ({ key, label }),
      ),
    ),
    weekday: breakdown(
      applications.filter((a) => a.appliedAt !== null),
      (a) => {
        const day = a.appliedAt!.getUTCDay();
        return one(String(day), WEEKDAYS[day]!);
      },
      'key',
    ),
  };
}

// ── Resume versions ──

export function buildResumePerformance(data: CareerData): ResumeVersionPerformance[] {
  const byVersion = new Map(data.resumeVersions.map((v) => [v.resumeVersionId, v]));
  for (const a of data.applications) {
    if (!byVersion.has(a.resume.resumeVersionId))
      byVersion.set(a.resume.resumeVersionId, {
        ...a.resume,
        jobsMatched: 0,
        averageMatchScore: null,
      });
  }
  return [...byVersion.values()]
    .map((v) => ({
      ...v,
      ...outcomeMetrics(
        data.applications.filter((a) => a.resume.resumeVersionId === v.resumeVersionId),
      ),
    }))
    .filter((v) => v.applications > 0 || (v.isCurrent && !v.resumeArchived))
    .sort(
      (a, b) =>
        b.applications - a.applications ||
        a.resumeName.localeCompare(b.resumeName) ||
        b.versionNumber - a.versionNumber,
    );
}

// ── Match scores ──

export function buildMatchScores(applications: ApplicationRecord[]): MatchScorePerformance {
  const submitted = applications.filter(isSubmitted);
  const scored = submitted.filter((a) => a.matchScore !== null);
  return {
    buckets: MATCH_SCORE_BUCKETS.map((b) => ({
      key: b.key,
      min: b.min,
      max: b.max,
      ...outcomeMetrics(scored.filter((a) => a.matchScore! >= b.min && a.matchScore! <= b.max)),
    })).filter((b) => b.applications > 0),
    unscored: submitted.length - scored.length,
    alignedShare: rate(scored.filter((a) => a.matchScore! >= 65).length, scored.length),
  };
}

// ── Skills ──

const coverageLevel = (matched: number, partial: number, missing: number): SkillCoverageLevel => {
  const compared = matched + partial + missing;
  if (compared === 0) return 'LIMITED';
  if (missing / compared >= 0.5) return 'LIMITED';
  if (matched / compared >= 0.6) return 'STRONG';
  return 'PARTIAL';
};

export function buildSkills(data: CareerData, limit = 25): SkillIntelligenceRow[] {
  const skills = new Map<
    string,
    {
      name: string;
      jobs: number;
      requiredIn: number;
      matched: number;
      partial: number;
      missing: number;
    }
  >();
  for (const job of data.targetJobs) {
    // One vote per job and skill (a job may list a skill as required and preferred).
    const perJob = new Map<string, (typeof job.skills)[number]>();
    for (const s of job.skills) {
      const key = skillKey(s.name);
      const existing = perJob.get(key);
      if (!existing || (existing.importance === 'PREFERRED' && s.importance === 'REQUIRED'))
        perJob.set(key, s);
    }
    for (const [key, s] of perJob) {
      const row = skills.get(key) ?? {
        name: normalizeSkillName(s.name),
        jobs: 0,
        requiredIn: 0,
        matched: 0,
        partial: 0,
        missing: 0,
      };
      row.jobs++;
      if (s.importance === 'REQUIRED') row.requiredIn++;
      if (s.status === 'MATCH') row.matched++;
      else if (s.status === 'PARTIAL') row.partial++;
      else if (s.status === 'MISSING') row.missing++;
      skills.set(key, row);
    }
  }
  return [...skills.entries()]
    .map(([key, s]): SkillIntelligenceRow => {
      const compared = s.matched + s.partial + s.missing;
      const level = coverageLevel(s.matched, s.partial, s.missing);
      return {
        skill: s.name,
        jobs: s.jobs,
        requiredIn: s.requiredIn,
        coverage: { matched: s.matched, partial: s.partial, missing: s.missing },
        coverageLevel: level,
        outcomes: outcomeMetrics(
          data.applications.filter((a) => a.requiredSkills.some((r) => skillKey(r) === key)),
        ),
        isGap: s.jobs >= CAREER_MIN_SKILL_JOBS && compared > 0 && level === 'LIMITED',
      };
    })
    .sort(
      (a, b) => b.jobs - a.jobs || b.requiredIn - a.requiredIn || a.skill.localeCompare(b.skill),
    )
    .slice(0, limit);
}

// ── Interview practice ──

export function buildInterviewTopics(data: CareerData, limit = 10): InterviewTopicRow[] {
  const topics = new Map<string, { label: string; total: number; sessions: number }>();
  for (const session of data.interviewSessions) {
    for (const t of session.topics) {
      const key = t.topic.trim().toLowerCase();
      if (!key) continue;
      const row = topics.get(key) ?? { label: t.topic.trim(), total: 0, sessions: 0 };
      row.total += t.score;
      row.sessions++;
      topics.set(key, row);
    }
  }
  return [...topics.values()]
    .map((t) => ({
      topic: t.label,
      averageScore: Math.round(t.total / t.sessions),
      sessions: t.sessions,
    }))
    .sort((a, b) => a.averageScore - b.averageScore || b.sessions - a.sessions)
    .slice(0, limit);
}

// ── Totals and limitations ──

export function buildTotals(data: CareerData): CareerTotals {
  const submitted = data.applications.filter(isSubmitted);
  return {
    tracked: data.applications.length,
    submitted: submitted.length,
    notSubmitted: data.applications.length - submitted.length,
    inProgress: submitted.filter((a) => !FINAL_STATUSES.includes(a.status)).length,
    analysedTargetJobs: data.targetJobs.length,
    outcomes: outcomeMetrics(data.applications),
  };
}

export function buildLimitations(
  totals: CareerTotals,
  matchScores: MatchScorePerformance,
): DataLimitations {
  const n = totals.submitted;
  const messages: string[] = [];
  if (totals.tracked === 0) {
    messages.push(
      'You haven’t tracked any applications yet. Outcome analytics appear once you track applications and record their outcomes.',
    );
  } else if (n === 0) {
    messages.push(
      'None of your tracked applications has been marked as applied yet, so there are no outcomes to analyse.',
    );
  } else if (n < CAREER_MIN_APPLICATIONS_FOR_PATTERNS) {
    messages.push(
      `You have ${n} submitted application${n === 1 ? '' : 's'}. At least ${CAREER_MIN_APPLICATIONS_FOR_PATTERNS} are needed before reliable performance patterns can be identified; until then counts are shown without comparisons.`,
    );
  }
  if (n > 0 && totals.inProgress === n) {
    messages.push(
      'No final outcomes are recorded yet: every submitted application is still in progress.',
    );
  }
  if (matchScores.unscored > 0) {
    messages.push(
      `${matchScores.unscored} submitted application${matchScores.unscored === 1 ? ' has' : 's have'} no stored match score (the job wasn’t analysed when the application was created) and ${matchScores.unscored === 1 ? 'is' : 'are'} left out of the match-score analysis.`,
    );
  }
  if (totals.analysedTargetJobs === 0) {
    messages.push('No analysed jobs yet: skill intelligence appears once jobs are analysed.');
  }
  messages.push(
    `Groups with fewer than ${CAREER_MIN_GROUP_SIZE} applications are shown, but are marked as limited data and never compared.`,
  );
  return {
    submitted: n,
    minimumForPatterns: CAREER_MIN_APPLICATIONS_FOR_PATTERNS,
    minimumGroupSize: CAREER_MIN_GROUP_SIZE,
    sufficientForPatterns: n >= CAREER_MIN_APPLICATIONS_FOR_PATTERNS,
    messages,
  };
}

/** The complete report, computed from stored data only. */
export function buildReport(data: CareerData, now: Date): CareerIntelligenceReport {
  const totals = buildTotals(data);
  const funnel = buildFunnel(data.applications);
  const breakdowns = buildBreakdowns(data.applications);
  const resumes = buildResumePerformance(data);
  const matchScores = buildMatchScores(data.applications);
  const skills = buildSkills(data);
  const interviewTopics = buildInterviewTopics(data);
  const limitations = buildLimitations(totals, matchScores);
  return {
    totals,
    funnel,
    breakdowns,
    resumes,
    matchScores,
    skills,
    interviewTopics,
    patterns: buildPatterns({
      totals,
      funnel,
      breakdowns,
      resumes,
      matchScores,
      skills,
      interviewTopics,
      limitations,
    }),
    limitations,
    calculatedAt: now.toISOString(),
  };
}
