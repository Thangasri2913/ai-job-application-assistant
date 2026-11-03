import type {
  CourseDetail,
  CourseProgress,
  LearningPreferences,
  RevisionQueueResponse,
  RevisionTopic,
  SkillAssessment,
} from '@job-assist/shared';
import { LearningService } from '../learning.service.js';
import { type NextStepsInput, rankNextSteps } from './next-steps.js';

const catalogue = new LearningService();
const course = (id: string) => catalogue.index.courseById.get(id)!;

const emptyQueue: RevisionQueueResponse = {
  topics: [],
  dueCount: 0,
  scheduledCount: 0,
  resolvedCount: 0,
  method: '',
};
const topic = (overrides: Partial<RevisionTopic> = {}): RevisionTopic => ({
  key: 'lesson:sql-fundamentals:sql-joins',
  kind: 'PRACTICE',
  title: 'Joins',
  courseId: 'sql-fundamentals',
  lessonId: 'sql-joins',
  interviewQuestionId: null,
  skillNames: ['SQL'],
  reason:
    'You answered 2 questions in this lesson incorrectly (3 incorrect attempts across 2 visits).',
  due: true,
  dueAt: null,
  mistakeSessions: 2,
  activities: [],
  ...overrides,
});
const progress = (c: CourseDetail, completed: string[] = []): CourseProgress => {
  const lessons = c.modules.flatMap((m) => m.lessons);
  const next = lessons.find((l) => !completed.includes(l.id));
  return {
    courseId: c.id,
    enrolled: true,
    enrolledAt: '2026-10-18T10:00:00.000Z',
    lessonCount: lessons.length,
    completedLessonIds: completed,
    remainingMinutes: 0,
    latestDiagnostic: null,
    skimLessonIds: [],
    activities: [],
    nextLesson: next
      ? { courseId: c.id, lessonId: next.id, lessonTitle: next.title, moduleTitle: '' }
      : null,
    lastActivityAt: null,
  };
};
const prefs = (overrides: Partial<LearningPreferences> = {}): LearningPreferences => ({
  targetRole: null,
  interestCategories: [],
  interestSkillIds: [],
  weeklyGoalMinutes: null,
  dismissedSteps: [],
  updatedAt: null,
  ...overrides,
});
const skill = (skillId: string, overrides: Partial<SkillAssessment> = {}): SkillAssessment => ({
  skillId,
  name: catalogue.index.skillById.get(skillId)!.name,
  coreForRole: true,
  resumeEvidence: [],
  evidenceStrength: 'NONE',
  proficiency: { level: 'UNKNOWN', source: 'NONE', basis: 'Not assessed.' },
  confidence: 'LOW',
  uncertainty: 'No resume selected.',
  userCorrection: null,
  basis: 'UNKNOWN',
  gap: true,
  nextStep: { kind: 'START_COURSE', courseId: null, text: '' },
  ...overrides,
});

const input = (overrides: Partial<NextStepsInput> = {}): NextStepsInput => ({
  revision: emptyQueue,
  projects: [],
  enrolled: [],
  courses: catalogue.index.courses,
  completedCourseIds: new Set(),
  startedCourseIds: new Set(),
  preferences: null,
  roleSkills: [],
  jobSkills: [],
  analysedJobs: 0,
  dismissedKeys: new Set(),
  ...overrides,
});

describe('rankNextSteps', () => {
  it('gives a new user a general, low-confidence starting point without asking for personal data', () => {
    const { steps } = rankNextSteps(input());
    expect(steps.map((s) => s.kind)).toEqual(['START_HERE', 'START_HERE']);
    expect(steps[0]).toMatchObject({
      title: 'Start with JavaScript essentials',
      confidence: 'LOW',
      href: '/learn/courses/javascript-essentials',
    });
    expect(steps[0]!.reason).toContain('You do not need a resume or a target role');
    expect(steps[1]).toMatchObject({
      key: 'start:preferences',
      href: '/learn/my-learning#learning-preferences',
    });
  });

  it('ranks in a fixed order: revision, project, lesson, diagnostic, role skill, job skill', () => {
    const sql = course('sql-fundamentals');
    const js = course('javascript-essentials');
    const { steps } = rankNextSteps(
      input({
        revision: { ...emptyQueue, topics: [topic()], dueCount: 1 },
        projects: [
          {
            challengeId: 'pc-sql-job-search-analytics',
            title: 'SQL analytics',
            status: 'IN_PROGRESS',
            checked: 2,
            total: 5,
            updatedAt: null,
          },
        ],
        enrolled: [
          { course: sql, progress: progress(sql, ['sql-select-and-filter']) },
          { course: js, progress: progress(js) },
        ],
        startedCourseIds: new Set(['sql-fundamentals', 'javascript-essentials']),
        preferences: prefs({ targetRole: 'QA_TESTER' }),
        roleSkills: [skill('software-testing')],
        jobSkills: [{ skillId: 'nodejs', name: 'Node.js', postings: 2, requiredIn: 1 }],
        analysedJobs: 3,
      }),
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'REVISE_TOPIC',
      'CONTINUE_PROJECT',
      'CONTINUE_LESSON',
      'CONTINUE_LESSON',
      'TAKE_DIAGNOSTIC',
      'PRACTISE_ROLE_SKILL',
      'PRACTISE_JOB_SKILL',
    ]);
    expect(steps.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(steps[0]).toMatchObject({
      confidence: 'HIGH',
      href: '/learn/revision?topic=lesson%3Asql-fundamentals%3Asql-joins',
    });
    expect(steps[1]!.reason).toBe(
      'You started this project and have ticked 2 of 5 acceptance criteria.',
    );
    expect(steps[2]!.reason).toBe(
      'You completed "SELECT, WHERE and ORDER BY", the lesson before it in SQL fundamentals.',
    );
    expect(steps[3]!.reason).toContain('first lesson to study in JavaScript essentials');
    expect(steps[4]!.reason).toContain('establish your current level');
  });

  it('ranks weaker revision evidence (interview gaps, single diagnostic answers) after lessons', () => {
    const sql = course('sql-fundamentals');
    const interview = topic({
      kind: 'INTERVIEW',
      key: 'interview:iq-sql-joins',
      title: 'Explain joins',
      mistakeSessions: 1,
    });
    const { steps } = rankNextSteps(
      input({
        revision: { ...emptyQueue, topics: [interview], dueCount: 1 },
        enrolled: [{ course: sql, progress: progress(sql, ['sql-select-and-filter']) }],
        startedCourseIds: new Set(['sql-fundamentals']),
      }),
    );
    expect(steps.slice(0, 2).map((s) => s.kind)).toEqual(['CONTINUE_LESSON', 'REVISE_TOPIC']);
    expect(steps[1]).toMatchObject({ title: 'Revise for "Explain joins"', confidence: 'LOW' });
    expect(steps[1]!.evidence[0]).toContain('keyword-based');
  });

  it('explains role skills honestly, uses resume evidence and respects the user’s correction', () => {
    const { steps } = rankNextSteps(
      input({
        preferences: prefs({ targetRole: 'DATA_ANALYST' }),
        roleSkills: [
          skill('sql', {
            evidenceStrength: 'APPLIED',
            basis: 'RESUME_EVIDENCE',
            uncertainty: 'Your resume shows the skill used.',
          }),
          skill('python', { userCorrection: 'HAS_SKILL', basis: 'USER_CORRECTED', gap: false }),
        ],
      }),
    );
    const sql = steps.find((s) => s.key === 'role:DATA_ANALYST:sql')!;
    expect(sql).toMatchObject({
      title: 'Check your SQL level',
      href: '/learn/courses/sql-fundamentals/diagnostic',
      confidence: 'MEDIUM',
    });
    expect(sql.reason).toBe(
      'SQL is a core skill for Data Analyst, your target role, and it has not been measured yet. Your resume shows it used in experience; a diagnostic would confirm the fundamentals.',
    );
    expect(sql.evidence[0]).toContain('curated list, not market statistics');
    expect(steps.some((s) => s.key.includes('python'))).toBe(false);
  });

  it('describes measured but developing skills with the assessment result', () => {
    const { steps } = rankNextSteps(
      input({
        preferences: prefs({ targetRole: 'DATA_ANALYST' }),
        roleSkills: [
          skill('sql', {
            basis: 'MEASURED',
            proficiency: {
              level: 'FOUNDATIONS_DEVELOPING',
              source: 'ASSESSMENT',
              basis: '2 of 6 correct in the SQL fundamentals diagnostic.',
            },
          }),
        ],
        startedCourseIds: new Set(['sql-fundamentals']),
      }),
    );
    expect(steps[0]).toMatchObject({ title: 'Practise SQL', confidence: 'HIGH' });
    expect(steps[0]!.reason).toContain('2 of 6 correct');
  });

  it('suggests job skills from real analysed jobs, with confidence that reflects the sample size', () => {
    const { steps } = rankNextSteps(
      input({
        jobSkills: [{ skillId: 'react', name: 'React', postings: 1, requiredIn: 1 }],
        analysedJobs: 1,
      }),
    );
    expect(steps[0]).toMatchObject({ kind: 'PRACTISE_JOB_SKILL', confidence: 'LOW' });
    expect(steps[0]!.reason).toBe('React appears in 1 job you analysed (1 as required).');
  });

  it('suggests a course once its prerequisites are complete, and courses matching interests', () => {
    const { steps } = rankNextSteps(
      input({
        completedCourseIds: new Set(['javascript-essentials', 'sql-fundamentals']),
        startedCourseIds: new Set(['javascript-essentials', 'sql-fundamentals']),
        preferences: prefs({ interestCategories: ['AI_AND_MACHINE_LEARNING'] }),
      }),
    );
    expect(steps.find((s) => s.kind === 'START_NEXT_COURSE')).toMatchObject({
      title: 'Start Backend Developer',
      reason:
        'You completed JavaScript essentials and SQL fundamentals, which this course builds on.',
    });
    expect(steps.find((s) => s.kind === 'EXPLORE_INTEREST')).toMatchObject({
      title: 'Explore Generative AI fundamentals',
      reason: 'Matches your interest in ai and machine learning.',
    });
  });

  it('gives low confidence to thin evidence and hides dismissed suggestions', () => {
    const revision = {
      ...emptyQueue,
      topics: [
        topic({
          kind: 'DIAGNOSTIC',
          key: 'diagnostic:sql-fundamentals:sql-joins',
          mistakeSessions: 1,
        }),
      ],
    };
    let result = rankNextSteps(input({ revision }));
    expect(result.steps[0]).toMatchObject({ kind: 'REVISE_TOPIC', confidence: 'LOW' });
    result = rankNextSteps(
      input({ revision, dismissedKeys: new Set(['revise:diagnostic:sql-fundamentals:sql-joins']) }),
    );
    expect(result.steps.some((s) => s.kind === 'REVISE_TOPIC')).toBe(false);
    expect(result.dismissedCount).toBe(1);
  });

  it('is deterministic', () => {
    const args = input({
      preferences: prefs({ targetRole: 'FRONTEND_DEVELOPER' }),
      roleSkills: [skill('html'), skill('css')],
    });
    expect(rankNextSteps(args)).toEqual(rankNextSteps(args));
  });
});
