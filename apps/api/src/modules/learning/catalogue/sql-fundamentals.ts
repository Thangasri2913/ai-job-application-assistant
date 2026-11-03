import { AI_UNREVIEWED as AI, type CourseSource, RESOURCES as R } from './content.js';

/** Sample tables used throughout the course (shown to learners as text). */
const TABLES = `jobs
 id | title              | company | city    | remote
----+--------------------+---------+---------+--------
  1 | Frontend Developer | Acme    | Berlin  | true
  2 | Data Analyst       | Globex  | London  | false
  3 | Backend Developer  | Acme    | Berlin  | false
  4 | QA Engineer        | Initech | Madrid  | true

applications
 id | job_id | status
----+--------+----------
 10 |      1 | APPLIED
 11 |      1 | INTERVIEW
 12 |      3 | APPLIED`;

export const SQL_FUNDAMENTALS: CourseSource = {
  id: 'sql-fundamentals',
  title: 'SQL fundamentals',
  description:
    'Query, combine and summarise relational data, then design tables that keep data correct. Practise on a small job-search database.',
  format: 'SKILL_COURSE',
  category: 'DATA',
  roles: [
    'BACKEND_DEVELOPER',
    'FULL_STACK_DEVELOPER',
    'DATA_ANALYST',
    'DATA_ENGINEER',
    'QA_TESTER',
  ],
  skillIds: ['sql', 'postgresql', 'data-modelling'],
  prerequisiteCourseIds: [],
  difficulty: 'BEGINNER',
  status: 'PUBLISHED',
  lastReviewedOn: null,
  outcomes: [
    'Filter, sort and limit rows with SELECT queries',
    'Combine tables with inner and left joins',
    'Summarise data with GROUP BY and HAVING',
    'Design tables with keys and constraints that prevent bad data',
    'Write queries that are safe from SQL injection and use indexes well',
  ],
  prerequisites: [
    'No prior SQL needed',
    'To run queries yourself: any PostgreSQL installation (optional)',
  ],
  provenance: AI,
  diagnostic: {
    title: 'SQL starting point',
    instructions:
      'Six short questions, one per lesson. Answer what you know and skip guessing — the result only suggests which lessons you could skim. It is not a grade.',
    questions: [
      {
        id: 'sql-dx-where',
        lessonId: 'sql-select-and-filter',
        prompt: 'Which query returns only the remote jobs?',
        options: [
          { id: 'a', text: 'SELECT * FROM jobs WHERE remote = true;', correct: true },
          { id: 'b', text: 'SELECT * FROM jobs ORDER BY remote;' },
          { id: 'c', text: 'SELECT remote FROM jobs;' },
          { id: 'd', text: 'SELECT * FROM jobs LIMIT remote;' },
        ],
        explanation: 'WHERE keeps only the rows for which the condition is true.',
      },
      {
        id: 'sql-dx-null',
        lessonId: 'sql-nulls-and-sorting',
        prompt: 'How do you find rows where closed_on has no value?',
        options: [
          { id: 'a', text: "WHERE closed_on = ''" },
          { id: 'b', text: 'WHERE closed_on = NULL' },
          { id: 'c', text: 'WHERE closed_on IS NULL', correct: true },
          { id: 'd', text: 'WHERE NOT closed_on' },
        ],
        explanation: 'Comparing with NULL using = never yields true; use IS NULL.',
      },
      {
        id: 'sql-dx-join',
        lessonId: 'sql-joins',
        prompt: 'You need every job, including jobs with no applications. Which join?',
        options: [
          { id: 'a', text: 'jobs INNER JOIN applications' },
          { id: 'b', text: 'jobs LEFT JOIN applications', correct: true },
          { id: 'c', text: 'jobs CROSS JOIN applications' },
        ],
        explanation:
          'A LEFT JOIN keeps every row from the left table, filling missing matches with NULL.',
      },
      {
        id: 'sql-dx-having',
        lessonId: 'sql-aggregation',
        prompt: 'Which clause filters groups after COUNT(*) is calculated?',
        options: [
          { id: 'a', text: 'WHERE' },
          { id: 'b', text: 'HAVING', correct: true },
          { id: 'c', text: 'ORDER BY' },
          { id: 'd', text: 'DISTINCT' },
        ],
        explanation: 'WHERE filters rows before grouping; HAVING filters the groups afterwards.',
      },
      {
        id: 'sql-dx-unique',
        lessonId: 'sql-keys-and-constraints',
        prompt: 'How do you guarantee a user can apply to the same job only once?',
        options: [
          { id: 'a', text: 'Check in the application code before inserting' },
          { id: 'b', text: 'A UNIQUE constraint on (user_id, job_id)', correct: true },
          { id: 'c', text: 'An index on job_id' },
        ],
        explanation:
          'Only a database constraint holds under concurrent requests; an application check can race.',
      },
      {
        id: 'sql-dx-injection',
        lessonId: 'sql-safe-and-fast-queries',
        prompt: 'What is the safe way to include a user-supplied city in a query?',
        options: [
          { id: 'a', text: 'Concatenate it: "... WHERE city = \'" + city + "\'"' },
          { id: 'b', text: 'Escape quotes yourself, then concatenate' },
          { id: 'c', text: 'Pass it as a query parameter, e.g. WHERE city = $1', correct: true },
        ],
        explanation:
          'Parameters are sent separately from the SQL text, so input is never run as SQL.',
      },
    ],
  },
  modules: [
    {
      id: 'sql-foundations',
      order: 1,
      kind: 'FOUNDATIONS',
      title: 'Reading data',
      description: 'Ask a table a question and get exactly the rows you need.',
      objectives: ['Select columns and filter rows', 'Handle missing values correctly'],
      project: null,
      lessons: [
        {
          id: 'sql-select-and-filter',
          order: 1,
          title: 'SELECT, WHERE and ORDER BY',
          summary: 'Choose columns, keep matching rows and sort the result.',
          level: 1,
          skillIds: ['sql'],
          objectives: ['Write a SELECT with a WHERE filter', 'Sort and limit results'],
          explanation: [
            'A query names the columns you want (SELECT), the table they come from (FROM), the rows to keep (WHERE) and the order to return them in (ORDER BY). LIMIT caps how many rows come back.',
            'Text values go in single quotes. Conditions can be combined with AND and OR; use brackets when you mix them so the meaning is obvious.',
          ],
          deepDive: [
            'The database does not run the clauses in the order you write them. Logically it reads FROM, then applies WHERE, then picks the SELECT columns, then sorts with ORDER BY and finally applies LIMIT. That is why a column alias defined in SELECT cannot be used in WHERE, but can be used in ORDER BY.',
          ],
          examples: [
            {
              title: 'Remote jobs, alphabetically',
              description: 'Run against the sample tables below.',
              code: {
                language: 'sql',
                source: `-- Sample data\n${TABLES}\n\nSELECT title, company\nFROM jobs\nWHERE remote = true\nORDER BY title;`,
              },
              expectedOutput:
                ' title              | company\n--------------------+---------\n Frontend Developer | Acme\n QA Engineer        | Initech',
            },
          ],
          activities: [
            {
              id: 'sql-which-clause-filters',
              type: 'MULTIPLE_CHOICE',
              variant: 'CONCEPT',
              prompt: 'Which clause decides which rows are kept?',
              options: [
                { id: 'a', text: 'SELECT', feedback: 'SELECT chooses columns, not rows.' },
                {
                  id: 'b',
                  text: 'WHERE',
                  correct: true,
                  feedback: 'Right — WHERE keeps rows whose condition is true.',
                },
                {
                  id: 'c',
                  text: 'ORDER BY',
                  feedback: 'ORDER BY only sorts the rows that are already selected.',
                },
                {
                  id: 'd',
                  text: 'LIMIT',
                  feedback: 'LIMIT caps the number of rows but does not test a condition.',
                },
              ],
              explanation:
                'WHERE filters rows; SELECT picks columns; ORDER BY sorts; LIMIT caps the count.',
            },
            {
              id: 'sql-fill-where-berlin',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Complete the query so it returns the titles of jobs in Berlin.',
              segments: [
                'SELECT title FROM jobs ',
                { gap: 'clause', label: 'filter keyword', accept: ['WHERE'] },
                " city = 'Berlin';",
              ],
              hint: 'It is the clause that keeps matching rows.',
              explanation: "WHERE city = 'Berlin' keeps only rows whose city is Berlin.",
            },
            {
              id: 'sql-count-berlin-onsite',
              type: 'SHORT_ANSWER',
              variant: 'EXPECTED_OUTPUT',
              prompt: 'Using the sample jobs table, how many rows does this query return?',
              code: {
                language: 'sql',
                source: `${TABLES}\n\nSELECT title FROM jobs\nWHERE city = 'Berlin' AND remote = false;`,
              },
              accept: ['1', 'one'],
              commonMistakes: [
                {
                  answer: '2',
                  feedback: 'Two jobs are in Berlin, but only one of them is not remote.',
                },
              ],
              hint: 'Both conditions must be true for a row to be kept.',
              explanation:
                'Only "Backend Developer" is in Berlin and not remote, so one row is returned.',
            },
            {
              id: 'sql-debug-double-quotes',
              type: 'MULTIPLE_CHOICE',
              variant: 'DEBUGGING',
              prompt: 'In PostgreSQL this query fails with "column Berlin does not exist". Why?',
              code: { language: 'sql', source: 'SELECT title FROM jobs WHERE city = "Berlin";' },
              options: [
                {
                  id: 'a',
                  text: 'Double quotes name a column or table; text values need single quotes',
                  correct: true,
                  feedback: "Right — write 'Berlin' with single quotes.",
                },
                {
                  id: 'b',
                  text: 'WHERE cannot compare text',
                  feedback: 'WHERE compares text fine; the quoting is the problem.',
                },
                {
                  id: 'c',
                  text: 'The semicolon is not allowed',
                  feedback: 'A trailing semicolon is normal and ends the statement.',
                },
              ],
              explanation:
                'In standard SQL, "double quotes" are identifiers and \'single quotes\' are string values.',
            },
          ],
          exercises: [],
          resources: [R.postgresTutorial, R.postgresQueries],
          recap:
            'SELECT picks columns, WHERE keeps rows, ORDER BY sorts and LIMIT caps the result. Strings use single quotes.',
          estimatedMinutes: 25,
          provenance: AI,
        },
        {
          id: 'sql-nulls-and-sorting',
          order: 2,
          title: 'Missing values, DISTINCT and sorting',
          summary: 'NULL means "unknown" — and it changes how comparisons work.',
          level: 2,
          skillIds: ['sql'],
          objectives: ['Test for NULL correctly', 'Remove duplicates and sort descending'],
          explanation: [
            'NULL means a value is missing or unknown. Any comparison with NULL using = or <> gives "unknown", not true, so such rows are never kept. Use IS NULL and IS NOT NULL instead.',
            'DISTINCT removes duplicate rows from the result. ORDER BY column DESC sorts from highest to lowest; you can sort by several columns, separated by commas.',
          ],
          deepDive: [
            'SQL uses three-valued logic: true, false and unknown. NOT unknown is still unknown, which is why WHERE NOT (closed_on = NULL) also returns nothing. COALESCE(closed_on, CURRENT_DATE) replaces NULL with a default when you need a value.',
          ],
          examples: [
            {
              title: 'Companies that are hiring',
              description: 'Each company once, in reverse alphabetical order.',
              code: {
                language: 'sql',
                source: 'SELECT DISTINCT company\nFROM jobs\nORDER BY company DESC;',
              },
              expectedOutput: ' company\n---------\n Initech\n Globex\n Acme',
            },
          ],
          activities: [
            {
              id: 'sql-equals-null',
              type: 'MULTIPLE_CHOICE',
              variant: 'CODE_READING',
              prompt:
                'A jobs table has 3 rows with closed_on = NULL. How many rows does this return?',
              code: { language: 'sql', source: 'SELECT * FROM jobs WHERE closed_on = NULL;' },
              options: [
                {
                  id: 'a',
                  text: '3',
                  feedback: 'It looks like it should, but = NULL never evaluates to true.',
                },
                {
                  id: 'b',
                  text: '0',
                  correct: true,
                  feedback: 'Right — the comparison is "unknown" for every row, so none are kept.',
                },
                {
                  id: 'c',
                  text: 'An error',
                  feedback: 'PostgreSQL accepts it; it just never matches.',
                },
              ],
              explanation: 'Use WHERE closed_on IS NULL to find missing values.',
            },
            {
              id: 'sql-fill-is-null',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Complete the query to find jobs that are still open (no closing date).',
              segments: [
                'SELECT title FROM jobs WHERE closed_on ',
                { gap: 'operator', label: 'operator', accept: ['IS'] },
                ' NULL;',
              ],
              explanation: 'IS NULL is the only correct test for a missing value.',
            },
            {
              id: 'sql-null-cards',
              type: 'REVISION_CARDS',
              prompt: 'Revise the rules for missing values.',
              cards: [
                {
                  front: 'What does NULL = NULL return?',
                  back: 'Unknown (not true), so WHERE drops the row.',
                },
                { front: 'How do you find missing values?', back: 'WHERE column IS NULL' },
                {
                  front: 'How do you substitute a default for NULL?',
                  back: 'COALESCE(column, default_value)',
                },
              ],
            },
          ],
          exercises: [],
          resources: [R.postgresComparison, R.postgresQueries],
          recap:
            'NULL is unknown: use IS NULL / IS NOT NULL. DISTINCT removes duplicates; ORDER BY … DESC reverses the order.',
          estimatedMinutes: 20,
          provenance: AI,
        },
      ],
    },
    {
      id: 'sql-combining-data',
      order: 2,
      kind: 'CORE_CONCEPTS',
      title: 'Combining and summarising',
      description: 'Join related tables and turn rows into totals.',
      objectives: ['Choose between inner and left joins', 'Group rows and filter the groups'],
      project: null,
      lessons: [
        {
          id: 'sql-joins',
          order: 1,
          title: 'Joins',
          summary: 'Combine rows from two tables using the keys that relate them.',
          level: 2,
          skillIds: ['sql'],
          objectives: ['Write an inner join', 'Use a left join to keep unmatched rows'],
          explanation: [
            'Related data lives in separate tables: each application row stores the id of its job (job_id). A JOIN pairs rows whose keys match, written as ON a.job_id = j.id.',
            'An INNER JOIN (or just JOIN) keeps only pairs that match. A LEFT JOIN keeps every row from the left table; where there is no match, the right-hand columns are NULL.',
          ],
          deepDive: [
            "A common mistake is filtering the right-hand table in WHERE after a LEFT JOIN (WHERE a.status = 'APPLIED'): rows with no match have NULL status and are removed, silently turning it into an inner join. Put such conditions in the ON clause instead when you want to keep unmatched rows.",
          ],
          examples: [
            {
              title: 'Every job with its applications',
              description:
                'Jobs without applications still appear. psql prints their missing status as an empty value; it is written as NULL here for clarity.',
              code: {
                language: 'sql',
                source:
                  'SELECT j.title, a.status\nFROM jobs j\nLEFT JOIN applications a ON a.job_id = j.id\nORDER BY j.id;',
              },
              expectedOutput:
                ' title              | status\n--------------------+-----------\n Frontend Developer | APPLIED\n Frontend Developer | INTERVIEW\n Data Analyst       | NULL\n Backend Developer  | APPLIED\n QA Engineer        | NULL',
            },
          ],
          activities: [
            {
              id: 'sql-inner-join-rows',
              type: 'SHORT_ANSWER',
              variant: 'EXPECTED_OUTPUT',
              prompt: 'With the sample tables, how many rows does this inner join return?',
              code: {
                language: 'sql',
                source: `${TABLES}\n\nSELECT j.title, a.status\nFROM jobs j\nJOIN applications a ON a.job_id = j.id;`,
              },
              accept: ['3', 'three'],
              commonMistakes: [
                {
                  answer: '4',
                  feedback:
                    'There are 4 jobs, but an inner join returns one row per matching pair.',
                },
                {
                  answer: '5',
                  feedback:
                    'That is the LEFT JOIN result, which also keeps jobs without applications.',
                },
              ],
              hint: 'Count matching (job, application) pairs.',
              explanation:
                'Each of the 3 applications matches exactly one job, so there are 3 pairs.',
            },
            {
              id: 'sql-choose-left-join',
              type: 'MULTIPLE_CHOICE',
              variant: 'SQL',
              prompt: 'Which query lists all jobs, including those nobody has applied to?',
              options: [
                {
                  id: 'a',
                  text: 'SELECT j.title FROM jobs j JOIN applications a ON a.job_id = j.id;',
                  feedback: 'An inner join drops jobs with no applications.',
                },
                {
                  id: 'b',
                  text: 'SELECT j.title FROM jobs j LEFT JOIN applications a ON a.job_id = j.id;',
                  correct: true,
                  feedback: 'Right — a left join keeps every job.',
                },
                {
                  id: 'c',
                  text: 'SELECT j.title FROM applications a JOIN jobs j ON a.job_id = j.id;',
                  feedback: 'Swapping the order of an inner join still drops unmatched jobs.',
                },
              ],
              explanation:
                'LEFT JOIN keeps all rows of the left table (jobs) whether or not they match.',
            },
            {
              id: 'sql-fill-left-join',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Complete the join that keeps every job.',
              segments: [
                'SELECT j.title, a.status\nFROM jobs j\n',
                { gap: 'join-type', label: 'join type', accept: ['LEFT', 'LEFT OUTER'] },
                ' JOIN applications a ',
                { gap: 'join-keyword', label: 'keyword before the condition', accept: ['ON'] },
                ' a.job_id = j.id;',
              ],
              explanation:
                'LEFT JOIN … ON <condition> keeps all jobs and pairs them with matching applications.',
            },
          ],
          exercises: [],
          resources: [R.postgresJoins],
          recap:
            'Joins pair rows by matching keys. INNER keeps matches only; LEFT keeps every left-hand row.',
          estimatedMinutes: 30,
          provenance: AI,
        },
        {
          id: 'sql-aggregation',
          order: 2,
          title: 'GROUP BY and HAVING',
          summary: 'Count, sum and average by group, then filter the groups.',
          level: 3,
          skillIds: ['sql'],
          objectives: ['Aggregate with COUNT, SUM and AVG', 'Filter groups with HAVING'],
          explanation: [
            'Aggregate functions turn many rows into one value: COUNT(*), SUM, AVG, MIN, MAX. GROUP BY splits the rows into groups first, so you get one result row per group.',
            'Every selected column must either be in GROUP BY or inside an aggregate. WHERE filters rows before grouping; HAVING filters the groups after the aggregates are calculated.',
          ],
          examples: [
            {
              title: 'Applications per status',
              description: 'One row per status with its count.',
              code: {
                language: 'sql',
                source:
                  'SELECT status, COUNT(*) AS total\nFROM applications\nGROUP BY status\nORDER BY total DESC, status;',
              },
              expectedOutput:
                ' status    | total\n-----------+-------\n APPLIED   |     2\n INTERVIEW |     1',
            },
          ],
          activities: [
            {
              id: 'sql-where-vs-having',
              type: 'MULTIPLE_CHOICE',
              variant: 'CONCEPT',
              prompt: 'You want companies with more than 1 job. Where does COUNT(*) > 1 go?',
              options: [
                {
                  id: 'a',
                  text: 'In WHERE',
                  feedback: 'WHERE runs before grouping, so the count does not exist yet.',
                },
                {
                  id: 'b',
                  text: 'In HAVING, after GROUP BY company',
                  correct: true,
                  feedback: 'Right — HAVING filters groups using aggregates.',
                },
                {
                  id: 'c',
                  text: 'In ORDER BY',
                  feedback: 'ORDER BY sorts; it does not remove groups.',
                },
              ],
              explanation: 'SELECT company FROM jobs GROUP BY company HAVING COUNT(*) > 1;',
            },
            {
              id: 'sql-debug-group-by',
              type: 'MULTIPLE_CHOICE',
              variant: 'DEBUGGING',
              prompt: 'Why does this query fail?',
              code: {
                language: 'sql',
                source: 'SELECT company, title, COUNT(*)\nFROM jobs\nGROUP BY company;',
              },
              options: [
                {
                  id: 'a',
                  text: 'title is neither grouped nor aggregated, so there is no single value per company',
                  correct: true,
                  feedback: 'Right — add title to GROUP BY or remove it.',
                },
                {
                  id: 'b',
                  text: 'COUNT(*) cannot be used with GROUP BY',
                  feedback: 'COUNT(*) with GROUP BY is the most common aggregate query.',
                },
                {
                  id: 'c',
                  text: 'GROUP BY must come before FROM',
                  feedback: 'GROUP BY comes after FROM and WHERE.',
                },
              ],
              explanation:
                'Each selected column must be in GROUP BY or inside an aggregate function.',
            },
            {
              id: 'sql-having-rows',
              type: 'SHORT_ANSWER',
              variant: 'EXPECTED_OUTPUT',
              prompt: 'With the sample tables, how many rows does this return?',
              code: {
                language: 'sql',
                source: `${TABLES}\n\nSELECT company, COUNT(*)\nFROM jobs\nGROUP BY company\nHAVING COUNT(*) > 1;`,
              },
              accept: ['1', 'one'],
              hint: 'Count the jobs per company first.',
              explanation:
                'Acme has 2 jobs; Globex and Initech have 1 each. Only Acme passes HAVING COUNT(*) > 1.',
            },
          ],
          exercises: [
            {
              id: 'sql-practice-queries',
              title: 'Answer questions with queries',
              instructions:
                'In your own PostgreSQL (or any SQL environment), create the two sample tables and write queries for: the number of applications per job title; the companies with at least one remote job; the jobs with no applications.',
              successCriteria: [
                'Each query returns the result you predicted before running it',
                'The "no applications" query uses a LEFT JOIN with IS NULL',
              ],
              estimatedMinutes: 30,
              provenance: AI,
            },
          ],
          resources: [R.postgresAggregates],
          recap:
            'GROUP BY makes one row per group; aggregates summarise each group; HAVING filters groups.',
          estimatedMinutes: 35,
          provenance: AI,
        },
      ],
    },
    {
      id: 'sql-design-and-safety',
      order: 3,
      kind: 'ADVANCED',
      title: 'Designing and protecting data',
      description: 'Let the database enforce correctness, and query it safely and quickly.',
      objectives: [
        'Model relationships with keys and constraints',
        'Prevent SQL injection and slow queries',
      ],
      project: null,
      lessons: [
        {
          id: 'sql-keys-and-constraints',
          order: 1,
          title: 'Keys, relationships and constraints',
          summary: 'Primary keys, foreign keys and rules the database enforces for you.',
          level: 4,
          skillIds: ['data-modelling', 'sql'],
          objectives: [
            'Model one-to-many and many-to-many relationships',
            'Choose constraints that prevent invalid data',
          ],
          explanation: [
            'A primary key identifies each row. A foreign key (applications.job_id REFERENCES jobs(id)) links rows across tables and stops you pointing at a job that does not exist. One job has many applications: that is a one-to-many relationship.',
            'Many-to-many relationships, such as users and skills, need a join table (user_skills) holding pairs of ids. Constraints — NOT NULL, UNIQUE, CHECK — let the database reject invalid data no matter which code writes it.',
          ],
          examples: [
            {
              title: 'Applications that cannot be duplicated',
              description:
                'The UNIQUE constraint holds even when two requests arrive at the same time.',
              code: {
                language: 'sql',
                source:
                  "CREATE TABLE applications (\n  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  user_id bigint NOT NULL REFERENCES users(id),\n  job_id  bigint NOT NULL REFERENCES jobs(id),\n  status  text   NOT NULL CHECK (status IN ('APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED')),\n  UNIQUE (user_id, job_id)\n);",
              },
            },
          ],
          activities: [
            {
              id: 'sql-many-to-many',
              type: 'MULTIPLE_CHOICE',
              variant: 'DESIGN',
              prompt:
                'A user can have many skills and a skill belongs to many users. How do you model it?',
              options: [
                {
                  id: 'a',
                  text: 'A comma-separated skills column on users',
                  feedback:
                    'Lists in one column cannot be joined, indexed or constrained properly.',
                },
                {
                  id: 'b',
                  text: 'A user_skills table with user_id and skill_id, unique together',
                  correct: true,
                  feedback: 'Right — a join table with a composite key.',
                },
                {
                  id: 'c',
                  text: 'A skill_id column on users',
                  feedback: 'That allows only one skill per user.',
                },
              ],
              explanation:
                'Many-to-many relationships use a join table whose rows are (user_id, skill_id) pairs.',
            },
            {
              id: 'sql-constraint-scenario',
              type: 'MULTIPLE_CHOICE',
              variant: 'SCENARIO',
              prompt:
                'Two browser tabs submit the same application at the same moment. What stops a duplicate?',
              options: [
                {
                  id: 'a',
                  text: 'Checking "SELECT … WHERE user_id = ? AND job_id = ?" before inserting',
                  feedback:
                    'Both requests can pass the check before either inserts (a race condition).',
                },
                {
                  id: 'b',
                  text: 'UNIQUE (user_id, job_id) on the table',
                  correct: true,
                  feedback: 'Right — the second insert fails, whatever the timing.',
                },
                {
                  id: 'c',
                  text: 'Disabling the submit button',
                  feedback: 'Helpful for users, but clients can still send two requests.',
                },
              ],
              explanation: 'Rules that must always hold belong in the database as constraints.',
            },
            {
              id: 'sql-schema-review',
              type: 'CHECKLIST',
              prompt:
                'Review a table you have designed (or the example above) against this checklist.',
              items: [
                { id: 'primary-key', text: 'Every table has a primary key' },
                { id: 'foreign-keys', text: 'Every reference to another table is a foreign key' },
                { id: 'not-null', text: 'Required columns are NOT NULL' },
                {
                  id: 'unique-rules',
                  text: 'Business rules like "only once" are UNIQUE constraints',
                },
              ],
              explanation: 'This checklist is self-assessed; it is not graded.',
            },
          ],
          exercises: [],
          resources: [R.postgresConstraints],
          recap:
            'Keys identify and link rows; join tables model many-to-many; constraints make bad data impossible to store.',
          estimatedMinutes: 35,
          provenance: AI,
        },
        {
          id: 'sql-safe-and-fast-queries',
          order: 2,
          title: 'Safe and fast queries',
          summary:
            'Parameters against SQL injection, transactions for consistency, indexes for speed.',
          level: 5,
          skillIds: ['sql', 'postgresql'],
          objectives: [
            'Use parameterised queries',
            'Group changes in a transaction',
            'Choose an index for a query',
          ],
          explanation: [
            "Never build SQL by joining strings with user input — input such as ' OR 1=1 -- changes the query itself. Send values as parameters ($1, $2) so the database treats them only as data.",
            'A transaction (BEGIN … COMMIT) makes several changes succeed or fail together. An index lets the database find rows without scanning the whole table; it helps queries that filter or sort on its columns, at the cost of slower writes.',
          ],
          deepDive: [
            'A composite index on (user_id, created_at) serves "WHERE user_id = $1 ORDER BY created_at DESC" in one pass: rows are found by user and are already in date order. Column order matters — an index on (created_at, user_id) cannot be used the same way. Check with EXPLAIN whether an index is actually used.',
          ],
          examples: [
            {
              title: 'A parameterised query',
              description: 'The value travels separately from the SQL text.',
              code: {
                language: 'sql',
                source:
                  "-- In application code (node-postgres):\n-- client.query('SELECT title FROM jobs WHERE city = $1', [city])\nSELECT title FROM jobs WHERE city = $1;",
              },
            },
          ],
          activities: [
            {
              id: 'sql-injection-scenario',
              type: 'MULTIPLE_CHOICE',
              variant: 'SCENARIO',
              prompt:
                "A search builds \"SELECT * FROM jobs WHERE city = '\" + input + \"'\". A user types: x' OR '1'='1. What happens?",
              options: [
                {
                  id: 'a',
                  text: 'No rows: there is no city called that',
                  feedback: 'The quote in the input ends the string early and changes the query.',
                },
                {
                  id: 'b',
                  text: 'Every job is returned, because the condition becomes always true',
                  correct: true,
                  feedback: 'Right — this is SQL injection.',
                },
                {
                  id: 'c',
                  text: 'The database rejects the input automatically',
                  feedback: 'The database cannot tell injected SQL from intended SQL.',
                },
              ],
              explanation:
                "The query becomes WHERE city = 'x' OR '1'='1'. Use a parameter (WHERE city = $1) instead.",
            },
            {
              id: 'sql-choose-index',
              type: 'MULTIPLE_CHOICE',
              variant: 'DESIGN',
              prompt:
                'The slowest query is: SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20. Which index helps most?',
              options: [
                {
                  id: 'a',
                  text: '(created_at)',
                  feedback: 'It helps sorting, but every user’s rows must still be scanned.',
                },
                {
                  id: 'b',
                  text: '(user_id, created_at)',
                  correct: true,
                  feedback: 'Right — it finds the user’s rows already in date order.',
                },
                { id: 'c', text: '(status)', feedback: 'The query does not filter on status.' },
              ],
              explanation: 'Index the filter column first, then the sort column.',
            },
            {
              id: 'sql-fill-commit',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Complete the transaction so both statements are saved together.',
              segments: [
                "BEGIN;\nINSERT INTO applications (user_id, job_id, status) VALUES (7, 3, 'APPLIED');\nUPDATE jobs SET applicant_count = applicant_count + 1 WHERE id = 3;\n",
                {
                  gap: 'end',
                  label: 'statement that saves the transaction',
                  accept: ['COMMIT', 'COMMIT;', 'END', 'END;'],
                },
              ],
              explanation:
                'COMMIT makes all changes since BEGIN permanent; ROLLBACK would discard them.',
            },
          ],
          exercises: [],
          resources: [R.owaspSqlInjection, R.postgresTransactions, R.postgresIndexes],
          recap:
            'Parameters stop injection, transactions keep multi-step changes consistent, and the right index makes common queries fast.',
          estimatedMinutes: 35,
          provenance: AI,
        },
      ],
    },
    {
      id: 'sql-project',
      order: 4,
      kind: 'PORTFOLIO_PROJECT',
      title: 'Mini-project: job-search analytics',
      description: 'Design a small schema and answer real questions with it.',
      objectives: ['Apply modelling and querying to a realistic data set'],
      lessons: [],
      project: {
        id: 'job-search-analytics',
        title: 'Job-search analytics database',
        brief:
          'Model jobs, companies, applications and status changes, load sample data you write yourself, and answer questions about a job search with SQL.',
        requirements: [
          'A schema with primary keys, foreign keys, NOT NULL and at least one UNIQUE and one CHECK constraint',
          'At least 20 rows of sample data you created (no real personal data)',
          'Queries for: applications per status, response rate per company, jobs never applied to, and the average days between applying and interviewing',
          'An index justified by one of your queries, with EXPLAIN output before and after',
          'A README explaining the schema and each query',
        ],
        skills: ['SQL', 'PostgreSQL', 'Data Modelling'],
        estimatedHours: 6,
        provenance: AI,
      },
    },
  ],
};
