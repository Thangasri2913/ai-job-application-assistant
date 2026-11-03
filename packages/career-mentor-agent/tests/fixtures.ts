import type {
  AnalysedJobRef,
  CourseDetail,
  JobReadinessResponse,
  LearningAnalytics,
  LearningPreferences,
  NextStep,
  SkillAssessment,
} from '@job-assist/shared';
import { vi } from 'vitest';
import type {
  CatalogueSnapshot,
  LearningSnapshot,
  MentorModel,
  MentorToolPort,
} from '../src/index.js';

/** A small catalogue with the same shape the host provides. */
const course = (
  id: string,
  title: string,
  skills: { id: string; name: string }[],
  lessons: { id: string; title: string }[],
  overrides: Partial<CourseDetail> = {},
): CourseDetail =>
  ({
    id,
    title,
    description: `${title} course.`,
    format: 'COURSE',
    category: 'SOFTWARE_DEVELOPMENT',
    roles: [],
    skills,
    difficulty: 'BEGINNER',
    levels: null,
    status: 'PUBLISHED',
    outcomes: [],
    prerequisites: [],
    prerequisiteCourseIds: [],
    moduleCount: 1,
    lessonCount: lessons.length,
    activityCount: 0,
    hasDiagnostic: true,
    estimatedHours: 4,
    provenance: { origin: 'ORIGINAL', review: { status: 'UNREVIEWED' } },
    lastReviewedOn: null,
    modules: [
      { id: `${id}-m1`, order: 1, lessons: lessons.map((l, i) => ({ ...l, order: i + 1 })) },
    ],
    ...overrides,
  }) as unknown as CourseDetail;

export const SKILLS = [
  { id: 'javascript', name: 'JavaScript', alsoKnownAs: ['JS', 'ECMAScript'] },
  { id: 'java', name: 'Java', alsoKnownAs: [] },
  { id: 'sql', name: 'SQL', alsoKnownAs: [] },
  { id: 'python', name: 'Python', alsoKnownAs: [] },
  { id: 'react', name: 'React', alsoKnownAs: ['ReactJS', 'React.js'] },
  { id: 'nodejs', name: 'Node.js', alsoKnownAs: ['Node', 'NodeJS'] },
  { id: 'data-analysis', name: 'Data Analysis', alsoKnownAs: ['Data Analytics'] },
  { id: 'cloud-computing', name: 'Cloud Computing', alsoKnownAs: ['AWS', 'Cloud'] },
];

export const CATALOGUE: CatalogueSnapshot = {
  courses: [
    course(
      'javascript-essentials',
      'JavaScript essentials',
      [{ id: 'javascript', name: 'JavaScript' }],
      [{ id: 'js-values', title: 'Values and types' }],
    ),
    course(
      'sql-fundamentals',
      'SQL fundamentals',
      [{ id: 'sql', name: 'SQL' }],
      [
        { id: 'sql-select-and-filter', title: 'Select and filter' },
        { id: 'sql-nulls-and-sorting', title: 'NULLs and sorting' },
        { id: 'sql-joins', title: 'Joins' },
      ],
    ),
    course('react-basics', 'React basics', [{ id: 'react', name: 'React' }], [], {
      status: 'PLANNED',
    }),
  ],
  skills: SKILLS,
  roleCoreSkills: { DATA_ANALYST: ['sql', 'python', 'data-analysis'] },
  bestCourseBySkill: { javascript: 'javascript-essentials', sql: 'sql-fundamentals' },
};

export const analytics = (overrides: Partial<LearningAnalytics> = {}): LearningAnalytics => ({
  courses: { started: 0, completed: 0 },
  lessonsCompleted: 0,
  recentActivity: [],
  lastActiveAt: null,
  practice: {
    attempts: 0,
    questionsAnswered: 0,
    firstTry: { correct: 0, total: 0 },
    firstTryAccuracy: null,
    note: 'Answer at least 5 different practice questions to see an accuracy figure (0 so far).',
  },
  revision: { due: 0, scheduled: 0 },
  skills: { measured: 0, tooFewQuestions: 0, unknown: 0 },
  plan: null,
  interview: { attempts: 0, questions: 0 },
  projects: { started: 0, completed: 0 },
  week: { goalMinutes: null, estimatedMinutes: 0 },
  ...overrides,
});

export const step = (overrides: Partial<NextStep> = {}): NextStep => ({
  key: 'start:javascript-essentials',
  rank: 1,
  kind: 'START_HERE',
  title: 'Start with JavaScript essentials',
  reason: 'A beginner course with no prerequisites.',
  href: '/learn/courses/javascript-essentials',
  evidence: ['General suggestion'],
  confidence: 'LOW',
  ...overrides,
});

export const snapshot = (
  steps: NextStep[] = [step()],
  overrides: Partial<LearningSnapshot> = {},
): LearningSnapshot => ({
  nextSteps: {
    steps,
    dismissedCount: 0,
    basedOn: {
      targetRole: null,
      interests: 0,
      hasResume: false,
      analysedJobs: 0,
      practiceAnswers: 0,
      diagnostics: 0,
    },
  },
  revision: { topics: [], dueCount: 0, scheduledCount: 0, resolvedCount: 0, method: '' },
  analytics: analytics(),
  enrolledCourseIds: [],
  skillEvidence: [],
  ...overrides,
});

export const prefs = (overrides: Partial<LearningPreferences> = {}): LearningPreferences => ({
  targetRole: null,
  interestCategories: [],
  interestSkillIds: [],
  weeklyGoalMinutes: null,
  dismissedSteps: [],
  updatedAt: null,
  ...overrides,
});

export const assessed = (
  skillId: string,
  overrides: Partial<SkillAssessment> = {},
): SkillAssessment => ({
  skillId,
  name: SKILLS.find((s) => s.id === skillId)!.name,
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

export const JOB: AnalysedJobRef = {
  id: '0190f3c2-0000-7000-8000-000000000001',
  title: 'Data Analyst',
  companyName: 'Acme',
  analysedAt: null,
  isSampleData: false,
  skillCount: 1,
};

export const readinessFor = (job: AnalysedJobRef): JobReadinessResponse => ({
  job,
  resume: null,
  skills: [
    {
      name: 'SQL',
      importance: 'REQUIRED',
      jobSource: 'EXPLICIT',
      skillId: 'sql',
      assessment: assessed('sql'),
      courses: [{ id: 'sql-fundamentals', title: 'SQL fundamentals', status: 'PUBLISHED' }],
      lessons: [{ courseId: 'sql-fundamentals', lessonId: 'sql-joins', lessonTitle: 'Joins' }],
      projectChallenges: [],
      interviewQuestionCount: 3,
    },
  ],
  counts: {
    requested: 1,
    measured: 0,
    resumeEvidence: 0,
    userCorrected: 0,
    unknown: 1,
    notCatalogued: 0,
    toPractise: 1,
  },
  limitations: [
    'This is a comparison to guide practice, not a prediction of whether you would get the job.',
  ],
});

/**
 * In-memory tool port with per-user data. Records every call so tests can check that only the
 * planned tools ran and that each got the context's user id.
 */
export function fakeTools(
  data: Record<
    string,
    { jobs?: AnalysedJobRef[]; prefs?: LearningPreferences; snapshot?: LearningSnapshot }
  > = {},
) {
  const of = (userId: string) => data[userId] ?? {};
  const tools = {
    catalogue: vi.fn(() => CATALOGUE),
    preferences: vi.fn((userId: string) => Promise.resolve(of(userId).prefs ?? prefs())),
    learningSnapshot: vi.fn((userId: string) => Promise.resolve(of(userId).snapshot ?? snapshot())),
    skillAssessment: vi.fn((_userId: string, target: { role: string } | { skillIds: string[] }) =>
      Promise.resolve({
        hasResume: false,
        skills: ('role' in target ? ['sql', 'python'] : target.skillIds).map((id) => assessed(id)),
      }),
    ),
    learningPlan: vi.fn((_userId: string, role: never) =>
      Promise.resolve({ role, plan: { courses: [], resume: null, limitations: [] } as never }),
    ),
    interviewPractice: vi.fn(() =>
      Promise.resolve({
        questions: [],
        overview: { attempts: 0, questionsPractised: 0, recent: [], conceptsToRevise: [] },
      }),
    ),
    projectChallenges: vi.fn(() => Promise.resolve([])),
    analysedJobs: vi.fn((userId: string) => Promise.resolve(of(userId).jobs ?? [])),
    jobReadiness: vi.fn((userId: string, jobId: string) => {
      const job = (of(userId).jobs ?? []).find((j) => j.id === jobId);
      return job ? Promise.resolve(readinessFor(job)) : Promise.reject(new Error('not found'));
    }),
  };
  return tools satisfies MentorToolPort;
}

/** Named like the host's AI errors, which the agent classifies by name. */
export const namedError = (name: string, message = name) =>
  Object.assign(new Error(message), { name });

/**
 * A model double that behaves like the host's AiService: it validates each scripted output with
 * the request's schema (throwing AiOutputValidationError), or throws/hangs as scripted.
 *
 * 'HANG' never settles and ignores the abort signal (a provider without cancellation).
 * 'HANG_ABORTABLE' settles only when the signal aborts, rejecting the way the host's AiService
 * does (AiAbortedError) and recording that the cancellation reached the "request".
 * This simulates cancellation; it says nothing about a real network request.
 */
export function fakeModel(...script: (unknown | Error | 'HANG' | 'HANG_ABORTABLE')[]) {
  const calls: { task: string; system: string; input: string; signal?: AbortSignal }[] = [];
  const state = { cancelled: 0 };
  const model: MentorModel & { calls: typeof calls; state: typeof state } = {
    enabled: true,
    calls,
    state,
    generateStructured: ({ task, system, input, schema, signal }) => {
      calls.push({ task, system, input, signal });
      const next = script.length > 1 ? script.shift() : script[0];
      if (next === 'HANG') return new Promise(() => {});
      if (next === 'HANG_ABORTABLE')
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            state.cancelled += 1;
            reject(namedError('AiAbortedError'));
          });
        });
      if (next instanceof Error) return Promise.reject(next);
      const parsed = schema.safeParse(next);
      return parsed.success
        ? Promise.resolve(parsed.data)
        : Promise.reject(namedError('AiOutputValidationError'));
    },
  };
  return model;
}

export const disabledModel: MentorModel = {
  enabled: false,
  generateStructured: () => Promise.reject(namedError('AiNotConfiguredError')),
};
