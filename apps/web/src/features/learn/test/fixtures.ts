import type {
  ContentProvenance,
  CourseDetail,
  CourseProgress,
  CourseSummary,
  ExternalResource,
  LearningRecommendationResponse,
  LearningAnalytics,
  NextStep,
  NextStepsResponse,
  ReadinessOverview,
} from '@job-assist/shared';

export const AI: ContentProvenance = { origin: 'AI_GENERATED', review: { status: 'UNREVIEWED' } };

export function courseSummary(overrides: Partial<CourseSummary> = {}): CourseSummary {
  return {
    id: 'sql-fundamentals',
    title: 'SQL fundamentals',
    description: 'Query relational data.',
    format: 'SKILL_COURSE',
    category: 'DATA',
    roles: ['DATA_ANALYST'],
    skills: [{ id: 'sql', name: 'SQL' }],
    difficulty: 'BEGINNER',
    levels: { from: 1, to: 6 },
    status: 'PUBLISHED',
    outcomes: ['Write SELECT queries'],
    prerequisites: ['No prior SQL needed'],
    prerequisiteCourseIds: [],
    moduleCount: 2,
    lessonCount: 2,
    activityCount: 5,
    hasDiagnostic: true,
    estimatedHours: 7,
    provenance: AI,
    lastReviewedOn: null,
    ...overrides,
  };
}

export const plannedCourse = courseSummary({
  id: 'python-fundamentals',
  title: 'Python fundamentals',
  category: 'SOFTWARE_DEVELOPMENT',
  skills: [{ id: 'python', name: 'Python' }],
  status: 'PLANNED',
  levels: null,
  moduleCount: 0,
  lessonCount: 0,
  activityCount: 0,
  hasDiagnostic: false,
  estimatedHours: null,
  prerequisites: [],
});

export const mdn: ExternalResource = {
  id: 'postgresql-tutorial',
  title: 'PostgreSQL tutorial',
  provider: 'PostgreSQL',
  url: 'https://www.postgresql.org/docs/current/tutorial.html',
  type: 'TUTORIAL',
  provenance: 'CURATED',
  skillIds: ['sql'],
  linkCheck: { status: 'REACHABLE', checkedOn: '2026-10-17', httpStatus: 200 },
};

export function courseDetail(): CourseDetail {
  return {
    ...courseSummary(),
    modules: [
      {
        id: 'sql-foundations',
        order: 1,
        kind: 'FOUNDATIONS',
        title: 'Reading data',
        description: 'Ask a table a question.',
        objectives: [],
        estimatedMinutes: 25,
        project: null,
        lessons: [
          {
            id: 'sql-select-and-filter',
            order: 1,
            title: 'SELECT, WHERE and ORDER BY',
            summary: 'Choose columns and rows.',
            level: 1,
            skillIds: ['sql'],
            objectives: ['Write a SELECT with a WHERE filter'],
            explanation: ['A query names the columns you want.'],
            deepDive: ['The database reads FROM first.'],
            examples: [
              {
                title: 'Remote jobs',
                description: 'Filter by remote.',
                code: { language: 'sql', source: 'SELECT title FROM jobs WHERE remote = true;' },
                expectedOutput: 'Frontend Developer',
              },
            ],
            activities: [
              {
                id: 'sql-which-clause-filters',
                order: 1,
                type: 'MULTIPLE_CHOICE',
                variant: 'CONCEPT',
                prompt: 'Which clause decides which rows are kept?',
                code: null,
                hint: 'It tests a condition.',
                provenance: AI,
                options: [
                  { id: 'a', text: 'SELECT' },
                  { id: 'b', text: 'WHERE' },
                ],
              },
              {
                id: 'sql-fill-where-berlin',
                order: 2,
                type: 'FILL_IN_THE_GAP',
                asCode: true,
                prompt: 'Complete the query.',
                code: null,
                hint: null,
                provenance: AI,
                segments: [
                  { kind: 'text', text: 'SELECT title FROM jobs ' },
                  { kind: 'gap', id: 'clause', label: 'filter keyword' },
                  { kind: 'text', text: " city = 'Berlin';" },
                ],
              },
              {
                id: 'sql-null-cards',
                order: 3,
                type: 'REVISION_CARDS',
                prompt: 'Revise.',
                code: null,
                hint: null,
                provenance: AI,
                cards: [{ front: 'What does NULL = NULL return?', back: 'Unknown' }],
              },
              {
                id: 'sql-reflect',
                order: 4,
                type: 'REFLECTION',
                prompt: 'Think about a query you wrote.',
                code: null,
                hint: null,
                provenance: AI,
              },
            ],
            exercises: [],
            resources: [mdn],
            recap: 'WHERE keeps rows.',
            estimatedMinutes: 25,
            provenance: AI,
          },
        ],
      },
      {
        id: 'sql-combining-data',
        order: 2,
        kind: 'CORE_CONCEPTS',
        title: 'Combining data',
        description: 'Join tables.',
        objectives: [],
        estimatedMinutes: 30,
        project: {
          id: 'job-search-analytics',
          title: 'Job-search analytics database',
          brief: 'Model a job search.',
          requirements: ['A schema with keys'],
          skills: ['SQL'],
          estimatedHours: 6,
          provenance: AI,
        },
        lessons: [
          {
            id: 'sql-joins',
            order: 1,
            title: 'Joins',
            summary: 'Combine rows.',
            level: 2,
            skillIds: ['sql'],
            objectives: ['Write a join'],
            explanation: ['Joins pair rows.'],
            deepDive: [],
            examples: [],
            activities: [],
            exercises: [],
            resources: [],
            recap: null,
            estimatedMinutes: 30,
            provenance: AI,
          },
        ],
      },
    ],
  };
}

export function progress(overrides: Partial<CourseProgress> = {}): CourseProgress {
  return {
    courseId: 'sql-fundamentals',
    enrolled: false,
    enrolledAt: null,
    lessonCount: 2,
    completedLessonIds: [],
    remainingMinutes: 55,
    latestDiagnostic: null,
    skimLessonIds: [],
    activities: [],
    nextLesson: {
      courseId: 'sql-fundamentals',
      lessonId: 'sql-select-and-filter',
      lessonTitle: 'SELECT, WHERE and ORDER BY',
      moduleTitle: 'Reading data',
    },
    lastActivityAt: null,
    ...overrides,
  };
}

export function recommendation(): LearningRecommendationResponse {
  return {
    role: {
      id: 'DATA_ANALYST',
      label: 'Data Analyst',
      category: 'DATA',
      description: 'Turns data into answers.',
      coreSkills: [
        { id: 'sql', name: 'SQL' },
        { id: 'python', name: 'Python' },
      ],
      evidence: {
        kind: 'CURATED',
        basis: 'Selected by JobAssist.',
        limitations: 'Not derived from job-market statistics.',
      },
    },
    resume: { resumeId: 'r1', resumeName: 'Angular Developer', versionNumber: 1 },
    skills: [
      {
        skillId: 'sql',
        name: 'SQL',
        coreForRole: true,
        resumeEvidence: [{ kind: 'SKILLS_SECTION', excerpt: 'Skills: SQL', context: null }],
        evidenceStrength: 'LISTED',
        proficiency: { level: 'UNKNOWN', source: 'NONE', basis: 'Not assessed.' },
        confidence: 'LOW',
        uncertainty: 'Your resume lists the skill but shows no use of it.',
        userCorrection: null,
        basis: 'RESUME_EVIDENCE',
        gap: true,
        nextStep: {
          kind: 'TAKE_DIAGNOSTIC',
          courseId: 'sql-fundamentals',
          text: 'Take the SQL diagnostic.',
        },
      },
      {
        skillId: 'python',
        name: 'Python',
        coreForRole: true,
        resumeEvidence: [],
        evidenceStrength: 'NONE',
        proficiency: { level: 'UNKNOWN', source: 'NONE', basis: 'Not assessed.' },
        confidence: 'LOW',
        uncertainty: 'No mention found in the selected resume.',
        userCorrection: null,
        basis: 'UNKNOWN',
        gap: true,
        nextStep: {
          kind: 'NO_COURSE_YET',
          courseId: 'python-fundamentals',
          text: 'A Python course is planned.',
        },
      },
    ],
    courses: [
      {
        course: courseSummary(),
        order: 1,
        reason: 'Covers SQL — core skills for this role that are not yet evidenced.',
        skillIds: ['sql'],
        progress: 'NOT_STARTED',
      },
    ],
    demand: {
      source: 'YOUR_ANALYSED_JOBS',
      role: 'DATA_ANALYST',
      jobCount: 0,
      excludedSampleJobs: 0,
      observedFrom: null,
      observedTo: null,
      skills: [],
      limitations: ['Counts come only from job postings you analysed in JobAssist.'],
    },
    limitations: ['Resume evidence shows what your resume says, not how well you know a skill.'],
  };
}

export function readiness(overrides: Partial<ReadinessOverview> = {}): ReadinessOverview {
  return {
    projects: [],
    interview: { attempts: 0, questionsPractised: 0, recent: [], conceptsToRevise: [] },
    skillsToPractise: [],
    jobs: { analysedJobs: 0, sampleJobsExcluded: 0 },
    nextAction: {
      kind: 'START_HERE',
      title: 'Pick a first course',
      reason:
        'You have not selected a course yet. Browse the catalogue or build a personalised plan.',
      href: '/learn',
    },
    ...overrides,
  };
}

export function analytics(overrides: Partial<LearningAnalytics> = {}): LearningAnalytics {
  return {
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
  };
}

/** A next-steps response containing one step built from a dashboard next action. */
export function nextSteps(
  step: Omit<NextStep, 'rank' | 'key' | 'evidence' | 'confidence'> & Partial<NextStep>,
): NextStepsResponse {
  return {
    steps: [{ key: 'step:test', evidence: [], confidence: 'HIGH', ...step, rank: 1 }],
    dismissedCount: 0,
    basedOn: {
      targetRole: null,
      interests: 0,
      hasResume: false,
      analysedJobs: 0,
      practiceAnswers: 6,
      diagnostics: 1,
    },
  };
}
