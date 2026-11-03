import { type AnalyticsInput, buildAnalytics, weekStart } from './analytics.js';
import type { AttemptRecord } from './revision.js';

const NOW = new Date('2026-10-21T12:00:00.000Z'); // a Wednesday
const daysBefore = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60_000);
const attempt = (
  activityId: string,
  correct: boolean,
  createdAt = daysBefore(1),
): AttemptRecord => ({
  courseId: 'sql-fundamentals',
  lessonId: 'sql-joins',
  activityId,
  correct,
  createdAt,
});
const input = (overrides: Partial<AnalyticsInput> = {}): AnalyticsInput => ({
  now: NOW,
  startedCourseIds: new Set(),
  completedCourseIds: new Set(),
  completions: [],
  attempts: [],
  diagnostics: [],
  interviewAttempts: [],
  skillEvidence: [],
  relevantSkillIds: new Set(),
  revision: { due: 0, scheduled: 0 },
  projects: [],
  targetRole: null,
  roleSkills: [],
  weeklyGoalMinutes: null,
  ...overrides,
});

describe('buildAnalytics', () => {
  it('returns honest empty values for a new user', () => {
    const a = buildAnalytics(input());
    expect(a).toMatchObject({
      courses: { started: 0, completed: 0 },
      lessonsCompleted: 0,
      recentActivity: [],
      lastActiveAt: null,
      practice: { attempts: 0, questionsAnswered: 0, firstTryAccuracy: null },
      plan: null,
      week: { goalMinutes: null, estimatedMinutes: 0 },
    });
    expect(a.practice.note).toContain('at least 5 different practice questions');
  });

  it('withholds accuracy below 5 different questions and uses first tries only', () => {
    const four = ['q1', 'q2', 'q3', 'q4'].map((id) => attempt(id, true));
    expect(buildAnalytics(input({ attempts: four })).practice.firstTryAccuracy).toBeNull();

    // One question answered ten times is still one question.
    const repeated = Array.from({ length: 10 }, (_, i) =>
      attempt('q1', i > 0, daysBefore(1 - i / 100)),
    );
    const r = buildAnalytics(input({ attempts: repeated })).practice;
    expect(r).toMatchObject({
      attempts: 10,
      questionsAnswered: 1,
      firstTry: { correct: 0, total: 1 },
      firstTryAccuracy: null,
    });

    const five = [
      attempt('q1', false, daysBefore(3)),
      attempt('q1', true, daysBefore(2)), // a retry does not change first-try accuracy
      ...['q2', 'q3', 'q4', 'q5'].map((id) => attempt(id, true)),
    ];
    expect(buildAnalytics(input({ attempts: five })).practice).toMatchObject({
      attempts: 6,
      questionsAnswered: 5,
      firstTry: { correct: 4, total: 5 },
      firstTryAccuracy: 80,
    });
  });

  it('separates lessons completed from questions attempted, and groups recent activity by day', () => {
    const a = buildAnalytics(
      input({
        completions: [
          {
            courseId: 'sql-fundamentals',
            lessonId: 'sql-joins',
            completedAt: daysBefore(1),
            minutes: 30,
          },
        ],
        attempts: [attempt('q1', true), attempt('q2', false), attempt('q3', true, daysBefore(20))],
        diagnostics: [{ completedAt: daysBefore(2) }],
      }),
    );
    expect(a.lessonsCompleted).toBe(1);
    expect(a.practice.attempts).toBe(3);
    expect(a.recentActivity).toEqual([
      {
        date: '2026-10-20',
        lessonsCompleted: 1,
        practiceAnswers: 2,
        diagnostics: 0,
        interviewAnswers: 0,
      },
      {
        date: '2026-10-19',
        lessonsCompleted: 0,
        practiceAnswers: 0,
        diagnostics: 1,
        interviewAnswers: 0,
      },
    ]);
  });

  it('counts measured, too-few-questions and unknown skills, and role progress only with a role', () => {
    const a = buildAnalytics(
      input({
        skillEvidence: [
          { skillId: 'sql', total: 6 },
          { skillId: 'postgresql', total: 1 },
        ],
        relevantSkillIds: new Set(['sql', 'postgresql', 'data-modelling', 'python']),
        targetRole: 'DATA_ANALYST',
        roleSkills: [
          { proficiency: { level: 'FOUNDATIONS_DEMONSTRATED', source: 'ASSESSMENT', basis: '' } },
          { proficiency: { level: 'UNKNOWN', source: 'NONE', basis: '' } },
        ] as never,
      }),
    );
    expect(a.skills).toEqual({ measured: 1, tooFewQuestions: 1, unknown: 2 });
    expect(a.plan).toEqual({ role: 'DATA_ANALYST', coreSkills: 2, measured: 1, demonstrated: 1 });
  });

  it('estimates this week from lessons completed since Monday, with an optional goal', () => {
    expect(weekStart(NOW).toISOString()).toBe('2026-10-19T00:00:00.000Z');
    const a = buildAnalytics(
      input({
        weeklyGoalMinutes: 120,
        completions: [
          { courseId: 'c', lessonId: 'l1', completedAt: daysBefore(1), minutes: 30 },
          { courseId: 'c', lessonId: 'l2', completedAt: daysBefore(5), minutes: 45 },
        ],
      }),
    );
    expect(a.week).toEqual({ goalMinutes: 120, estimatedMinutes: 30 });
  });
});
