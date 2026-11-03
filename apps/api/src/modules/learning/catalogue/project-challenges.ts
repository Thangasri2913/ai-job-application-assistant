import type { ChecklistItem, ContentProvenance, LearningDifficulty } from '@job-assist/shared';
import { AI_UNREVIEWED } from './content.js';

/**
 * Project challenges (ADR-0023): detailed, practical versions of course projects. Progress is
 * self-reported — JobAssist never runs or inspects learners' code.
 */
export interface ProjectChallengeSource {
  id: string;
  title: string;
  summary: string;
  objective: string;
  expectedOutcome: string;
  difficulty: LearningDifficulty;
  estimatedHours: number;
  /** Published courses whose skills this challenge practises. */
  courseIds: string[];
  /** Course project ids this challenge details (one per course at most). */
  expandsProjectIds: string[];
  skillIds: string[];
  prerequisites: string[];
  requirements: string[];
  acceptanceCriteria: ChecklistItem[];
  steps: string[];
  testCases: string[];
  selfReview: ChecklistItem[];
  extensions: string[];
  provenance: ContentProvenance;
}

export const PROJECT_CHALLENGES: ProjectChallengeSource[] = [
  {
    id: 'pc-accessible-job-board',
    title: 'Accessible job board with search and filters',
    summary:
      'Build a small browser app that loads jobs from a local JSON file and lets people search and filter them — usable with a keyboard and a screen reader.',
    objective:
      'Practise fetching data, transforming arrays without mutation, handling loading and error states, and building accessible controls.',
    expectedOutcome:
      'A single-page app you can demo and link from your CV, with a README explaining your decisions and one bug you fixed.',
    difficulty: 'BEGINNER',
    estimatedHours: 6,
    courseIds: ['javascript-essentials', 'frontend-developer'],
    expandsProjectIds: ['job-board-filter'],
    skillIds: ['javascript', 'html', 'css', 'accessibility', 'software-testing'],
    prerequisites: ['JavaScript essentials, lessons 1–4', 'Basic HTML and CSS'],
    requirements: [
      'Load at least 10 jobs (written by you, no real personal data) from jobs.json with fetch and async/await',
      'Search by title and filter by remote or on-site, combining both',
      'Show loading, error and "no results" states',
      'Never mutate the loaded data; derive the visible list from it',
      'Use semantic, accessible markup throughout',
    ],
    acceptanceCriteria: [
      { id: 'loads-data', text: 'Jobs load from jobs.json and appear as a list' },
      {
        id: 'search-filter',
        text: 'Search and the remote filter work together and update the list',
      },
      {
        id: 'states',
        text: 'Loading, error (try renaming jobs.json) and empty states each show a clear message',
      },
      { id: 'keyboard', text: 'Every control can be reached and used with the keyboard alone' },
      {
        id: 'labels',
        text: 'The search box has a visible label and the result count is announced (aria-live)',
      },
      {
        id: 'readme',
        text: 'A README explains how to run it, your design decisions and one bug you fixed',
      },
    ],
    steps: [
      'Write jobs.json with title, company, remote and an optional salaryMin field',
      'Build the static HTML: a labelled search input, a filter control and an empty results list',
      'Load the data with fetch, checking response.ok, and keep it in one variable you never mutate',
      'Write a render function that filters with the current search text and filter, then renders the list',
      'Add loading, error and empty states, and an aria-live region announcing the number of results',
      'Test with the keyboard only, then with your browser’s accessibility tree or a screen reader',
      'Write the README',
    ],
    testCases: [
      'Search "developer": only titles containing "developer" (any case) remain',
      'Select remote only, then search: both conditions apply',
      'Rename jobs.json: an error message appears and nothing crashes',
      'Search for nonsense: the "no results" message appears',
      'A job without salaryMin renders without errors',
    ],
    selfReview: [
      { id: 'no-mutation', text: 'The original data array is unchanged after filtering' },
      { id: 'no-console-errors', text: 'No errors in the browser console in any state' },
      { id: 'small-functions', text: 'Functions are small and named for what they do' },
    ],
    extensions: [
      'Sort by title or salary without mutating the data',
      'Keep the search and filter in the URL so results can be shared',
      'Add component or end-to-end tests for the key journeys',
    ],
    provenance: AI_UNREVIEWED,
  },
  {
    id: 'pc-applications-rest-api',
    title: 'Job applications REST API',
    summary:
      'Build an authenticated REST API where users manage their own job applications, with validation, consistent errors and tests that prove users cannot see each other’s data.',
    objective:
      'Practise REST design, input validation, parameterised SQL, authorisation by ownership and API testing.',
    expectedOutcome:
      'A small API with a documented set of endpoints, a migration-managed schema and an automated test suite you can run with one command.',
    difficulty: 'INTERMEDIATE',
    estimatedHours: 16,
    courseIds: ['backend-developer', 'sql-fundamentals'],
    expandsProjectIds: ['applications-api'],
    skillIds: ['rest-apis', 'nodejs', 'sql', 'postgresql', 'web-security', 'software-testing'],
    prerequisites: ['Backend Developer track, modules 1–5', 'SQL fundamentals, lessons 1–5'],
    requirements: [
      'Endpoints to create, list (paginated, filterable by status), read, update and delete applications',
      'Every request authenticated; every query scoped to the signed-in user',
      'Request validation with one consistent error format',
      'A PostgreSQL schema managed by migrations, with a unique constraint preventing duplicate applications',
      'All SQL parameterised (directly or through an ORM)',
      'Automated tests for success, validation, authentication and cross-user cases',
    ],
    acceptanceCriteria: [
      {
        id: 'crud',
        text: 'All five endpoints work and return appropriate status codes (201, 200, 204, 400, 401, 404)',
      },
      { id: 'validation', text: 'Invalid bodies return 400 with the failing fields listed' },
      { id: 'auth', text: 'Requests without a valid token return 401' },
      {
        id: 'ownership',
        text: 'A second user gets 404 for the first user’s applications, and cannot change them',
      },
      {
        id: 'duplicates',
        text: 'Applying twice to the same job is rejected by a database constraint',
      },
      {
        id: 'tests',
        text: 'One command runs the test suite against a separate test database, and it passes',
      },
    ],
    steps: [
      'Design the resources, URLs and error format on paper first',
      'Create the schema with a migration: users, jobs, applications with keys and constraints',
      'Add authentication middleware that sets the user from a verified token',
      'Implement each endpoint with validation, scoping every query to the user',
      'Write integration tests, including a second user trying to read and change the first user’s data',
      'Document the endpoints and example requests in the README',
    ],
    testCases: [
      'POST /applications with a valid body → 201 and the created application',
      'POST /applications without a job id → 400 naming the field',
      'GET /applications without a token → 401',
      'User B: GET /applications/{A’s id} → 404',
      'POST the same job twice → the second request fails (409 or 400)',
      'GET /applications?status=APPLIED&page=2 → only APPLIED, second page',
    ],
    selfReview: [
      { id: 'no-string-sql', text: 'No SQL is built by concatenating request values' },
      {
        id: 'no-secrets',
        text: 'No secrets are committed; configuration comes from environment variables',
      },
      { id: 'errors-safe', text: 'Error responses never include stack traces or SQL' },
    ],
    extensions: [
      'Add an append-only status history table and endpoint',
      'Add rate limiting to write endpoints',
      'Add an idempotency key for POST requests',
    ],
    provenance: AI_UNREVIEWED,
  },
  {
    id: 'pc-sql-job-search-analytics',
    title: 'Job-search analytics with SQL',
    summary:
      'Design a small database of a job search and answer real questions about it with SQL — joins, aggregation, constraints and an index you can justify.',
    objective:
      'Practise data modelling, joins, GROUP BY/HAVING, constraints and query performance.',
    expectedOutcome:
      'A repository with a schema, sample data you wrote, a file of answered questions and a README explaining each query.',
    difficulty: 'BEGINNER',
    estimatedHours: 6,
    courseIds: ['sql-fundamentals'],
    expandsProjectIds: ['job-search-analytics'],
    skillIds: ['sql', 'postgresql', 'data-modelling'],
    prerequisites: ['SQL fundamentals, lessons 1–5', 'A local PostgreSQL installation'],
    requirements: [
      'Tables for companies, jobs, applications and application status changes',
      'Primary and foreign keys, NOT NULL, at least one UNIQUE and one CHECK constraint',
      'At least 20 rows of sample data you invented (no real personal data)',
      'Queries answering the questions listed in the test cases',
      'One index justified with EXPLAIN output before and after',
    ],
    acceptanceCriteria: [
      { id: 'schema', text: 'The schema loads from a single SQL file without errors' },
      {
        id: 'constraints',
        text: 'Inserting a duplicate application or an invalid status is rejected by the database',
      },
      {
        id: 'queries',
        text: 'Every question in the test cases has a query and a result you checked by hand',
      },
      { id: 'index', text: 'One index is justified with EXPLAIN output before and after' },
      { id: 'readme', text: 'The README explains the schema and each query in plain language' },
    ],
    steps: [
      'Sketch the tables and relationships, then write CREATE TABLE statements with constraints',
      'Write the sample data as INSERT statements',
      'Write each query, predicting the result before running it',
      'Find your slowest query, check it with EXPLAIN, add an index and compare',
      'Write the README',
    ],
    testCases: [
      'How many applications are in each status?',
      'Which companies have more than one open job?',
      'Which jobs have never been applied to? (LEFT JOIN … IS NULL)',
      'What share of applications reached an interview, per company?',
      'What is the average number of days between applying and the first interview?',
    ],
    selfReview: [
      { id: 'null-handling', text: 'Queries handle NULLs with IS NULL / COALESCE, never = NULL' },
      { id: 'readable', text: 'Queries are formatted and use clear table aliases' },
      { id: 'no-select-star', text: 'Final queries select only the columns they need' },
    ],
    extensions: [
      'Add a view for the weekly funnel',
      'Write the funnel query with a window function',
      'Load the same data into a spreadsheet and compare the results',
    ],
    provenance: AI_UNREVIEWED,
  },
];
