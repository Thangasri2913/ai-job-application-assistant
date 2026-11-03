import type { ContentProvenance, LearningDifficulty } from '@job-assist/shared';
import { AI_UNREVIEWED } from './content.js';

/**
 * Skill-based interview practice questions (ADR-0023). These are general practice questions
 * written for JobAssist — not questions collected from any employer.
 *
 * Each concept lists simple, case-insensitive patterns (regular-expression sources). A concept
 * counts as mentioned when any pattern matches. This is a keyword check, so feedback says it
 * can miss correct points phrased differently. Concepts and example answers are never sent to
 * the client before an answer is submitted.
 */
export interface InterviewConceptSource {
  id: string;
  label: string;
  patterns: string[];
  /** Lesson that teaches the concept (must exist in a published course). */
  lessonId: string;
}

export interface InterviewQuestionSource {
  id: string;
  skillId: string;
  difficulty: LearningDifficulty;
  prompt: string;
  concepts: InterviewConceptSource[];
  exampleAnswer: string;
  provenance: ContentProvenance;
}

const q = (question: Omit<InterviewQuestionSource, 'provenance'>): InterviewQuestionSource => ({
  ...question,
  provenance: AI_UNREVIEWED,
});

export const INTERVIEW_QUESTIONS: InterviewQuestionSource[] = [
  // ── JavaScript ──
  q({
    id: 'iq-js-equality',
    skillId: 'javascript',
    difficulty: 'BEGINNER',
    prompt: 'What is the difference between == and === in JavaScript, and which do you use?',
    concepts: [
      {
        id: 'coercion',
        label: '== converts types before comparing',
        patterns: ['coerc', 'convert', 'type conversion', 'loose'],
        lessonId: 'js-values-and-types',
      },
      {
        id: 'strict',
        label: '=== compares value and type without conversion',
        patterns: [
          'strict',
          'same type',
          'value and type',
          'type and value',
          'without (any )?(type )?conversion',
          'no (type )?conversion',
        ],
        lessonId: 'js-values-and-types',
      },
      {
        id: 'prefer-strict',
        label: 'Prefer === by default',
        patterns: ['prefer', 'by default', 'always use ===', 'use === unless', 'recommend'],
        lessonId: 'js-values-and-types',
      },
    ],
    exampleAnswer:
      "== compares after converting the values to a common type, so '5' == 5 is true. === compares both value and type with no conversion, so '5' === 5 is false. I use === by default because it avoids surprising conversions, and only compare loosely if I have a specific reason — and then I'd rather convert explicitly.",
  }),
  q({
    id: 'iq-js-closures',
    skillId: 'javascript',
    difficulty: 'INTERMEDIATE',
    prompt: 'What is a closure in JavaScript? Give a practical example of when you would use one.',
    concepts: [
      {
        id: 'inner-function',
        label: 'A function created inside another function',
        patterns: [
          'inner function',
          'nested function',
          'function (inside|within|created in|defined in) (another|an outer|a function)',
          'returns? (a|another|an inner) function',
        ],
        lessonId: 'js-functions-and-scope',
      },
      {
        id: 'remembers-scope',
        label: "It keeps access to the outer function's variables after that function returns",
        patterns: [
          'remember',
          'keeps? (access|a reference)',
          'retain',
          'still (has )?access',
          'outer (scope|variables?)',
          'lexical (scope|environment)',
        ],
        lessonId: 'js-functions-and-scope',
      },
      {
        id: 'practical-use',
        label: 'A practical use, such as private state, a counter, a factory or a callback',
        patterns: [
          'counter',
          'private',
          'encapsulat',
          'factory',
          'callback',
          'event handler',
          'memoi',
          'debounce',
        ],
        lessonId: 'js-functions-and-scope',
      },
    ],
    exampleAnswer:
      'A closure is a function that keeps access to the variables of the scope where it was created, even after the outer function has returned. For example, makeCounter() can declare let count = 0 and return a function that increments and returns count. Each counter keeps its own private count that nothing else can change. I use the same idea for event handlers and small factories that need private state.',
  }),
  q({
    id: 'iq-js-async-errors',
    skillId: 'javascript',
    difficulty: 'INTERMEDIATE',
    prompt: 'How do you handle errors when calling an API with fetch and async/await?',
    concepts: [
      {
        id: 'try-catch',
        label: 'Wrap awaits in try/catch (or use .catch)',
        patterns: ['try ?/ ?catch', 'try and catch', 'catch block', '\\.catch', 'try \\{'],
        lessonId: 'js-async',
      },
      {
        id: 'response-ok',
        label: 'fetch does not reject on HTTP errors, so check response.ok or the status',
        patterns: [
          '\\.ok\\b',
          'status code',
          'http (error|status)',
          '\\b404\\b',
          '\\b500\\b',
          "(does not|doesn't|won't) (throw|reject)",
        ],
        lessonId: 'js-async',
      },
      {
        id: 'user-feedback',
        label: 'Show the user a helpful message, a fallback or a retry',
        patterns: ['message', 'fallback', 'retry', 'error state', 'tell the user', 'show the user'],
        lessonId: 'js-async',
      },
    ],
    exampleAnswer:
      'I put the await calls in a try/catch. fetch only rejects on network failures, so after awaiting the response I check response.ok and throw for statuses like 404 or 500. In the catch I log the error for debugging and show the user a clear message with a way to retry, instead of leaving the page blank.',
  }),
  q({
    id: 'iq-js-event-loop',
    skillId: 'javascript',
    difficulty: 'ADVANCED',
    prompt:
      'Explain how the JavaScript event loop decides when a promise callback and a setTimeout callback run.',
    concepts: [
      {
        id: 'single-thread',
        label: 'JavaScript runs one piece of code at a time on a single thread (the call stack)',
        patterns: ['single[- ]thread', 'one thread', 'call stack', 'one (thing|task) at a time'],
        lessonId: 'js-async',
      },
      {
        id: 'after-sync',
        label: 'Callbacks only run once the current synchronous code has finished',
        patterns: [
          'stack is empty',
          'current (code|script|task) (finishes|completes|is done)',
          'after (the|all) synchronous',
          'synchronous code (runs )?first',
        ],
        lessonId: 'js-async',
      },
      {
        id: 'microtasks',
        label: 'Promise callbacks are microtasks and run before the next task',
        patterns: ['microtask', 'job queue'],
        lessonId: 'js-async',
      },
      {
        id: 'tasks',
        label: 'Timer callbacks are tasks (macrotasks) that run after the microtasks',
        patterns: ['macrotask', 'task queue', 'callback queue', 'timer (queue|task)'],
        lessonId: 'js-async',
      },
    ],
    exampleAnswer:
      'JavaScript runs on a single thread, so callbacks only run after the current synchronous code finishes and the call stack is empty. Then the event loop runs every pending microtask — promise callbacks — before it takes the next task from the task queue, where setTimeout callbacks wait. So Promise.resolve().then(...) runs before setTimeout(..., 0), even with a zero delay.',
  }),
  // ── SQL and data modelling ──
  q({
    id: 'iq-sql-where-having',
    skillId: 'sql',
    difficulty: 'BEGINNER',
    prompt: 'What is the difference between WHERE and HAVING in SQL?',
    concepts: [
      {
        id: 'where-rows',
        label: 'WHERE filters individual rows before grouping',
        patterns: ['where[^.]*\\brows?\\b', 'before (the )?group', 'individual rows'],
        lessonId: 'sql-aggregation',
      },
      {
        id: 'having-groups',
        label: 'HAVING filters groups after aggregation',
        patterns: [
          'having[^.]*\\bgroups?\\b',
          'after (the )?(group|aggregat)',
          'filters? (the )?groups',
        ],
        lessonId: 'sql-aggregation',
      },
      {
        id: 'aggregates',
        label: 'HAVING can use aggregate functions such as COUNT',
        patterns: ['count ?\\(', 'aggregate', 'sum ?\\(', 'avg ?\\('],
        lessonId: 'sql-aggregation',
      },
    ],
    exampleAnswer:
      'WHERE filters individual rows before they are grouped, so it cannot use aggregates. HAVING filters the groups after GROUP BY has calculated aggregates. For example, SELECT company, COUNT(*) FROM jobs WHERE remote = true GROUP BY company HAVING COUNT(*) > 1 first keeps remote jobs, then keeps only companies with more than one of them.',
  }),
  q({
    id: 'iq-sql-joins',
    skillId: 'sql',
    difficulty: 'INTERMEDIATE',
    prompt: 'Explain the difference between an INNER JOIN and a LEFT JOIN, with an example.',
    concepts: [
      {
        id: 'inner-matches',
        label: 'An INNER JOIN keeps only rows that match in both tables',
        patterns: [
          'inner join[^.]*(match|both)',
          'only (the )?(rows|records)[^.]*(match|both)',
          'matching rows',
        ],
        lessonId: 'sql-joins',
      },
      {
        id: 'left-keeps-all',
        label: 'A LEFT JOIN keeps every row from the left table',
        patterns: [
          'left join[^.]*(all|every)',
          'keeps? (all|every)',
          'all (the )?(rows|records) from the left',
        ],
        lessonId: 'sql-joins',
      },
      {
        id: 'nulls',
        label: 'Unmatched right-hand columns are NULL',
        patterns: ['null'],
        lessonId: 'sql-joins',
      },
      {
        id: 'example',
        label: 'A concrete example',
        patterns: ['for example', 'e\\.g\\.', 'for instance', 'such as'],
        lessonId: 'sql-joins',
      },
    ],
    exampleAnswer:
      'An INNER JOIN returns only rows that have a match in both tables. A LEFT JOIN returns every row from the left table and fills the right-hand columns with NULL when there is no match. For example, jobs LEFT JOIN applications lists every job, including jobs nobody has applied to, whose application columns are NULL; an INNER JOIN would drop those jobs.',
  }),
  q({
    id: 'iq-sql-indexes',
    skillId: 'sql',
    difficulty: 'ADVANCED',
    prompt: 'When would you add an index to a table, and what are the trade-offs?',
    concepts: [
      {
        id: 'faster-reads',
        label: 'Indexes speed up lookups by avoiding full table scans',
        patterns: [
          'faster',
          'speed',
          'full (table )?scan',
          'scans? the whole table',
          'whole table',
          'lookups?',
          'performance',
        ],
        lessonId: 'sql-safe-and-fast-queries',
      },
      {
        id: 'which-columns',
        label: 'Index columns used in WHERE, JOIN or ORDER BY',
        patterns: ['\\bwhere\\b', '\\bjoin', 'order by', 'filter', 'sort'],
        lessonId: 'sql-safe-and-fast-queries',
      },
      {
        id: 'write-cost',
        label: 'Indexes slow down writes and use storage',
        patterns: [
          'slow(er|s)?( down)? (inserts?|writes?|updates?)',
          '\\bwrites?\\b',
          'storage',
          'disk space',
          '\\bspace\\b',
        ],
        lessonId: 'sql-safe-and-fast-queries',
      },
      {
        id: 'measure',
        label: 'Check the effect with EXPLAIN or measurements',
        patterns: ['explain', 'query plan', 'measure', 'profil'],
        lessonId: 'sql-safe-and-fast-queries',
      },
    ],
    exampleAnswer:
      "I add an index when a frequent query filters, joins or sorts on columns and is slow because the database scans the whole table — for example a composite index on (user_id, created_at) for 'my latest applications'. The trade-offs are slower inserts and updates, because each index must be maintained, and extra storage. I check with EXPLAIN that the index is actually used before and after adding it.",
  }),
  q({
    id: 'iq-data-many-to-many',
    skillId: 'data-modelling',
    difficulty: 'INTERMEDIATE',
    prompt:
      'How would you model users and skills, where a user has many skills and a skill belongs to many users?',
    concepts: [
      {
        id: 'join-table',
        label: 'A join (junction) table such as user_skills',
        patterns: [
          'join table',
          'junction',
          'link(ing)? table',
          'bridge table',
          'association table',
          'user_skills',
          'many[- ]to[- ]many',
        ],
        lessonId: 'sql-keys-and-constraints',
      },
      {
        id: 'foreign-keys',
        label: 'Foreign keys to both tables',
        patterns: ['foreign key', 'references'],
        lessonId: 'sql-keys-and-constraints',
      },
      {
        id: 'unique-pair',
        label: 'A unique constraint or composite primary key on the pair',
        patterns: [
          'unique',
          'composite (primary )?key',
          'primary key ?\\(',
          'pair[^.]*primary key',
          'primary key[^.]*pair',
          'added twice',
          'duplicate',
        ],
        lessonId: 'sql-keys-and-constraints',
      },
    ],
    exampleAnswer:
      'It is a many-to-many relationship, so I would add a join table, user_skills, with user_id and skill_id columns. Each is a foreign key to users and skills respectively, and the pair (user_id, skill_id) is the primary key, so the same skill cannot be added twice for one user. Extra details about the link, like a proficiency the user states, would go on that table too.',
  }),
  // ── Security ──
  q({
    id: 'iq-sec-sql-injection',
    skillId: 'web-security',
    difficulty: 'INTERMEDIATE',
    prompt: 'What is SQL injection and how do you prevent it?',
    concepts: [
      {
        id: 'what',
        label: 'Untrusted input changes the SQL that runs',
        patterns: [
          'user input',
          'untrusted',
          'malicious',
          'alters? the query',
          'changes? the query',
          'injects?',
        ],
        lessonId: 'sql-safe-and-fast-queries',
      },
      {
        id: 'parameters',
        label: 'Use parameterised queries (prepared statements)',
        patterns: [
          'parameteri[sz]ed',
          'prepared statements?',
          'placeholders?',
          '\\$1',
          'bind (variables|parameters)',
          'query parameters',
        ],
        lessonId: 'sql-safe-and-fast-queries',
      },
      {
        id: 'no-concatenation',
        label: 'Never build SQL by concatenating input',
        patterns: [
          'concatenat',
          'string (building|interpolation)',
          'template (string|literal)',
          'never build',
        ],
        lessonId: 'sql-safe-and-fast-queries',
      },
    ],
    exampleAnswer:
      "SQL injection happens when untrusted input is pasted into a query string and changes the SQL itself — for example a search box value like x' OR '1'='1 returning every row. I prevent it by never concatenating input into SQL and always using parameterised queries, such as WHERE city = $1 with the value passed separately, or an ORM that does this. Least-privilege database accounts limit the damage if something slips through.",
  }),
  q({
    id: 'iq-sec-ownership',
    skillId: 'web-security',
    difficulty: 'INTERMEDIATE',
    prompt: 'How do you make sure users can only access their own data in an API?',
    concepts: [
      {
        id: 'authenticate',
        label: 'Authenticate every request (verify the token)',
        patterns: ['authenticat', 'token', '\\bjwt\\b', 'session', 'verif'],
        lessonId: 'authn-and-authz',
      },
      {
        id: 'identity-from-token',
        label: 'Take the user from the verified token, never from the request',
        patterns: [
          'from (the|that|its) (verified |access )?token',
          'never from',
          'not (from|trust) the (request|client|body|query)',
          'never trust',
        ],
        lessonId: 'authn-and-authz',
      },
      {
        id: 'scope-queries',
        label: 'Scope every query to the owner',
        patterns: ['user_id', '\\bscope', 'filter (by|on) (the )?(user|owner)', 'owner(ship)?'],
        lessonId: 'authn-and-authz',
      },
      {
        id: 'not-found',
        label: "Return 404 (or 403) for other users' resources",
        patterns: ['\\b404\\b', '\\b403\\b', 'not found', 'forbidden'],
        lessonId: 'authn-and-authz',
      },
    ],
    exampleAnswer:
      "Every request is authenticated by verifying its token, and the user id comes from that verified token — never from a parameter the client sends. Every query is then scoped to the owner, for example WHERE id = $1 AND user_id = $2, so another user's id simply finds nothing and returns 404. I add tests that sign in as a second user and check they cannot read or change the first user's records.",
  }),
  // ── Testing ──
  q({
    id: 'iq-qa-boundaries',
    skillId: 'software-testing',
    difficulty: 'BEGINNER',
    prompt: 'A form field accepts ages from 18 to 65. How would you choose test values?',
    concepts: [
      {
        id: 'partitions',
        label: 'Equivalence partitions: below, inside and above the range',
        patterns: [
          'equivalence',
          'partition',
          'valid and invalid',
          'invalid (values|ranges?|inputs?)',
          'below 18',
          'under 18',
        ],
        lessonId: 'qa-test-design',
      },
      {
        id: 'boundaries',
        label: 'Boundary value analysis at each edge',
        patterns: ['boundar', '\\bedges?\\b'],
        lessonId: 'qa-test-design',
      },
      {
        id: 'values',
        label: 'Concrete values such as 17, 18, 65 and 66',
        patterns: ['\\b17\\b', '\\b66\\b'],
        lessonId: 'qa-test-design',
      },
      {
        id: 'expected',
        label: 'An expected result for each value',
        patterns: [
          'expected (result|outcome|behaviou?r)',
          'should (be )?(accept|reject)',
          'error message',
        ],
        lessonId: 'qa-test-design',
      },
    ],
    exampleAnswer:
      'I would split the input into equivalence partitions — below 18 (invalid), 18 to 65 (valid) and above 65 (invalid) — and then test the boundaries, where mistakes are most likely: 17, 18, 65 and 66, plus one value in the middle such as 40. For each value I write the expected result first: 17 and 66 should be rejected with a clear error message, while 18, 40 and 65 should be accepted.',
  }),
  q({
    id: 'iq-qa-what-to-automate',
    skillId: 'test-automation',
    difficulty: 'INTERMEDIATE',
    prompt: 'How do you decide which tests to automate?',
    concepts: [
      {
        id: 'repeated',
        label: 'Checks that run often, such as regression tests on every change',
        patterns: [
          'repeat',
          'regression',
          'frequent',
          'every (build|change|release|commit)',
          '\\boften\\b',
        ],
        lessonId: 'qa-automation-basics',
      },
      {
        id: 'stable',
        label: 'Stable features that are not about to change',
        patterns: ['stable', 'not (changing|likely to change)', 'mature'],
        lessonId: 'qa-automation-basics',
      },
      {
        id: 'risk',
        label: 'High-risk or business-critical journeys',
        patterns: [
          'critical',
          'high[- ]risk',
          'business value',
          'key (journeys|flows|paths)',
          'login',
          'checkout',
          'payment',
        ],
        lessonId: 'qa-automation-basics',
      },
      {
        id: 'levels',
        label: 'Prefer fast unit and integration tests; keep a few end-to-end tests',
        patterns: ['pyramid', 'unit tests?', 'integration tests?'],
        lessonId: 'qa-why-we-test',
      },
      {
        id: 'exploratory',
        label: 'Keep exploratory testing manual',
        patterns: ['exploratory', 'manual'],
        lessonId: 'qa-automation-basics',
      },
    ],
    exampleAnswer:
      'I automate checks that are repeated often, cover stable behaviour and protect high-risk journeys such as sign-in and checkout, because those pay back the cost of writing and maintaining them. I push most checks down to fast unit and integration tests and keep a small number of end-to-end tests for the critical paths, following the test pyramid. One-off checks and exploratory testing stay manual, because their value is in finding new problems.',
  }),
  q({
    id: 'iq-qa-flaky-tests',
    skillId: 'test-automation',
    difficulty: 'ADVANCED',
    prompt: 'A UI test fails randomly. How do you investigate and fix it?',
    concepts: [
      {
        id: 'reproduce',
        label: 'Reproduce it and collect evidence (repeat runs, logs, traces, screenshots)',
        patterns: [
          'reproduce',
          'run (it )?(many|multiple|repeatedly|in a loop)',
          '\\blogs?\\b',
          'trace',
          'screenshot',
          'video',
        ],
        lessonId: 'qa-automation-basics',
      },
      {
        id: 'waits',
        label: 'Replace fixed waits with waiting for the expected state',
        patterns: [
          'sleep',
          'fixed (wait|timeout|delay)',
          'waitfortimeout',
          'wait for (the )?(element|condition|state)',
          'auto[- ]?wait',
          'web[- ]first',
        ],
        lessonId: 'qa-automation-basics',
      },
      {
        id: 'isolation',
        label: 'Isolate test data and state between tests',
        patterns: [
          'isolat',
          'shared (state|data)',
          'test data',
          'order[- ]dependent',
          'independent',
          'clean ?up',
        ],
        lessonId: 'qa-automation-basics',
      },
      {
        id: 'root-cause',
        label: 'Fix the cause rather than only adding retries',
        patterns: [
          'root cause',
          'instead of (just )?(retry|retrying|adding retries)',
          'not (just )?(retry|skip)',
        ],
        lessonId: 'qa-automation-basics',
      },
    ],
    exampleAnswer:
      'First I reproduce it — run the test many times and collect traces, screenshots and logs from the failing runs. Common causes are fixed waits, shared test data and dependence on test order, so I replace sleeps with waiting for the expected state (for example a web-first assertion that the result is visible) and make each test create and clean up its own data. I fix the root cause rather than only adding retries, which would hide a real problem.',
  }),
  // ── Generative AI ──
  q({
    id: 'iq-genai-hallucination',
    skillId: 'generative-ai',
    difficulty: 'BEGINNER',
    prompt:
      'Why can a language model give confident but wrong answers, and how do you use its output responsibly?',
    concepts: [
      {
        id: 'predicts',
        label: 'It predicts plausible text rather than looking facts up',
        patterns: ['predict', 'plausible', 'next (word|token)', 'statistic', 'patterns? (in|from)'],
        lessonId: 'genai-how-llms-work',
      },
      {
        id: 'no-lookup',
        label: 'It does not check facts unless connected to a source',
        patterns: [
          "(does not|doesn't|cannot|can't) (check|verify|look up|know)",
          'training data',
          'cut[- ]?off',
          'no access',
        ],
        lessonId: 'genai-how-llms-work',
      },
      {
        id: 'verify',
        label: 'Verify important facts against primary sources',
        patterns: ['verif', 'check', 'primary source', 'fact[- ]check'],
        lessonId: 'genai-how-llms-work',
      },
      {
        id: 'data',
        label: 'Do not share personal or confidential data with unapproved tools',
        patterns: ['personal', 'confidential', 'sensitive', 'privacy', 'approved tool'],
        lessonId: 'genai-responsible-use',
      },
    ],
    exampleAnswer:
      'A language model generates plausible text based on patterns in its training data; unless it is connected to a search or document tool, it does not look facts up, so it can produce believable but invented facts, numbers or citations. I use it for drafting and summarising, verify anything factual against a primary source before relying on it, and only share data that the tool is approved for — no personal or confidential information.',
  }),
  q({
    id: 'iq-genai-prompting',
    skillId: 'prompt-engineering',
    difficulty: 'BEGINNER',
    prompt: "A colleague's prompt is 'Write about our product.' How would you improve it?",
    concepts: [
      {
        id: 'goal',
        label: 'State the goal',
        patterns: ['goal', 'purpose', 'objective', 'what (you|we) want'],
        lessonId: 'genai-prompting',
      },
      {
        id: 'audience',
        label: 'Say who the output is for',
        patterns: [
          'audience',
          "who (it is|it's|the text is) for",
          'for (customers|users|readers|developers|managers)',
        ],
        lessonId: 'genai-prompting',
      },
      {
        id: 'context',
        label: 'Give the context the model cannot know',
        patterns: ['context', 'background', 'details? about', 'features'],
        lessonId: 'genai-prompting',
      },
      {
        id: 'format',
        label: 'Specify format, length or tone',
        patterns: ['format', 'length', 'bullet', '\\bwords\\b', '\\btone\\b', 'structure'],
        lessonId: 'genai-prompting',
      },
      {
        id: 'iterate',
        label: 'Show an example or iterate on the result',
        patterns: ['example', 'iterate', 'refine', 'compare'],
        lessonId: 'genai-prompting',
      },
    ],
    exampleAnswer:
      "I'd turn it into a brief: the goal (for example a 150-word product description for our pricing page), the audience (small-business owners new to the product), the context the model can't know (what the product does, its three main features, what to avoid claiming), and the format and tone (two short paragraphs, friendly and plain). If the tone matters I'd include a short example, then compare outputs and change one thing at a time.",
  }),
  q({
    id: 'iq-genai-prompt-injection',
    skillId: 'llm-applications',
    difficulty: 'INTERMEDIATE',
    prompt:
      'Your app sends web-page text to a language model. How do you protect it against prompt injection?',
    concepts: [
      {
        id: 'untrusted',
        label: 'Treat the page content as untrusted data, not instructions',
        patterns: [
          'untrusted',
          'as data',
          'instructions? (in|inside|hidden in) the (content|page|text)',
        ],
        lessonId: 'genai-building-with-llms',
      },
      {
        id: 'least-privilege',
        label: 'Give the model only the tools and data it needs',
        patterns: [
          'least privilege',
          'limit (the |its )?(tools|access|permissions)',
          'only the (tools|data)',
          'only (gets|has|receives) the (tools|data)',
          'restrict',
        ],
        lessonId: 'genai-building-with-llms',
      },
      {
        id: 'confirm',
        label: 'Require human confirmation before actions',
        patterns: ['confirm', 'human[- ](in[- ]the[- ]loop|review|approval)', 'approval'],
        lessonId: 'genai-building-with-llms',
      },
      {
        id: 'validate',
        label: 'Validate the output (for example against a schema)',
        patterns: ['validat', 'schema', 'structured output'],
        lessonId: 'genai-building-with-llms',
      },
      {
        id: 'no-secrets',
        label: 'Keep secrets out of prompts',
        patterns: ['secret', 'api key', 'system prompt', 'credentials'],
        lessonId: 'genai-building-with-llms',
      },
    ],
    exampleAnswer:
      "I treat the page text as untrusted data: it is clearly separated from my instructions and never given authority. The model only gets the tools and data the feature needs, with no secrets or API keys in the prompt, and any action it proposes — like sending an email — needs the user's confirmation. I ask for structured output and validate it against a schema, falling back safely if it fails. Instructions alone are not a reliable defence, so these limits matter most.",
  }),
  // ── Frontend ──
  q({
    id: 'iq-fe-semantic-html',
    skillId: 'accessibility',
    difficulty: 'BEGINNER',
    prompt: 'Why does semantic HTML matter for accessibility? Give examples.',
    concepts: [
      {
        id: 'assistive',
        label: 'Assistive technology and keyboards rely on element meaning',
        patterns: ['screen reader', 'assistive', 'keyboard'],
        lessonId: 'semantic-html',
      },
      {
        id: 'native',
        label: 'Native elements such as button, label, nav, main and headings',
        patterns: ['\\bbutton', '\\bnav\\b', '\\bmain\\b', 'heading', 'landmark', '<h1'],
        lessonId: 'semantic-html',
      },
      {
        id: 'labels',
        label: 'Labels for form controls and alt text for images',
        patterns: ['label', 'alt text', 'alt=', 'alt attribute'],
        lessonId: 'semantic-html',
      },
      {
        id: 'div-problem',
        label: 'A clickable div lacks built-in focus and keyboard behaviour',
        patterns: ['\\bdiv\\b', '\\bspan\\b', 'focus', 'built[- ]in'],
        lessonId: 'semantic-html',
      },
    ],
    exampleAnswer:
      'Semantic elements tell browsers and screen readers what each part of the page is, so assistive technology can announce it and keyboard users can reach it. A real <button> can be focused and activated with Enter or Space; a clickable <div> can do neither without extra code. Landmarks like <nav> and <main> and headings in order let people jump around the page, and every input needs a connected <label>, every meaningful image alt text.',
  }),
  q({
    id: 'iq-fe-state-props',
    skillId: 'react',
    difficulty: 'BEGINNER',
    prompt: 'What is the difference between state and props in React?',
    concepts: [
      {
        id: 'props',
        label: 'Props are passed in from the parent and read-only in the child',
        patterns: ['props?[^.]*(parent|passed|pass)', 'passed (down|in|from)', 'read[- ]only'],
        lessonId: 'components-and-state',
      },
      {
        id: 'state',
        label: 'State is data the component owns and remembers between renders',
        patterns: [
          'state[^.]*(own|inside|internal|remember|changes? over time|managed)',
          'local state',
          'usestate',
        ],
        lessonId: 'components-and-state',
      },
      {
        id: 'rerender',
        label: 'Changing state or props re-renders the component',
        patterns: ['re-?render', 'updates? the ui'],
        lessonId: 'components-and-state',
      },
      {
        id: 'lift',
        label: 'Shared state is lifted to the closest common parent',
        patterns: ['lift', 'common parent', 'single source of truth'],
        lessonId: 'components-and-state',
      },
    ],
    exampleAnswer:
      'Props are inputs passed from a parent component; the child reads them but does not change them. State is data a component owns and remembers between renders, set with useState, such as whether a menu is open. When either changes, React re-renders the component. If two components need the same state, I lift it to their closest common parent and pass it down as props.',
  }),
  // ── Backend ──
  q({
    id: 'iq-be-status-codes',
    skillId: 'rest-apis',
    difficulty: 'BEGINNER',
    prompt:
      'Which HTTP status codes would you return for invalid input, a missing or invalid token, a forbidden action and a resource that does not exist?',
    concepts: [
      {
        id: 'bad-request',
        label: '400 Bad Request for invalid input',
        patterns: ['\\b400\\b'],
        lessonId: 'http-for-backend',
      },
      {
        id: 'unauthorized',
        label: '401 Unauthorized when not authenticated',
        patterns: ['\\b401\\b'],
        lessonId: 'http-for-backend',
      },
      {
        id: 'forbidden',
        label: '403 Forbidden when authenticated but not allowed',
        patterns: ['\\b403\\b'],
        lessonId: 'http-for-backend',
      },
      {
        id: 'not-found',
        label: '404 Not Found for a missing resource',
        patterns: ['\\b404\\b'],
        lessonId: 'http-for-backend',
      },
    ],
    exampleAnswer:
      "400 Bad Request for invalid input, ideally with the fields that failed; 401 Unauthorized when the token is missing or invalid; 403 Forbidden when the user is signed in but not allowed to do the action; and 404 Not Found when the resource doesn't exist — which I also use for other users' resources so their existence isn't revealed.",
  }),
  q({
    id: 'iq-be-idempotency',
    skillId: 'rest-apis',
    difficulty: 'INTERMEDIATE',
    prompt: 'What does it mean for an HTTP method to be idempotent, and why does it matter?',
    concepts: [
      {
        id: 'definition',
        label: 'Repeating the request has the same effect as sending it once',
        patterns: [
          'same (effect|result|state|outcome)',
          'more than once',
          'multiple times',
          'repeat',
        ],
        lessonId: 'http-for-backend',
      },
      {
        id: 'methods',
        label: 'GET, PUT and DELETE are idempotent',
        patterns: ['\\bput\\b', '\\bdelete\\b'],
        lessonId: 'http-for-backend',
      },
      {
        id: 'post',
        label: 'POST is not idempotent',
        patterns: ['post[^.]*(not|isn.t)', 'not idempotent'],
        lessonId: 'http-for-backend',
      },
      {
        id: 'retries',
        label: 'It makes retries after timeouts safe (or needs idempotency keys)',
        patterns: ['retr(y|ies)', 'timeout', 'duplicate', 'idempotency key'],
        lessonId: 'http-for-backend',
      },
    ],
    exampleAnswer:
      'An idempotent method has the same effect whether it is sent once or many times. GET, PUT and DELETE are idempotent: putting the same resource twice leaves it in the same state. POST is not — repeating it can create duplicates. It matters because clients and proxies retry after timeouts, so for POST I use an idempotency key or a unique constraint to make retries safe.',
  }),
  q({
    id: 'iq-be-node-blocking',
    skillId: 'nodejs',
    difficulty: 'INTERMEDIATE',
    prompt: 'Why should you avoid CPU-heavy work in a Node.js request handler?',
    concepts: [
      {
        id: 'event-loop',
        label: 'Node runs JavaScript on a single main thread with an event loop',
        patterns: ['single[- ]thread', 'one thread', 'event loop', 'main thread'],
        lessonId: 'node-runtime',
      },
      {
        id: 'blocks',
        label: 'Heavy work blocks every other request',
        patterns: ['\\bblock', 'other requests', 'all requests', 'unresponsive', 'stall'],
        lessonId: 'node-runtime',
      },
      {
        id: 'alternatives',
        label: 'Move it to worker threads, a queue or a separate service',
        patterns: [
          'worker',
          'queue',
          'background (job|task)',
          'separate (service|process)',
          'child process',
        ],
        lessonId: 'node-runtime',
      },
    ],
    exampleAnswer:
      'Node.js runs JavaScript on a single main thread driven by the event loop. Asynchronous I/O lets it serve many requests at once, but CPU-heavy work — like resizing images or a large calculation — blocks that thread, so every other request waits and the server looks unresponsive. I move such work to worker threads, a background job queue or a separate service.',
  }),
];
