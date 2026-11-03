import { AI_UNREVIEWED as AI, type CourseSource, RESOURCES as R } from './content.js';

export const BACKEND_DEVELOPER: CourseSource = {
  id: 'backend-developer',
  title: 'Backend Developer',
  description:
    'Learn to design, build, secure and test HTTP APIs backed by a relational database, using Node.js and TypeScript.',
  format: 'CAREER_TRACK',
  category: 'SOFTWARE_DEVELOPMENT',
  roles: ['BACKEND_DEVELOPER', 'FULL_STACK_DEVELOPER'],
  skillIds: [
    'nodejs',
    'typescript',
    'rest-apis',
    'sql',
    'postgresql',
    'data-modelling',
    'web-security',
    'software-testing',
  ],
  prerequisiteCourseIds: ['javascript-essentials', 'sql-fundamentals'],
  difficulty: 'INTERMEDIATE',
  status: 'PUBLISHED',
  lastReviewedOn: null,
  outcomes: [
    'Explain HTTP semantics and design consistent REST APIs',
    'Model data relationally and query it safely with SQL',
    'Validate input, handle errors and protect endpoints with authentication and authorisation',
    'Test services and endpoints with unit and integration tests',
    'Ship a small production-style API and discuss its design in interviews',
  ],
  prerequisites: [
    'Basic programming in any language',
    'Comfortable with the command line',
    'JavaScript basics (see JavaScript essentials)',
  ],
  provenance: AI,
  modules: [
    {
      id: 'backend-foundations',
      order: 1,
      kind: 'FOUNDATIONS',
      title: 'HTTP and Node.js foundations',
      description: 'The protocol every API speaks, and the runtime you will build on.',
      objectives: [
        'Use HTTP methods and status codes correctly',
        'Explain how Node.js handles many requests at once',
      ],
      project: null,
      lessons: [
        {
          id: 'http-for-backend',
          order: 1,
          title: 'HTTP for backend developers',
          summary: 'Methods, status codes, headers and idempotency.',
          skillIds: ['rest-apis'],
          objectives: [
            'Choose the right method and status code',
            'Explain which methods are safe and idempotent',
          ],
          explanation: [
            'An API is a contract made of HTTP requests and responses. GET reads, POST creates, PUT replaces, PATCH updates part of a resource and DELETE removes it. GET is safe (it changes nothing); GET, PUT and DELETE are idempotent (repeating them has the same effect), which matters when clients retry.',
            'Status codes tell clients what happened: 2xx success, 4xx a problem with the request (400 invalid input, 401 not authenticated, 403 not allowed, 404 not found, 409 conflict) and 5xx a problem on the server. Clients rely on these to decide whether to retry or show an error.',
          ],
          examples: [],
          activities: [
            {
              id: 'be-idempotent-method',
              type: 'MULTIPLE_CHOICE',
              variant: 'CONCEPT',
              prompt:
                'A client retries a request after a timeout. For which method is repeating the request designed to have the same effect as sending it once?',
              options: [
                {
                  id: 'a',
                  text: 'PUT',
                  correct: true,
                  feedback:
                    'Right — PUT replaces the resource, so repeating it leaves the same result.',
                },
                {
                  id: 'b',
                  text: 'POST',
                  feedback:
                    'POST usually creates something new each time, so a retry can create duplicates.',
                },
              ],
              explanation:
                'GET, PUT and DELETE are idempotent by definition; POST is not, which is why APIs often add idempotency keys for safe retries.',
            },
          ],
          exercises: [
            {
              id: 'choose-status-codes',
              title: 'Choose status codes',
              instructions:
                'For a "create job application" endpoint, list the responses for: success, missing required field, not signed in, duplicate application, and database unavailable.',
              successCriteria: [
                'Each case has a distinct, correct status code',
                'You can explain why a client may retry only some of them',
              ],
              estimatedMinutes: 20,
              provenance: AI,
            },
          ],
          resources: [R.mdnHttpMethods, R.mdnHttpStatus],
          estimatedMinutes: 40,
          provenance: AI,
        },
        {
          id: 'node-runtime',
          order: 2,
          title: 'The Node.js runtime',
          summary: 'The event loop, modules and packages.',
          skillIds: ['nodejs'],
          objectives: ['Explain non-blocking I/O', 'Avoid blocking the event loop'],
          explanation: [
            'Node.js runs JavaScript on one main thread and handles I/O (network, files, databases) asynchronously. While one request waits for the database, the event loop serves others, which is why a single process can handle many concurrent requests.',
            'The flip side: CPU-heavy work on the main thread blocks every request. Keep request handlers asynchronous, and move heavy computation to a worker or a separate service.',
          ],
          examples: [],
          exercises: [],
          resources: [R.nodeLearn],
          estimatedMinutes: 40,
          provenance: AI,
        },
      ],
    },
    {
      id: 'backend-api-design',
      order: 2,
      kind: 'CORE_CONCEPTS',
      title: 'Designing REST APIs',
      description: 'Resource-oriented design, validation and consistent errors.',
      objectives: [
        'Design resource URLs and payloads',
        'Validate input at the boundary and return consistent errors',
      ],
      project: null,
      lessons: [
        {
          id: 'resource-design',
          order: 1,
          title: 'Resource-oriented design',
          summary: 'Nouns in URLs, verbs in methods, and predictable payloads.',
          skillIds: ['rest-apis'],
          objectives: ['Name resources and nest them sensibly', 'Paginate and filter lists'],
          explanation: [
            'Model your API around resources such as /applications and /applications/{id}/notes, and let the HTTP method express the action. Keep payload field names consistent across endpoints, and return the created or updated resource so clients do not need a second request.',
            'Lists should be paginated and filterable from the start (for example ?status=APPLIED&page=2), because unbounded responses become slow as data grows.',
          ],
          examples: [
            {
              title: 'A small set of endpoints',
              description: 'One resource, one nested resource.',
              code: {
                language: 'http',
                source:
                  'GET    /applications?status=APPLIED&page=1\nPOST   /applications\nGET    /applications/{id}\nPATCH  /applications/{id}\nPOST   /applications/{id}/notes',
              },
            },
          ],
          exercises: [],
          resources: [R.mdnHttpOverview],
          estimatedMinutes: 40,
          provenance: AI,
        },
        {
          id: 'validation-and-errors',
          order: 2,
          title: 'Validation and error handling',
          summary: 'Never trust input, and fail clearly.',
          skillIds: ['rest-apis'],
          objectives: [
            'Validate every request body and parameter',
            'Return one consistent error format',
          ],
          explanation: [
            'Validate input where it enters the system: types, required fields, lengths and allowed values. Reject invalid requests with 400 and a message that says which field is wrong; never let unvalidated data reach the database.',
            'Use one error format for every endpoint (for example a code, a message and field details), log unexpected errors with enough context to debug them, and never return stack traces or internal details to clients.',
          ],
          examples: [],
          activities: [
            {
              id: 'be-status-for-invalid-body',
              type: 'MULTIPLE_CHOICE',
              variant: 'SCENARIO',
              prompt: 'A request is missing the required "title" field. Which response fits best?',
              options: [
                {
                  id: 'a',
                  text: '400 with a message saying "title" is required',
                  correct: true,
                  feedback:
                    'Right — the client sent an invalid request and needs to know which field to fix.',
                },
                {
                  id: 'b',
                  text: '500 Internal Server Error',
                  feedback: '5xx means the server failed; here the request itself was wrong.',
                },
                {
                  id: 'c',
                  text: '200 with an empty body',
                  feedback: 'Success codes hide the problem from the client.',
                },
              ],
              explanation:
                'Validate input at the boundary and answer 400 with field-level details; reserve 5xx for genuine server failures.',
            },
          ],
          exercises: [
            {
              id: 'error-format',
              title: 'Define an error format',
              instructions:
                'Write the JSON error response for a request with an invalid email and a missing name, then for an unexpected server error.',
              successCriteria: [
                'Clients can tell which fields failed',
                'The server error reveals no internal details',
              ],
              estimatedMinutes: 20,
              provenance: AI,
            },
          ],
          resources: [R.nestDocs],
          estimatedMinutes: 40,
          provenance: AI,
        },
      ],
    },
    {
      id: 'backend-databases',
      order: 3,
      kind: 'INTEGRATION',
      title: 'Databases and SQL',
      description: 'Model data in tables, query it and keep it consistent.',
      objectives: [
        'Design tables with keys and constraints',
        'Query with joins safely and efficiently',
        'Use transactions for multi-step changes',
      ],
      project: null,
      lessons: [
        {
          id: 'relational-modelling',
          order: 1,
          title: 'Relational modelling and SQL',
          summary: 'Tables, keys, relationships and joins.',
          skillIds: ['sql', 'data-modelling'],
          objectives: [
            'Use primary and foreign keys',
            'Write SELECT queries with joins and filters',
          ],
          explanation: [
            'A relational database stores data in tables. Each row has a primary key; foreign keys link rows across tables (each application belongs to one user), and constraints such as NOT NULL and UNIQUE let the database itself reject invalid data.',
            'SQL describes what you want rather than how to get it: SELECT columns FROM a table, JOIN related tables on their keys, filter with WHERE and sort with ORDER BY.',
          ],
          examples: [
            {
              title: 'A join',
              description: 'Applications with their job titles, newest first.',
              code: {
                language: 'sql',
                source:
                  'SELECT a.id, j.title, a.status\nFROM applications a\nJOIN jobs j ON j.id = a.job_id\nWHERE a.user_id = $1\nORDER BY a.created_at DESC;',
              },
            },
          ],
          exercises: [
            {
              id: 'design-a-schema',
              title: 'Design a schema',
              instructions:
                'Design tables for users, jobs and applications (a user applies to a job at most once). Write the CREATE TABLE statements.',
              successCriteria: [
                'Each table has a primary key',
                'A constraint prevents duplicate applications',
              ],
              estimatedMinutes: 40,
              provenance: AI,
            },
          ],
          resources: [R.postgresTutorial],
          estimatedMinutes: 60,
          provenance: AI,
        },
        {
          id: 'querying-safely',
          order: 2,
          title: 'Querying safely: parameters, transactions and indexes',
          summary: 'Prevent SQL injection, keep changes atomic and queries fast.',
          skillIds: ['sql', 'postgresql', 'web-security'],
          objectives: [
            'Use parameterised queries',
            'Wrap multi-step changes in a transaction',
            'Add an index for a common query',
          ],
          explanation: [
            'Never build SQL by concatenating user input: that allows SQL injection. Pass values as parameters (or use a query builder or ORM that does) so the database treats them as data, never as code.',
            'When a change spans several statements, such as creating an application and its first history entry, run them in a transaction so either all succeed or none do. Add indexes for columns you filter or join on often, and check slow queries with EXPLAIN.',
          ],
          examples: [],
          activities: [
            {
              id: 'be-parameterised-query',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Complete the parameterised query so the user id is passed as data, not SQL.',
              segments: [
                "client.query('SELECT * FROM applications WHERE user_id = ",
                { gap: 'placeholder', label: 'parameter placeholder', accept: ['$1'] },
                "', [userId]);",
              ],
              hint: 'PostgreSQL numbers its parameters.',
              explanation:
                'With node-postgres, $1 refers to the first value in the array; the driver sends it separately from the SQL text.',
            },
          ],
          exercises: [],
          resources: [R.owaspSqlInjection, R.postgresTutorial],
          estimatedMinutes: 45,
          provenance: AI,
        },
      ],
    },
    {
      id: 'backend-security',
      order: 4,
      kind: 'HANDS_ON',
      title: 'Authentication and security',
      description:
        'Know who is calling, decide what they may do, and avoid common vulnerabilities.',
      objectives: [
        'Distinguish authentication from authorisation',
        'Enforce ownership on every query',
        'Recognise common web vulnerabilities',
      ],
      project: null,
      lessons: [
        {
          id: 'authn-and-authz',
          order: 1,
          title: 'Authentication and authorisation',
          summary: 'Who you are versus what you may do.',
          skillIds: ['web-security'],
          objectives: [
            'Verify tokens issued by an identity provider',
            'Scope every data access to the authenticated user',
          ],
          explanation: [
            'Authentication establishes who is calling, usually by verifying a token issued by an identity provider (issuer, audience, signature and expiry). Authorisation decides what that caller may do.',
            'Take the user’s identity from the verified token, never from a user ID in the request, and include it in every query (WHERE user_id = the caller). Return 404 rather than 403 for other people’s resources, so their existence is not revealed.',
          ],
          examples: [],
          activities: [
            {
              id: 'be-trust-token-not-body',
              type: 'MULTIPLE_CHOICE',
              variant: 'SCENARIO',
              prompt: 'GET /applications?userId=42 returns user 42’s applications. What is wrong?',
              options: [
                {
                  id: 'a',
                  text: 'Any signed-in user can read anyone’s data by changing userId',
                  correct: true,
                  feedback:
                    'Right — take the user from the verified token, never from the request.',
                },
                {
                  id: 'b',
                  text: 'Query strings are slower than path parameters',
                  feedback: 'Performance is not the issue; authorisation is.',
                },
                {
                  id: 'c',
                  text: 'Nothing, as long as HTTPS is used',
                  feedback: 'HTTPS protects data in transit, not access rules.',
                },
              ],
              explanation:
                'Scope every query to the authenticated user taken from the verified token (WHERE user_id = the caller).',
            },
          ],
          exercises: [
            {
              id: 'ownership-checks',
              title: 'Find the missing ownership check',
              instructions:
                'Review a GET /applications/:id handler that loads the row by id only. Rewrite it so a user can only read their own applications.',
              successCriteria: [
                'The query filters by both id and the authenticated user',
                'Another user’s id returns 404',
              ],
              estimatedMinutes: 20,
              provenance: AI,
            },
          ],
          resources: [R.owaspTopTen],
          estimatedMinutes: 45,
          provenance: AI,
        },
      ],
    },
    {
      id: 'backend-testing',
      order: 5,
      kind: 'TESTING',
      title: 'Testing APIs',
      description:
        'Unit-test business rules and integration-test endpoints against a real database.',
      objectives: [
        'Unit-test pure business logic',
        'Integration-test endpoints, including failure and permission cases',
      ],
      project: null,
      lessons: [
        {
          id: 'api-tests',
          order: 1,
          title: 'Unit and integration tests for APIs',
          summary: 'Fast tests for rules, realistic tests for endpoints.',
          skillIds: ['software-testing'],
          objectives: [
            'Decide what to unit-test and what to integration-test',
            'Test error and permission cases, not just success',
          ],
          explanation: [
            'Unit tests cover pure logic (validation rules, calculations, state transitions) quickly and in isolation. Integration tests send real HTTP requests to your app connected to a dedicated test database, and catch problems in routing, validation, queries and serialisation.',
            'For each endpoint, test the success case, invalid input (400), missing authentication (401) and another user’s data (404). Reset the test database between tests so they stay independent, and never point tests at production data.',
          ],
          examples: [],
          activities: [
            {
              id: 'be-test-cases',
              type: 'CHECKLIST',
              prompt: 'For one endpoint you have built, tick the cases your tests cover.',
              items: [
                { id: 'success', text: 'The success case' },
                { id: 'invalid', text: 'Invalid input returns 400' },
                { id: 'unauthenticated', text: 'No token returns 401' },
                { id: 'other-user', text: 'Another user’s data returns 404' },
              ],
              explanation: 'Self-assessed; not graded. Missing cases are good next tests to write.',
            },
          ],
          exercises: [],
          resources: [R.vitest, R.nestDocs],
          estimatedMinutes: 50,
          provenance: AI,
        },
      ],
    },
    {
      id: 'backend-portfolio',
      order: 6,
      kind: 'PORTFOLIO_PROJECT',
      title: 'Portfolio project',
      description: 'Build a small production-style API end to end.',
      objectives: ['Deliver a documented, tested API with authentication'],
      lessons: [],
      project: {
        id: 'applications-api',
        title: 'Job applications API',
        brief:
          'A REST API where signed-in users manage their job applications and notes, backed by PostgreSQL.',
        requirements: [
          'CRUD for applications with pagination and status filters',
          'Validation with a consistent error format',
          'Authentication, with every query scoped to the signed-in user',
          'A migration-managed schema with constraints that prevent duplicates',
          'Unit tests for business rules and integration tests for every endpoint',
          'A README with setup, example requests and design decisions',
        ],
        skills: ['Node.js', 'TypeScript', 'REST APIs', 'PostgreSQL', 'Authentication', 'Testing'],
        estimatedHours: 16,
        provenance: AI,
      },
    },
    {
      id: 'backend-interview',
      order: 7,
      kind: 'INTERVIEW_PREPARATION',
      title: 'Interview preparation',
      description: 'Discuss API design, data modelling and trade-offs with confidence.',
      objectives: [
        'Explain your design choices and their trade-offs',
        'Work through a small system-design question',
      ],
      project: null,
      lessons: [
        {
          id: 'backend-interview-topics',
          order: 1,
          title: 'Common backend interview topics',
          summary: 'HTTP, data modelling, security, testing and simple system design.',
          objectives: [
            'Revise core topics with examples from your project',
            'Structure a small system-design answer',
          ],
          explanation: [
            'Backend interviews often cover HTTP and REST design, SQL and data modelling, authentication and authorisation, error handling, testing strategy and, increasingly, a small system-design discussion.',
            'For design questions, clarify requirements first, sketch the main components and data model, then discuss trade-offs such as consistency, scaling and failure handling. Use your portfolio API as a concrete reference wherever you can.',
          ],
          examples: [],
          exercises: [
            {
              id: 'design-a-url-shortener',
              title: 'Talk through a small design',
              instructions:
                'Spend 20 minutes designing a URL-shortener API out loud: endpoints, data model, how codes are generated and what happens under heavy traffic.',
              successCriteria: [
                'You state requirements and assumptions first',
                'You name at least two trade-offs',
              ],
              estimatedMinutes: 30,
              provenance: AI,
            },
          ],
          resources: [],
          estimatedMinutes: 45,
          provenance: AI,
        },
      ],
    },
  ],
};
