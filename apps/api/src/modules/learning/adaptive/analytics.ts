import {
  ACCURACY_MIN_QUESTIONS,
  type LearningAnalytics,
  type LearningRole,
  type ReadinessOverview,
  SKILL_EVIDENCE_MIN_QUESTIONS,
  type SkillAssessment,
} from '@job-assist/shared';
import type { AttemptRecord } from './revision.js';

const RECENT_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

export interface AnalyticsInput {
  now: Date;
  startedCourseIds: Set<string>;
  completedCourseIds: Set<string>;
  completions: { courseId: string; lessonId: string; completedAt: Date; minutes: number }[];
  attempts: AttemptRecord[];
  diagnostics: { completedAt: Date }[];
  interviewAttempts: { questionId: string; createdAt: Date }[];
  skillEvidence: { skillId: string; total: number }[];
  /** Skills in the user's courses and target role. */
  relevantSkillIds: Set<string>;
  revision: { due: number; scheduled: number };
  projects: ReadinessOverview['projects'];
  targetRole: LearningRole | null;
  roleSkills: SkillAssessment[];
  weeklyGoalMinutes: number | null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Start of the current week (Monday 00:00 UTC). */
export function weekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - offset * DAY);
}

/**
 * Learning analytics (ADR-0024), calculated only from persisted records. Accuracy uses each
 * question's first attempt (retries cannot inflate it) and is withheld below
 * ACCURACY_MIN_QUESTIONS different questions. No streaks and no combined score.
 */
export function buildAnalytics(input: AnalyticsInput): LearningAnalytics {
  const graded = input.attempts.filter((a) => a.correct !== null);
  const firstByActivity = new Map<string, AttemptRecord>();
  for (const a of [...graded].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) {
    const key = `${a.courseId}/${a.activityId}`;
    if (!firstByActivity.has(key)) firstByActivity.set(key, a);
  }
  const firstTries = [...firstByActivity.values()];
  const firstCorrect = firstTries.filter((a) => a.correct === true).length;
  const enough = firstTries.length >= ACCURACY_MIN_QUESTIONS;

  const since = input.now.getTime() - RECENT_DAYS * DAY;
  const days = new Map<string, LearningAnalytics['recentActivity'][number]>();
  const bump = (
    d: Date,
    field: 'lessonsCompleted' | 'practiceAnswers' | 'diagnostics' | 'interviewAnswers',
  ) => {
    if (d.getTime() < since) return;
    const key = isoDay(d);
    const entry = days.get(key) ?? {
      date: key,
      lessonsCompleted: 0,
      practiceAnswers: 0,
      diagnostics: 0,
      interviewAnswers: 0,
    };
    entry[field] += 1;
    days.set(key, entry);
  };
  input.completions.forEach((c) => bump(c.completedAt, 'lessonsCompleted'));
  graded.forEach((a) => bump(a.createdAt, 'practiceAnswers'));
  input.diagnostics.forEach((d) => bump(d.completedAt, 'diagnostics'));
  input.interviewAttempts.forEach((i) => bump(i.createdAt, 'interviewAnswers'));

  const allDates = [
    ...input.completions.map((c) => c.completedAt),
    ...input.attempts.map((a) => a.createdAt),
    ...input.diagnostics.map((d) => d.completedAt),
    ...input.interviewAttempts.map((i) => i.createdAt),
  ];
  const lastActive = allDates.reduce<Date | null>((max, d) => (!max || d > max ? d : max), null);

  const evidenced = new Set(input.skillEvidence.map((e) => e.skillId));
  const monday = weekStart(input.now);

  return {
    courses: { started: input.startedCourseIds.size, completed: input.completedCourseIds.size },
    lessonsCompleted: input.completions.length,
    recentActivity: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
    lastActiveAt: lastActive?.toISOString() ?? null,
    practice: {
      attempts: graded.length,
      questionsAnswered: firstTries.length,
      firstTry: { correct: firstCorrect, total: firstTries.length },
      firstTryAccuracy: enough ? Math.round((100 * firstCorrect) / firstTries.length) : null,
      note: enough
        ? 'Based on the first answer to each question, so retries do not change it.'
        : `Answer at least ${ACCURACY_MIN_QUESTIONS} different practice questions to see an accuracy figure (${firstTries.length} so far).`,
    },
    revision: input.revision,
    skills: {
      measured: input.skillEvidence.filter((e) => e.total >= SKILL_EVIDENCE_MIN_QUESTIONS).length,
      tooFewQuestions: input.skillEvidence.filter((e) => e.total < SKILL_EVIDENCE_MIN_QUESTIONS)
        .length,
      unknown: [...input.relevantSkillIds].filter((id) => !evidenced.has(id)).length,
    },
    plan: input.targetRole
      ? {
          role: input.targetRole,
          coreSkills: input.roleSkills.length,
          measured: input.roleSkills.filter((s) => s.proficiency.source === 'ASSESSMENT').length,
          demonstrated: input.roleSkills.filter(
            (s) => s.proficiency.level === 'FOUNDATIONS_DEMONSTRATED',
          ).length,
        }
      : null,
    interview: {
      attempts: input.interviewAttempts.length,
      questions: new Set(input.interviewAttempts.map((i) => i.questionId)).size,
    },
    projects: {
      started: input.projects.length,
      completed: input.projects.filter((p) => p.status === 'COMPLETED').length,
    },
    week: {
      goalMinutes: input.weeklyGoalMinutes,
      estimatedMinutes: input.completions
        .filter((c) => c.completedAt >= monday)
        .reduce((sum, c) => sum + c.minutes, 0),
    },
  };
}
