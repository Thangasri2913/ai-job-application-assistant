import {
  type ContentProvenance,
  type CourseFormat,
  type CourseStatus,
  type ExternalResource,
  type ExternalResourceType,
  LEARNING_ID_PATTERN,
  type LearningCategory,
  type LearningDifficulty,
  type LearningModuleKind,
  type LearningRole,
  MULTIPLE_CHOICE_VARIANTS,
  type PortfolioProject,
  type PracticeExercise,
  type SkillLevel,
} from '@job-assist/shared';
import { z } from 'zod';

/**
 * Authoring layer of the catalogue. Course files write `CourseSource` objects; the service
 * derives counts, durations and the public shapes (which never include answers).
 *
 * Activities are validated by `activitySourceSchema` — the same schema any future
 * AI-generated activity must pass before it can be shown (see ../ai/).
 */

/**
 * All explanations, examples, activities, exercises and projects in this catalogue were
 * drafted with AI assistance and have not been reviewed by a subject-matter expert. Mark
 * content REVIEWED only after a named person has actually reviewed it.
 */
export const AI_UNREVIEWED: ContentProvenance = {
  origin: 'AI_GENERATED',
  review: { status: 'UNREVIEWED' },
};

// ─── Activity schema (answers included; server-side only) ───────────────────

const slug = z.string().regex(LEARNING_ID_PATTERN, 'must be a lowercase-hyphen slug').max(80);
const text = z.string().trim().min(1).max(2000);
const codeSchema = z.object({
  language: z.string().trim().min(1).max(30),
  source: z.string().min(1).max(4000),
});
const provenanceSchema = z.object({
  origin: z.enum(['ORIGINAL', 'AI_GENERATED']),
  review: z.discriminatedUnion('status', [
    z.object({ status: z.literal('UNREVIEWED') }),
    z.object({ status: z.literal('REVIEWED'), reviewedBy: text, reviewedAt: text }),
  ]),
});

const common = {
  id: slug,
  prompt: text,
  code: codeSchema.optional(),
  hint: text.optional(),
  provenance: provenanceSchema.optional(),
};

const unique = (values: string[]) => new Set(values).size === values.length;

export const multipleChoiceSchema = z
  .object({
    ...common,
    type: z.literal('MULTIPLE_CHOICE'),
    variant: z.enum(MULTIPLE_CHOICE_VARIANTS),
    options: z
      .array(
        z.object({
          id: slug,
          text,
          correct: z.boolean().optional(),
          /** Why choosing this option is right or wrong. */
          feedback: text,
        }),
      )
      .min(2)
      .max(6),
    explanation: text,
  })
  .refine((a) => a.options.filter((o) => o.correct).length === 1, {
    message: 'exactly one option must be correct',
  })
  .refine((a) => unique(a.options.map((o) => o.id)), { message: 'option ids must be unique' });

const gapSchema = z.object({
  gap: slug,
  label: text,
  /** Accepted answers (compared case-insensitively, whitespace-normalised). */
  accept: z.array(text).min(1).max(10),
});

export const fillInTheGapSchema = z
  .object({
    ...common,
    type: z.literal('FILL_IN_THE_GAP'),
    asCode: z.boolean().default(false),
    segments: z
      .array(z.union([z.string().min(1).max(2000), gapSchema]))
      .min(2)
      .max(30),
    explanation: text,
  })
  .refine((a) => a.segments.some((s) => typeof s !== 'string'), {
    message: 'needs at least one gap',
  })
  .refine((a) => unique(a.segments.flatMap((s) => (typeof s === 'string' ? [] : [s.gap]))), {
    message: 'gap ids must be unique',
  });

export const shortAnswerSchema = z.object({
  ...common,
  type: z.literal('SHORT_ANSWER'),
  variant: z.enum(['EXPECTED_OUTPUT', 'CONCEPT', 'SQL']),
  accept: z.array(text).min(1).max(10),
  /** Targeted feedback for predictable wrong answers. */
  commonMistakes: z
    .array(z.object({ answer: text, feedback: text }))
    .max(10)
    .default([]),
  explanation: text,
});

const checklistSchema = z
  .object({
    ...common,
    type: z.literal('CHECKLIST'),
    items: z
      .array(z.object({ id: slug, text }))
      .min(1)
      .max(15),
    explanation: text.optional(),
  })
  .refine((a) => unique(a.items.map((i) => i.id)), { message: 'item ids must be unique' });

const reflectionSchema = z.object({
  ...common,
  type: z.literal('REFLECTION'),
  explanation: text.optional(),
});

const revisionCardsSchema = z.object({
  ...common,
  type: z.literal('REVISION_CARDS'),
  cards: z
    .array(z.object({ front: text, back: text }))
    .min(1)
    .max(20),
  explanation: text.optional(),
});

export const activitySourceSchema = z.union([
  multipleChoiceSchema,
  fillInTheGapSchema,
  shortAnswerSchema,
  checklistSchema,
  reflectionSchema,
  revisionCardsSchema,
]);

/** What a course file writes. */
export type ActivitySource = z.input<typeof activitySourceSchema>;
/** After validation (defaults applied). Contains answers: never send to clients. */
export type ParsedActivity = z.output<typeof activitySourceSchema>;

export const diagnosticQuestionSchema = z
  .object({
    id: slug,
    lessonId: slug,
    prompt: text,
    code: codeSchema.optional(),
    options: z
      .array(z.object({ id: slug, text, correct: z.boolean().optional() }))
      .min(2)
      .max(6),
    explanation: text,
  })
  .refine((q) => q.options.filter((o) => o.correct).length === 1, {
    message: 'exactly one option must be correct',
  });

export type DiagnosticQuestionSource = z.input<typeof diagnosticQuestionSchema>;

// ─── Course structure ───────────────────────────────────────────────────────

export interface LessonExampleSource {
  title: string;
  description: string;
  code?: { language: string; source: string };
  expectedOutput?: string;
}

export interface LessonSource {
  id: string;
  order: number;
  title: string;
  summary: string;
  /** Defaults from the module kind (foundations → 1 … project/interview → 6). */
  level?: Exclude<SkillLevel, 0>;
  skillIds?: string[];
  objectives: string[];
  explanation: string[];
  deepDive?: string[];
  examples: LessonExampleSource[];
  activities?: ActivitySource[];
  exercises: PracticeExercise[];
  resources: ExternalResource[];
  recap?: string;
  estimatedMinutes: number;
  provenance: ContentProvenance;
}

export interface ModuleSource {
  id: string;
  order: number;
  kind: LearningModuleKind;
  title: string;
  description: string;
  objectives: string[];
  lessons: LessonSource[];
  project: PortfolioProject | null;
}

export interface DiagnosticSource {
  title: string;
  instructions: string;
  questions: DiagnosticQuestionSource[];
}

export interface CourseSource {
  id: string;
  title: string;
  description: string;
  format: CourseFormat;
  category: LearningCategory;
  roles: LearningRole[];
  /** Ids from SKILLS (./skills.ts). */
  skillIds: string[];
  difficulty: LearningDifficulty;
  status: CourseStatus;
  outcomes: string[];
  prerequisites: string[];
  prerequisiteCourseIds?: string[];
  provenance: ContentProvenance;
  /** Set only when a named expert actually reviewed the course. */
  lastReviewedOn: string | null;
  diagnostic?: DiagnosticSource;
  modules: ModuleSource[];
}

export const DEFAULT_LEVEL: Record<LearningModuleKind, Exclude<SkillLevel, 0>> = {
  FOUNDATIONS: 1,
  CORE_CONCEPTS: 2,
  HANDS_ON: 3,
  INTEGRATION: 4,
  TESTING: 4,
  ADVANCED: 5,
  PORTFOLIO_PROJECT: 6,
  INTERVIEW_PREPARATION: 6,
};

/** A planned course: announced, with no curriculum yet. */
export const planned = (
  course: Omit<CourseSource, 'status' | 'modules' | 'provenance' | 'lastReviewedOn'>,
): CourseSource => ({
  ...course,
  status: 'PLANNED',
  modules: [],
  provenance: AI_UNREVIEWED,
  lastReviewedOn: null,
});

// ─── Curated external resources ─────────────────────────────────────────────

/** Dates the resource links below were requested and answered with HTTP 200. */
const LINK_CHECK_DATE = '2026-10-17';
const LINK_CHECK_DATE_2 = '2026-10-18';

const resource = (
  id: string,
  title: string,
  provider: string,
  url: string,
  type: ExternalResourceType,
  skillIds: string[],
  checkedOn = LINK_CHECK_DATE,
): ExternalResource => ({
  id,
  title,
  provider,
  url,
  type,
  provenance: 'CURATED',
  skillIds,
  // Reachability only: the URL answered with 200 on the check date. Content not reviewed.
  linkCheck: { status: 'REACHABLE', checkedOn, httpStatus: 200 },
});

const MDN = 'MDN Web Docs';
const PG = 'PostgreSQL';

/**
 * Curated links to providers' official material. URLs are the providers' own; each was
 * requested on LINK_CHECK_DATE and answered with HTTP 200 (after redirects, the final URL is
 * stored). Nothing is copied from them.
 */
export const RESOURCES = {
  mdnLearn: resource(
    'mdn-learn-web-development',
    'Learn web development',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Learn_web_development',
    'TUTORIAL',
    ['html', 'css', 'javascript'],
  ),
  mdnHtml: resource(
    'mdn-html',
    'HTML: HyperText Markup Language',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/HTML',
    'DOCUMENTATION',
    ['html'],
  ),
  mdnCss: resource(
    'mdn-css',
    'CSS: Cascading Style Sheets',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/CSS',
    'DOCUMENTATION',
    ['css'],
  ),
  mdnJsGuide: resource(
    'mdn-javascript-guide',
    'JavaScript Guide',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
    'TUTORIAL',
    ['javascript'],
  ),
  mdnJsGrammar: resource(
    'mdn-js-grammar-and-types',
    'Grammar and types (JavaScript Guide)',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types',
    'TUTORIAL',
    ['javascript'],
  ),
  mdnClosures: resource(
    'mdn-closures',
    'Closures (JavaScript Guide)',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures',
    'TUTORIAL',
    ['javascript'],
  ),
  mdnPromises: resource(
    'mdn-using-promises',
    'Using promises (JavaScript Guide)',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises',
    'TUTORIAL',
    ['javascript'],
  ),
  mdnArray: resource(
    'mdn-array-reference',
    'Array (JavaScript reference)',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array',
    'REFERENCE',
    ['javascript'],
  ),
  mdnFetch: resource(
    'mdn-using-fetch',
    'Using the Fetch API',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch',
    'DOCUMENTATION',
    ['javascript', 'rest-apis'],
  ),
  mdnHttpOverview: resource(
    'mdn-http-overview',
    'An overview of HTTP',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview',
    'DOCUMENTATION',
    ['rest-apis'],
  ),
  mdnHttpStatus: resource(
    'mdn-http-status',
    'HTTP response status codes',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status',
    'REFERENCE',
    ['rest-apis'],
  ),
  mdnHttpMethods: resource(
    'mdn-http-methods',
    'HTTP request methods',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods',
    'REFERENCE',
    ['rest-apis'],
  ),
  tsHandbook: resource(
    'typescript-handbook',
    'The TypeScript Handbook',
    'TypeScript',
    'https://www.typescriptlang.org/docs/handbook/intro.html',
    'DOCUMENTATION',
    ['typescript'],
  ),
  reactLearn: resource(
    'react-learn',
    'Learn React',
    'React',
    'https://react.dev/learn',
    'TUTORIAL',
    ['react'],
  ),
  webDevA11y: resource(
    'web-dev-learn-accessibility',
    'Learn Accessibility',
    'web.dev',
    'https://web.dev/learn/accessibility',
    'COURSE',
    ['accessibility'],
  ),
  wcag: resource(
    'w3c-wcag-overview',
    'WCAG standards and guidelines',
    'W3C Web Accessibility Initiative',
    'https://www.w3.org/WAI/standards-guidelines/wcag/',
    'REFERENCE',
    ['accessibility'],
  ),
  w3cEvaluate: resource(
    'w3c-test-evaluate',
    'Evaluating web accessibility',
    'W3C Web Accessibility Initiative',
    'https://www.w3.org/WAI/test-evaluate/',
    'REFERENCE',
    ['accessibility', 'software-testing'],
  ),
  testingLibrary: resource(
    'testing-library-docs',
    'Testing Library: introduction and queries',
    'Testing Library',
    'https://testing-library.com/docs/',
    'DOCUMENTATION',
    ['software-testing', 'test-automation'],
  ),
  vitest: resource(
    'vitest-guide',
    'Getting started with Vitest',
    'Vitest',
    'https://vitest.dev/guide/',
    'DOCUMENTATION',
    ['software-testing', 'test-automation'],
  ),
  playwright: resource(
    'playwright-intro',
    'Playwright: getting started',
    'Playwright',
    'https://playwright.dev/docs/intro',
    'DOCUMENTATION',
    ['test-automation'],
  ),
  testPyramid: resource(
    'practical-test-pyramid',
    'The Practical Test Pyramid',
    'martinfowler.com',
    'https://martinfowler.com/articles/practical-test-pyramid.html',
    'TUTORIAL',
    ['software-testing', 'test-automation'],
  ),
  istqbGlossary: resource(
    'istqb-glossary',
    'ISTQB Glossary of testing terms',
    'ISTQB',
    'https://glossary.istqb.org/',
    'REFERENCE',
    ['software-testing'],
  ),
  nodeLearn: resource(
    'nodejs-learn',
    'Learn Node.js',
    'Node.js',
    'https://nodejs.org/learn',
    'TUTORIAL',
    ['nodejs'],
  ),
  postgresTutorial: resource(
    'postgresql-tutorial',
    'PostgreSQL tutorial',
    PG,
    'https://www.postgresql.org/docs/current/tutorial.html',
    'TUTORIAL',
    ['sql', 'postgresql'],
  ),
  postgresJoins: resource(
    'postgresql-tutorial-joins',
    'Joins between tables (PostgreSQL tutorial)',
    PG,
    'https://www.postgresql.org/docs/current/tutorial-join.html',
    'TUTORIAL',
    ['sql'],
  ),
  postgresAggregates: resource(
    'postgresql-tutorial-aggregates',
    'Aggregate functions (PostgreSQL tutorial)',
    PG,
    'https://www.postgresql.org/docs/current/tutorial-agg.html',
    'TUTORIAL',
    ['sql'],
  ),
  postgresQueries: resource(
    'postgresql-queries',
    'Queries (PostgreSQL manual)',
    PG,
    'https://www.postgresql.org/docs/current/queries.html',
    'DOCUMENTATION',
    ['sql'],
  ),
  postgresConstraints: resource(
    'postgresql-constraints',
    'Constraints (PostgreSQL manual)',
    PG,
    'https://www.postgresql.org/docs/current/ddl-constraints.html',
    'DOCUMENTATION',
    ['sql', 'data-modelling'],
  ),
  nestDocs: resource(
    'nestjs-docs',
    'NestJS documentation',
    'NestJS',
    'https://docs.nestjs.com/',
    'DOCUMENTATION',
    ['nestjs'],
  ),
  owaspTopTen: resource(
    'owasp-top-ten',
    'OWASP Top Ten',
    'OWASP Foundation',
    'https://owasp.org/projects/top-ten',
    'REFERENCE',
    ['web-security'],
  ),
  owaspSqlInjection: resource(
    'owasp-sql-injection-prevention',
    'SQL Injection Prevention Cheat Sheet',
    'OWASP Cheat Sheet Series',
    'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
    'REFERENCE',
    ['web-security', 'sql'],
  ),
  owaspLlmTopTen: resource(
    'owasp-llm-top-ten',
    'OWASP Top 10 for LLM Applications',
    'OWASP GenAI Security Project',
    'https://genai.owasp.org/llm-top-10/',
    'REFERENCE',
    ['generative-ai', 'web-security'],
  ),
  nistAiRmf: resource(
    'nist-ai-rmf',
    'AI Risk Management Framework',
    'NIST',
    'https://www.nist.gov/itl/ai-risk-management-framework',
    'REFERENCE',
    ['generative-ai'],
  ),
  googleMlCrashCourse: resource(
    'google-ml-crash-course',
    'Machine Learning Crash Course',
    'Google for Developers',
    'https://developers.google.com/machine-learning/crash-course',
    'COURSE',
    ['machine-learning'],
  ),
  claudePromptEngineering: resource(
    'anthropic-prompt-engineering',
    'Prompt engineering overview',
    'Anthropic (Claude docs)',
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview',
    'DOCUMENTATION',
    ['prompt-engineering', 'generative-ai'],
  ),
  openAiPromptEngineering: resource(
    'openai-prompt-engineering',
    'Prompt engineering guide',
    'OpenAI',
    'https://developers.openai.com/api/docs/guides/prompt-engineering',
    'DOCUMENTATION',
    ['prompt-engineering', 'generative-ai'],
  ),
  gitBook: resource(
    'pro-git-book',
    'Pro Git (free online book)',
    'Git (git-scm.com)',
    'https://git-scm.com/book/en/v2',
    'BOOK',
    ['git'],
  ),
  googleLlmIntro: resource(
    'google-mlcc-intro-llms',
    'Introduction to large language models',
    'Google for Developers (Machine Learning Crash Course)',
    'https://developers.google.com/machine-learning/crash-course/llm',
    'COURSE',
    ['generative-ai'],
    LINK_CHECK_DATE_2,
  ),
  mdnEquality: resource(
    'mdn-equality-comparisons',
    'Equality comparisons and sameness (JavaScript Guide)',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness',
    'TUTORIAL',
    ['javascript'],
    LINK_CHECK_DATE_2,
  ),
  mdnOptionalChaining: resource(
    'mdn-optional-chaining',
    'Optional chaining (?.)',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining',
    'REFERENCE',
    ['javascript'],
    LINK_CHECK_DATE_2,
  ),
  mdnNullish: resource(
    'mdn-nullish-coalescing',
    'Nullish coalescing operator (??)',
    MDN,
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing',
    'REFERENCE',
    ['javascript'],
    LINK_CHECK_DATE_2,
  ),
  postgresComparison: resource(
    'postgresql-comparison-operators',
    'Comparison functions and operators, including IS NULL (PostgreSQL manual)',
    PG,
    'https://www.postgresql.org/docs/current/functions-comparison.html',
    'REFERENCE',
    ['sql'],
    LINK_CHECK_DATE_2,
  ),
  postgresTransactions: resource(
    'postgresql-tutorial-transactions',
    'Transactions (PostgreSQL tutorial)',
    PG,
    'https://www.postgresql.org/docs/current/tutorial-transactions.html',
    'TUTORIAL',
    ['sql', 'postgresql'],
    LINK_CHECK_DATE_2,
  ),
  postgresIndexes: resource(
    'postgresql-indexes-intro',
    'Introduction to indexes (PostgreSQL manual)',
    PG,
    'https://www.postgresql.org/docs/current/indexes-intro.html',
    'DOCUMENTATION',
    ['sql', 'postgresql'],
    LINK_CHECK_DATE_2,
  ),
  playwrightAssertions: resource(
    'playwright-assertions',
    'Assertions, including auto-retrying assertions (Playwright docs)',
    'Playwright',
    'https://playwright.dev/docs/test-assertions',
    'DOCUMENTATION',
    ['test-automation'],
    LINK_CHECK_DATE_2,
  ),
} satisfies Record<string, ExternalResource>;
