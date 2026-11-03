import { AI_UNREVIEWED as AI, type CourseSource, RESOURCES as R } from './content.js';

export const JAVASCRIPT_ESSENTIALS: CourseSource = {
  id: 'javascript-essentials',
  title: 'JavaScript essentials',
  description:
    'The JavaScript every web developer uses daily — values, functions, arrays, asynchronous code and debugging — learned by reading and predicting real code.',
  format: 'SKILL_COURSE',
  category: 'SOFTWARE_DEVELOPMENT',
  roles: [
    'FRONTEND_DEVELOPER',
    'BACKEND_DEVELOPER',
    'FULL_STACK_DEVELOPER',
    'QA_TESTER',
    'AI_APPLICATION_DEVELOPER',
  ],
  skillIds: ['javascript'],
  prerequisiteCourseIds: [],
  difficulty: 'BEGINNER',
  status: 'PUBLISHED',
  lastReviewedOn: null,
  outcomes: [
    'Predict what everyday JavaScript prints, including type coercion',
    'Write functions and understand closures',
    'Transform data with map, filter and reduce without mutating it',
    'Write and debug asynchronous code with promises and async/await',
    'Read error messages and fix the most common runtime errors',
  ],
  prerequisites: [
    'No prior programming needed',
    'A browser — its developer console is enough to try the examples',
  ],
  provenance: AI,
  diagnostic: {
    title: 'JavaScript starting point',
    instructions:
      'Five questions, one per lesson. Predict the result without running the code. The result only suggests which lessons you could skim.',
    questions: [
      {
        id: 'js-dx-coercion',
        lessonId: 'js-values-and-types',
        prompt: 'What does this print?',
        code: { language: 'javascript', source: "console.log(1 + '2');" },
        options: [
          { id: 'a', text: '3' },
          { id: 'b', text: '12', correct: true },
          { id: 'c', text: 'NaN' },
          { id: 'd', text: 'An error' },
        ],
        explanation:
          'When one operand of + is a string, the other is converted to a string and they are joined.',
      },
      {
        id: 'js-dx-closure',
        lessonId: 'js-functions-and-scope',
        prompt: 'What does this print?',
        code: {
          language: 'javascript',
          source:
            'function makeCounter() {\n  let count = 0;\n  return () => ++count;\n}\nconst next = makeCounter();\nnext();\nconsole.log(next());',
        },
        options: [
          { id: 'a', text: '0' },
          { id: 'b', text: '1' },
          { id: 'c', text: '2', correct: true },
        ],
        explanation:
          'The returned function keeps access to count (a closure), so each call increases the same variable.',
      },
      {
        id: 'js-dx-filter-map',
        lessonId: 'js-arrays-and-objects',
        prompt: 'What is the value of result?',
        code: {
          language: 'javascript',
          source: 'const result = [1, 2, 3, 4].filter((n) => n > 2).map((n) => n * 2);',
        },
        options: [
          { id: 'a', text: '[6, 8]', correct: true },
          { id: 'b', text: '[2, 4, 6, 8]' },
          { id: 'c', text: '[3, 4]' },
        ],
        explanation: 'filter keeps 3 and 4; map doubles them.',
      },
      {
        id: 'js-dx-event-loop',
        lessonId: 'js-async',
        prompt: 'In which order are the letters printed?',
        code: {
          language: 'javascript',
          source:
            "console.log('A');\nsetTimeout(() => console.log('B'), 0);\nPromise.resolve().then(() => console.log('C'));\nconsole.log('D');",
        },
        options: [
          { id: 'a', text: 'A B C D' },
          { id: 'b', text: 'A D C B', correct: true },
          { id: 'c', text: 'A D B C' },
        ],
        explanation:
          'Synchronous code runs first (A, D), then promise callbacks (C), then timers (B).',
      },
      {
        id: 'js-dx-optional-chaining',
        lessonId: 'js-errors-and-debugging',
        prompt:
          'user.profile is undefined. Which expression returns undefined instead of throwing?',
        options: [
          { id: 'a', text: 'user.profile.name' },
          { id: 'b', text: 'user.profile?.name', correct: true },
          { id: 'c', text: 'user?.profile.name' },
        ],
        explanation:
          '?. stops and returns undefined when the value on its left is null or undefined.',
      },
    ],
  },
  modules: [
    {
      id: 'js-foundations',
      order: 1,
      kind: 'FOUNDATIONS',
      title: 'Values and functions',
      description: 'The building blocks: values, variables, comparisons and functions.',
      objectives: [
        'Predict how values combine and compare',
        'Write functions and explain closures',
      ],
      project: null,
      lessons: [
        {
          id: 'js-values-and-types',
          order: 1,
          title: 'Values, variables and comparisons',
          summary: 'let, const, the basic types, and why === beats ==.',
          level: 1,
          skillIds: ['javascript'],
          objectives: [
            'Choose between let and const',
            'Predict type coercion and use strict equality',
          ],
          explanation: [
            'Use const for values that are never reassigned and let for ones that are. The basic types are string, number, boolean, null, undefined (plus bigint and symbol); objects and arrays hold collections.',
            'JavaScript converts types automatically in some operations: 1 + "2" is "12". == also converts before comparing, which causes surprises, so compare with === (no conversion) by default.',
          ],
          deepDive: [
            'const prevents reassigning the variable, not changing the value: a const array can still have items pushed into it. typeof null is "object" — a long-standing quirk kept for compatibility — so check for null with value === null.',
          ],
          examples: [
            {
              title: 'Strict and loose equality',
              description: '== converts the string to a number first; === does not.',
              code: {
                language: 'javascript',
                source: "console.log('5' == 5);\nconsole.log('5' === 5);",
              },
              expectedOutput: 'true\nfalse',
            },
          ],
          activities: [
            {
              id: 'js-plus-string',
              type: 'MULTIPLE_CHOICE',
              variant: 'CODE_READING',
              prompt: 'What does this print?',
              code: { language: 'javascript', source: "console.log(10 + '5' + 1);" },
              options: [
                {
                  id: 'a',
                  text: '16',
                  feedback:
                    'Addition happens left to right; after 10 + "5" the value is already a string.',
                },
                {
                  id: 'b',
                  text: '1051',
                  correct: true,
                  feedback: 'Right — "105" + 1 joins as text.',
                },
                {
                  id: 'c',
                  text: '106',
                  feedback:
                    'That would need the string to be converted to a number, which + does not do.',
                },
              ],
              explanation:
                'With a string operand, + concatenates. 10 + "5" is "105", then "105" + 1 is "1051".',
            },
            {
              id: 'js-strict-equality-output',
              type: 'SHORT_ANSWER',
              variant: 'EXPECTED_OUTPUT',
              prompt: 'What does this print?',
              code: { language: 'javascript', source: "const id = '42';\nconsole.log(id === 42);" },
              accept: ['false'],
              commonMistakes: [
                {
                  answer: 'true',
                  feedback: '=== does not convert types: the string "42" is not the number 42.',
                },
              ],
              explanation:
                '=== compares type and value without conversion, so a string never equals a number.',
            },
            {
              id: 'js-fill-let',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Choose the keyword so the variable can be reassigned on the next line.',
              segments: [
                { gap: 'keyword', label: 'declaration keyword', accept: ['let'] },
                ' attempts = 0;\nattempts = attempts + 1;',
              ],
              hint: 'const would throw on the second line.',
              explanation: 'let allows reassignment; const does not.',
            },
            {
              id: 'js-types-cards',
              type: 'REVISION_CARDS',
              prompt: 'Revise the basics.',
              cards: [
                {
                  front: 'let or const by default?',
                  back: 'const — switch to let only when you reassign.',
                },
                { front: "What is 1 + '2'?", back: "'12' (string concatenation)" },
                {
                  front: 'Which equality should you use?',
                  back: '=== (strict, no type conversion)',
                },
              ],
            },
          ],
          exercises: [],
          resources: [R.mdnJsGrammar, R.mdnEquality],
          recap: 'Prefer const, compare with ===, and remember + with a string joins text.',
          estimatedMinutes: 20,
          provenance: AI,
        },
        {
          id: 'js-functions-and-scope',
          order: 2,
          title: 'Functions, scope and closures',
          summary: 'Functions are values, and they remember where they were created.',
          level: 2,
          skillIds: ['javascript'],
          objectives: [
            'Write function declarations and arrow functions',
            'Explain what a closure captures',
          ],
          explanation: [
            'A function takes parameters and returns a value. Arrow functions ((a, b) => a + b) are a shorter way to write one. Functions are values: you can store them, pass them to other functions and return them.',
            'Variables declared with let and const exist only inside their block { … }. A function created inside another keeps access to the outer variables even after the outer function returns — that is a closure.',
          ],
          examples: [
            {
              title: 'A function that returns a function',
              description: 'Each greeter remembers its own greeting.',
              code: {
                language: 'javascript',
                source:
                  "const greeter = (greeting) => (name) => `${greeting}, ${name}!`;\nconst hello = greeter('Hello');\nconsole.log(hello('Sam'));",
              },
              expectedOutput: 'Hello, Sam!',
            },
          ],
          activities: [
            {
              id: 'js-closure-output',
              type: 'SHORT_ANSWER',
              variant: 'EXPECTED_OUTPUT',
              prompt: 'What does the last line print?',
              code: {
                language: 'javascript',
                source:
                  'function makeCounter() {\n  let count = 0;\n  return () => {\n    count += 1;\n    return count;\n  };\n}\nconst a = makeCounter();\nconst b = makeCounter();\na();\na();\nconsole.log(a() + b());',
              },
              accept: ['4'],
              commonMistakes: [
                {
                  answer: '2',
                  feedback:
                    'a and b each have their own count: a() returns 3 on its third call, b() returns 1.',
                },
                {
                  answer: '6',
                  feedback: 'b has a separate count that starts at 0, so b() returns 1, not 3.',
                },
              ],
              hint: 'Each call to makeCounter creates a new count.',
              explanation: 'a() is called three times (3) and b() once (1): 3 + 1 = 4.',
            },
            {
              id: 'js-debug-const-reassign',
              type: 'MULTIPLE_CHOICE',
              variant: 'DEBUGGING',
              prompt: 'This throws "TypeError: Assignment to constant variable." What is the fix?',
              code: {
                language: 'javascript',
                source:
                  'const total = 0;\nfor (const price of [5, 10]) {\n  total = total + price;\n}',
              },
              options: [
                {
                  id: 'a',
                  text: 'Declare total with let',
                  correct: true,
                  feedback: 'Right — total is reassigned, so it needs let.',
                },
                {
                  id: 'b',
                  text: 'Change const price to let price',
                  feedback: 'price is never reassigned inside the loop; total is.',
                },
                {
                  id: 'c',
                  text: 'Wrap the loop in try/catch',
                  feedback: 'That hides the error instead of fixing it.',
                },
              ],
              explanation: 'A const binding cannot be reassigned. Use let for accumulators.',
            },
          ],
          exercises: [],
          resources: [R.mdnClosures],
          recap:
            'Functions are values; inner functions keep access to outer variables (closures). Reassigned variables need let.',
          estimatedMinutes: 25,
          provenance: AI,
        },
      ],
    },
    {
      id: 'js-working-with-data',
      order: 2,
      kind: 'CORE_CONCEPTS',
      title: 'Data and asynchronous code',
      description: 'Transform collections and work with values that arrive later.',
      objectives: [
        'Use array methods without mutating data',
        'Write async code that handles errors',
      ],
      project: null,
      lessons: [
        {
          id: 'js-arrays-and-objects',
          order: 1,
          title: 'Arrays, objects and immutability',
          summary: 'map, filter, reduce, destructuring and spread.',
          level: 2,
          skillIds: ['javascript'],
          objectives: [
            'Transform arrays with map, filter and reduce',
            'Copy and update objects without mutating them',
          ],
          explanation: [
            'map transforms every item, filter keeps the items that pass a test, and reduce combines items into one value. All three return a new value and leave the original array unchanged.',
            'Spread copies: [...list, item] or { ...job, status: "APPLIED" } creates a new array or object. Destructuring pulls values out: const { title, company } = job.',
          ],
          deepDive: [
            'Some array methods do mutate: push, pop, splice, sort and reverse change the array in place. sort also compares items as strings by default, so numbers need a comparator: scores.sort((a, b) => a - b). Newer methods such as toSorted return a sorted copy instead.',
          ],
          examples: [
            {
              title: 'Titles of remote jobs',
              description: 'filter then map, without touching jobs.',
              code: {
                language: 'javascript',
                source:
                  "const jobs = [\n  { title: 'Frontend Developer', remote: true },\n  { title: 'Data Analyst', remote: false },\n];\nconst titles = jobs.filter((job) => job.remote).map((job) => job.title);\nconsole.log(titles);",
              },
              expectedOutput: "[ 'Frontend Developer' ]",
            },
          ],
          activities: [
            {
              id: 'js-filter-map-output',
              type: 'SHORT_ANSWER',
              variant: 'EXPECTED_OUTPUT',
              prompt: 'What is the value of result? Write it as an array, e.g. [1, 2].',
              code: {
                language: 'javascript',
                source:
                  'const result = [1, 2, 3, 4].filter((n) => n % 2 === 0).map((n) => n * 10);',
              },
              accept: ['[20, 40]', '[20,40]', '20, 40', '20,40'],
              commonMistakes: [
                {
                  answer: '[10, 30]',
                  feedback: 'n % 2 === 0 keeps the even numbers (2 and 4), not the odd ones.',
                },
              ],
              explanation: 'filter keeps 2 and 4; map multiplies each by 10, giving [20, 40].',
            },
            {
              id: 'js-sort-numbers',
              type: 'MULTIPLE_CHOICE',
              variant: 'CODE_READING',
              prompt: 'What does this print?',
              code: { language: 'javascript', source: 'console.log([10, 9, 1].sort());' },
              options: [
                {
                  id: 'a',
                  text: '[1, 9, 10]',
                  feedback: 'That needs a numeric comparator: sort((a, b) => a - b).',
                },
                {
                  id: 'b',
                  text: '[1, 10, 9]',
                  correct: true,
                  feedback: 'Right — default sort compares as strings, and "10" comes before "9".',
                },
                {
                  id: 'c',
                  text: '[10, 9, 1]',
                  feedback: 'sort does reorder the array; it just compares as text by default.',
                },
              ],
              explanation:
                'Without a comparator, sort converts items to strings and compares them character by character.',
            },
            {
              id: 'js-fill-map',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Complete the line so titles is a new array of every job’s title.',
              segments: [
                'const titles = jobs.',
                { gap: 'method', label: 'array method', accept: ['map'] },
                '((job) => job.title);',
              ],
              explanation: 'map returns a new array with one transformed item per input item.',
            },
            {
              id: 'js-immutable-update',
              type: 'MULTIPLE_CHOICE',
              variant: 'CONCEPT',
              prompt: 'Which line returns an updated copy of job without changing the original?',
              options: [
                {
                  id: 'a',
                  text: "job.status = 'APPLIED'; return job;",
                  feedback: 'That mutates the original object.',
                },
                {
                  id: 'b',
                  text: "return { ...job, status: 'APPLIED' };",
                  correct: true,
                  feedback: 'Right — spread copies the fields into a new object.',
                },
                {
                  id: 'c',
                  text: "const copy = job; copy.status = 'APPLIED'; return copy;",
                  feedback: 'copy points to the same object, so the original changes too.',
                },
              ],
              explanation:
                'Spreading into a new object creates a shallow copy that you can change safely.',
            },
          ],
          exercises: [
            {
              id: 'js-transform-jobs-exercise',
              title: 'Transform a list of jobs',
              instructions:
                'In your browser console, create an array of 5 job objects with title, company, remote (true/false) and salaryMin (a number). Using filter, map and reduce: list the titles of remote jobs; create a copy of the array where every company name is in capitals; and calculate the average salaryMin.',
              successCriteria: [
                'The original array is unchanged afterwards (check it with console.log)',
                'No for loops are used',
                'You predicted each result before running it',
              ],
              estimatedMinutes: 25,
              provenance: AI,
            },
          ],
          resources: [R.mdnArray],
          recap:
            'map transforms, filter selects, reduce combines — all without mutating. Spread makes copies; default sort compares text.',
          estimatedMinutes: 30,
          provenance: AI,
        },
        {
          id: 'js-async',
          order: 2,
          title: 'Promises and async/await',
          summary: 'Work with results that arrive later, and handle failures.',
          level: 3,
          skillIds: ['javascript'],
          objectives: [
            'Await promises and handle errors with try/catch',
            'Predict the order of asynchronous callbacks',
          ],
          explanation: [
            'Network requests and timers finish later, so they return a promise: a placeholder for a future value. Inside an async function, await pauses until the promise settles and gives you its value.',
            'If a promise fails, await throws — wrap it in try/catch. fetch only rejects on network failure; for HTTP errors like 404 you must check response.ok yourself.',
          ],
          deepDive: [
            'JavaScript runs one task at a time. After the current code finishes, it runs all pending promise callbacks (microtasks) before the next timer or event (macrotasks). That is why a resolved promise’s .then runs before setTimeout(…, 0).',
          ],
          examples: [
            {
              title: 'Loading jobs safely',
              description: 'Checks the status and handles both kinds of failure.',
              code: {
                language: 'javascript',
                source:
                  "async function loadJobs() {\n  try {\n    const response = await fetch('/api/jobs');\n    if (!response.ok) throw new Error(`HTTP ${response.status}`);\n    return await response.json();\n  } catch (error) {\n    console.error('Could not load jobs:', error.message);\n    return [];\n  }\n}",
              },
            },
          ],
          activities: [
            {
              id: 'js-event-loop-order',
              type: 'SHORT_ANSWER',
              variant: 'EXPECTED_OUTPUT',
              prompt: 'Write the letters in the order they are printed, e.g. A B C D.',
              code: {
                language: 'javascript',
                source:
                  "console.log('A');\nsetTimeout(() => console.log('B'), 0);\nPromise.resolve().then(() => console.log('C'));\nconsole.log('D');",
              },
              accept: ['A D C B', 'ADCB', 'A, D, C, B', 'A,D,C,B'],
              commonMistakes: [
                {
                  answer: 'A B C D',
                  feedback:
                    'setTimeout and .then callbacks never run before the current code finishes.',
                },
                {
                  answer: 'A D B C',
                  feedback: 'Promise callbacks (microtasks) run before timers.',
                },
              ],
              hint: 'Synchronous code first, then promise callbacks, then timers.',
              explanation: 'A and D are synchronous; C is a microtask; B is a timer task.',
            },
            {
              id: 'js-debug-missing-await',
              type: 'MULTIPLE_CHOICE',
              variant: 'DEBUGGING',
              prompt: 'This logs "Promise { <pending> }" instead of the jobs. What is wrong?',
              code: {
                language: 'javascript',
                source:
                  "async function show() {\n  const response = await fetch('/api/jobs');\n  const jobs = response.json();\n  console.log(jobs);\n}",
              },
              options: [
                {
                  id: 'a',
                  text: 'response.json() also returns a promise and needs await',
                  correct: true,
                  feedback: 'Right — const jobs = await response.json();',
                },
                {
                  id: 'b',
                  text: 'fetch should not be awaited',
                  feedback: 'fetch must be awaited too; the problem is the second promise.',
                },
                {
                  id: 'c',
                  text: 'console.log cannot print arrays',
                  feedback: 'It can; it is printing a promise here.',
                },
              ],
              explanation: 'Reading the body is asynchronous too, so json() returns a promise.',
            },
            {
              id: 'js-fill-await',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Complete the line so response holds the response, not a promise.',
              segments: [
                'const response = ',
                { gap: 'keyword', label: 'keyword', accept: ['await'] },
                " fetch('/api/jobs');",
              ],
              explanation: 'await unwraps the promise inside an async function.',
            },
          ],
          exercises: [
            {
              id: 'js-fetch-practice',
              title: 'Load and display data',
              instructions:
                'In a small HTML page, fetch a public JSON file of your own (for example a jobs.json next to the page), render the titles as a list, and show a friendly message if the request fails or the file is missing.',
              successCriteria: [
                'Titles appear when the file exists',
                'A clear message appears for a 404 or network error (check response.ok)',
                'There is no "Promise { <pending> }" in the output',
              ],
              estimatedMinutes: 40,
              provenance: AI,
            },
          ],
          resources: [R.mdnPromises, R.mdnFetch],
          recap:
            'await unwraps promises; wrap awaits in try/catch; check response.ok. Microtasks run before timers.',
          estimatedMinutes: 35,
          provenance: AI,
        },
      ],
    },
    {
      id: 'js-robust-code',
      order: 3,
      kind: 'HANDS_ON',
      title: 'Debugging and robust code',
      description: 'Read error messages, handle missing data and debug methodically.',
      objectives: ['Diagnose common runtime errors', 'Handle missing values with ?. and ??'],
      project: null,
      lessons: [
        {
          id: 'js-errors-and-debugging',
          order: 1,
          title: 'Errors, missing data and debugging',
          summary: 'Read the error, find the line, check your assumptions.',
          level: 4,
          skillIds: ['javascript'],
          objectives: ['Explain "Cannot read properties of undefined"', 'Choose between || and ??'],
          explanation: [
            'The most common runtime error is "TypeError: Cannot read properties of undefined (reading \'name\')": something you expected to be an object is undefined. Optional chaining (user.profile?.name) returns undefined instead of throwing.',
            'For defaults, a ?? b uses b only when a is null or undefined, while a || b also replaces 0, "" and false. Use ?? when 0 or an empty string are valid values.',
          ],
          examples: [
            {
              title: '|| versus ??',
              description: 'Only ?? keeps a valid 0.',
              code: {
                language: 'javascript',
                source: 'const unread = 0;\nconsole.log(unread || 10);\nconsole.log(unread ?? 10);',
              },
              expectedOutput: '10\n0',
            },
          ],
          activities: [
            {
              id: 'js-debug-undefined-property',
              type: 'MULTIPLE_CHOICE',
              variant: 'DEBUGGING',
              prompt:
                'This throws "Cannot read properties of undefined (reading \'city\')" for some users. What is the most likely cause?',
              code: {
                language: 'javascript',
                source: 'const label = `${user.name} — ${user.address.city}`;',
              },
              options: [
                {
                  id: 'a',
                  text: 'Some users have no address, so user.address is undefined',
                  correct: true,
                  feedback: 'Right — use user.address?.city and decide what to show instead.',
                },
                {
                  id: 'b',
                  text: 'Template literals cannot contain property access',
                  feedback: 'They can contain any expression.',
                },
                {
                  id: 'c',
                  text: 'user is undefined',
                  feedback: 'Then the error would mention reading "name", which comes first.',
                },
              ],
              explanation:
                'The property named in the message (city) was read from an undefined value (user.address).',
            },
            {
              id: 'js-nullish-output',
              type: 'SHORT_ANSWER',
              variant: 'EXPECTED_OUTPUT',
              prompt: 'What does this print?',
              code: { language: 'javascript', source: "console.log(0 || 'none', 0 ?? 'none');" },
              accept: ['none 0'],
              commonMistakes: [
                {
                  answer: 'none none',
                  feedback: '?? only replaces null and undefined, and 0 is neither.',
                },
                { answer: '0 0', feedback: '|| replaces any falsy value, including 0.' },
              ],
              explanation:
                "0 || 'none' is 'none' (0 is falsy); 0 ?? 'none' is 0 (0 is not null or undefined).",
            },
            {
              id: 'js-debugging-checklist',
              type: 'CHECKLIST',
              prompt: 'Next time something breaks, work through these steps.',
              items: [
                {
                  id: 'read-message',
                  text: 'Read the whole error message and note the property or value it names',
                },
                { id: 'find-line', text: 'Open the file and line from the stack trace' },
                {
                  id: 'inspect-values',
                  text: 'Log or inspect the values on that line (debugger or console.log)',
                },
                { id: 'smallest-case', text: 'Reproduce with the smallest input that still fails' },
                { id: 'add-test', text: 'Add a test or check that would have caught it' },
              ],
              explanation: 'Self-assessed checklist; not graded.',
            },
            {
              id: 'js-debugging-reflection',
              type: 'REFLECTION',
              prompt:
                'Think of the last bug you fixed (in any language). Which of the steps above would have found it faster? Nothing you write here is saved.',
            },
          ],
          exercises: [],
          resources: [R.mdnOptionalChaining, R.mdnNullish],
          recap:
            'Read the message, find the undefined value, guard with ?. and default with ?? when 0 or "" are valid.',
          estimatedMinutes: 30,
          provenance: AI,
        },
      ],
    },
    {
      id: 'js-project',
      order: 4,
      kind: 'PORTFOLIO_PROJECT',
      title: 'Mini-project: job board filter',
      description: 'Combine everything in a small, working browser app.',
      objectives: ['Build and explain a small interactive page'],
      lessons: [],
      project: {
        id: 'job-board-filter',
        title: 'Job board with search and filters',
        brief:
          'A single page, with no framework, that loads jobs from a local JSON file and lets users search by title and filter by remote or on-site.',
        requirements: [
          'Data loaded with fetch and async/await, with loading and error messages',
          'Search and filter implemented with filter/map, never mutating the loaded data',
          'Accessible markup: a labelled search box, buttons for toggles, and results announced as a list',
          'No errors when a job is missing optional fields (use ?. and ??)',
          'A README explaining one bug you hit and how you found it',
        ],
        skills: ['JavaScript', 'HTML', 'Accessibility'],
        estimatedHours: 5,
        provenance: AI,
      },
    },
  ],
};
