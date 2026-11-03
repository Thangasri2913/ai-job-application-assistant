import { AI_UNREVIEWED as AI, type CourseSource, RESOURCES as R } from './content.js';

export const SOFTWARE_TESTING_FUNDAMENTALS: CourseSource = {
  id: 'software-testing-fundamentals',
  title: 'Software testing fundamentals',
  description:
    'Design test cases that find real defects, write bug reports developers can act on, and decide what to automate — with practical exercises throughout.',
  format: 'SKILL_COURSE',
  category: 'QUALITY_ASSURANCE',
  roles: ['QA_TESTER', 'FRONTEND_DEVELOPER', 'BACKEND_DEVELOPER', 'FULL_STACK_DEVELOPER'],
  skillIds: ['software-testing', 'test-automation'],
  prerequisiteCourseIds: [],
  difficulty: 'BEGINNER',
  status: 'PUBLISHED',
  lastReviewedOn: null,
  outcomes: [
    'Explain what testing can and cannot show, and the levels of testing',
    'Derive test cases with equivalence partitioning and boundary values',
    'Write clear, reproducible bug reports',
    'Read and write simple automated tests and avoid flaky ones',
  ],
  prerequisites: [
    'No testing experience needed',
    'Lesson 4 is easier with basic JavaScript (see JavaScript essentials)',
  ],
  provenance: AI,
  diagnostic: {
    title: 'Testing starting point',
    instructions:
      'Four questions, one per lesson. The result only suggests which lessons you could skim.',
    questions: [
      {
        id: 'qa-dx-absence',
        lessonId: 'qa-why-we-test',
        prompt: 'All 200 tests pass. What can you conclude?',
        options: [
          { id: 'a', text: 'The software has no defects' },
          {
            id: 'b',
            text: 'The tested behaviour works as checked; untested defects may remain',
            correct: true,
          },
          { id: 'c', text: 'No more testing is ever needed' },
        ],
        explanation: 'Testing shows the presence of defects, not their absence.',
      },
      {
        id: 'qa-dx-boundaries',
        lessonId: 'qa-test-design',
        prompt:
          'A field accepts whole numbers from 1 to 100 inclusive. Which values test the boundaries best?',
        options: [
          { id: 'a', text: '0, 1, 100, 101', correct: true },
          { id: 'b', text: '50 and 75' },
          { id: 'c', text: '-1000 and 1000' },
        ],
        explanation: 'Boundary value analysis tests each edge and the value just outside it.',
      },
      {
        id: 'qa-dx-bug-report',
        lessonId: 'qa-bug-reports',
        prompt: 'Which detail is most essential in a bug report?',
        options: [
          { id: 'a', text: 'Steps to reproduce, with expected and actual results', correct: true },
          { id: 'b', text: 'Who wrote the code' },
          { id: 'c', text: 'How annoying the bug is' },
        ],
        explanation:
          'Without reproducible steps and expected vs actual results, a developer cannot confirm the bug.',
      },
      {
        id: 'qa-dx-flaky',
        lessonId: 'qa-automation-basics',
        prompt:
          'An end-to-end test sometimes fails because it waits a fixed 2 seconds for a page. Best fix?',
        options: [
          { id: 'a', text: 'Wait 10 seconds instead' },
          { id: 'b', text: 'Wait for the expected element or state to appear', correct: true },
          { id: 'c', text: 'Retry the test until it passes and ignore failures' },
        ],
        explanation:
          'Waiting for a condition is both faster and reliable; fixed sleeps cause flaky tests.',
      },
    ],
  },
  modules: [
    {
      id: 'qa-foundations',
      order: 1,
      kind: 'FOUNDATIONS',
      title: 'Thinking like a tester',
      description: 'Why we test, what tests can show, and how to choose test cases.',
      objectives: ['Explain the purpose and limits of testing', 'Design test cases systematically'],
      project: null,
      lessons: [
        {
          id: 'qa-why-we-test',
          order: 1,
          title: 'Why we test and what tests show',
          summary: 'Testing reduces risk; it cannot prove there are no defects.',
          level: 1,
          skillIds: ['software-testing'],
          objectives: ['Distinguish a defect from a failure', 'Name the levels of testing'],
          explanation: [
            'Testing gives information about quality and reduces the risk of failures reaching users. A defect is a flaw in the code or requirements; a failure is what users see when that defect is triggered. Passing tests show that the checked behaviour works — never that no defects remain.',
            'Tests run at different levels: unit (one function or component), integration (parts working together), system (the whole application) and acceptance (does it meet the user’s needs). Many fast unit tests and fewer slow end-to-end tests is a common, cost-effective balance (the "test pyramid").',
          ],
          examples: [],
          activities: [
            {
              id: 'qa-defect-or-failure',
              type: 'MULTIPLE_CHOICE',
              variant: 'CONCEPT',
              prompt:
                'A user sees the total price shown as NaN. In testing terms, what did they observe?',
              options: [
                {
                  id: 'a',
                  text: 'A failure, caused by an underlying defect',
                  correct: true,
                  feedback:
                    'Right — the visible wrong behaviour is the failure; the bug in the code is the defect.',
                },
                {
                  id: 'b',
                  text: 'A defect, but not a failure',
                  feedback: 'A defect is the flaw itself; what the user sees is the failure.',
                },
                {
                  id: 'c',
                  text: 'A test case',
                  feedback: 'A test case is a designed check, not an observed problem.',
                },
              ],
              explanation:
                'Defect = flaw in the product; failure = the defect showing up when the software runs.',
            },
            {
              id: 'qa-pyramid',
              type: 'MULTIPLE_CHOICE',
              variant: 'DESIGN',
              prompt:
                'Your team has 300 end-to-end tests and 20 unit tests. The suite takes an hour and often breaks. What is the usual advice?',
              options: [
                {
                  id: 'a',
                  text: 'Add more end-to-end tests',
                  feedback: 'That makes the suite slower and more fragile.',
                },
                {
                  id: 'b',
                  text: 'Move most checks down to fast unit and integration tests; keep a few end-to-end tests for key journeys',
                  correct: true,
                  feedback: 'Right — that is the test pyramid.',
                },
                {
                  id: 'c',
                  text: 'Stop running tests automatically',
                  feedback: 'That removes the safety net entirely.',
                },
              ],
              explanation:
                'Fast, focused tests catch most problems cheaply; a few end-to-end tests confirm critical paths.',
            },
            {
              id: 'qa-levels-cards',
              type: 'REVISION_CARDS',
              prompt: 'Revise the test levels.',
              cards: [
                { front: 'Unit test', back: 'Checks one function or component in isolation.' },
                {
                  front: 'Integration test',
                  back: 'Checks that parts work together (e.g. API + database).',
                },
                {
                  front: 'System / end-to-end test',
                  back: 'Checks the whole application through its real interface.',
                },
                {
                  front: 'Acceptance test',
                  back: 'Checks the product meets the user’s or business’s needs.',
                },
              ],
            },
          ],
          exercises: [],
          resources: [R.istqbGlossary, R.testPyramid],
          recap:
            'Tests reduce risk but cannot prove the absence of defects. Balance many fast tests with a few end-to-end ones.',
          estimatedMinutes: 20,
          provenance: AI,
        },
        {
          id: 'qa-test-design',
          order: 2,
          title: 'Designing test cases',
          summary: 'Equivalence partitions and boundary values find bugs with few tests.',
          level: 2,
          skillIds: ['software-testing'],
          objectives: [
            'Split inputs into equivalence partitions',
            'Choose boundary values',
            'Write a test case with an expected result',
          ],
          explanation: [
            'Equivalence partitioning groups inputs that the system should treat the same way, so one value per group is enough. For an age field accepting 18–65, the partitions are below 18 (invalid), 18–65 (valid) and above 65 (invalid).',
            'Defects cluster at edges, so boundary value analysis tests each boundary and the value just outside it: 17, 18, 65 and 66. Every test case states its preconditions, steps and the expected result — decided before running it.',
          ],
          examples: [
            {
              title: 'A written test case',
              description:
                'Title: Age 17 is rejected. Precondition: sign-up form open. Steps: enter 17 in Age, submit. Expected: the form is not submitted and "You must be at least 18" appears next to Age.',
            },
          ],
          activities: [
            {
              id: 'qa-partitions-count',
              type: 'SHORT_ANSWER',
              variant: 'CONCEPT',
              prompt:
                'A discount applies to orders from 50 to 200 (inclusive). How many equivalence partitions are there for the order amount?',
              accept: ['3', 'three'],
              commonMistakes: [
                {
                  answer: '2',
                  feedback:
                    'There are two invalid groups: below 50 and above 200, plus the valid range.',
                },
              ],
              hint: 'Think: too small, just right, too large.',
              explanation: 'Below 50, 50–200 and above 200: three partitions.',
            },
            {
              id: 'qa-boundary-values',
              type: 'MULTIPLE_CHOICE',
              variant: 'DESIGN',
              prompt: 'For the 50–200 discount rule, which set of amounts tests the boundaries?',
              options: [
                {
                  id: 'a',
                  text: '49, 50, 200, 201',
                  correct: true,
                  feedback: 'Right — each edge and the value just outside it.',
                },
                {
                  id: 'b',
                  text: '100, 150',
                  feedback:
                    'Both are in the middle of the valid range, where bugs are least likely.',
                },
                {
                  id: 'c',
                  text: '0, 1000',
                  feedback: 'Far from the edges; an off-by-one error would be missed.',
                },
              ],
              explanation:
                'Off-by-one mistakes (using > instead of >=) only show up exactly at the boundary.',
            },
            {
              id: 'qa-fill-expected-result',
              type: 'FILL_IN_THE_GAP',
              prompt: 'Complete the parts of a test case.',
              segments: [
                'A test case has preconditions, steps and an ',
                {
                  gap: 'part',
                  label: 'missing part',
                  accept: ['expected result', 'expected outcome', 'expected results'],
                },
                ' that is decided before the test is run.',
              ],
              explanation:
                'Deciding the expected result first stops you accepting whatever the software happens to do.',
            },
          ],
          exercises: [
            {
              id: 'qa-design-tests-exercise',
              title: 'Test a password rule',
              instructions:
                'A password must be 8–64 characters and contain at least one digit. Write test cases using equivalence partitions and boundary values. Include preconditions, steps and expected results.',
              successCriteria: [
                'Covers lengths 7, 8, 64 and 65',
                'Covers a valid-length password with and without a digit',
                'Each case has an expected result written before testing',
              ],
              estimatedMinutes: 30,
              provenance: AI,
            },
          ],
          resources: [R.istqbGlossary],
          recap:
            'One value per partition, plus each boundary and its neighbour. Write the expected result first.',
          estimatedMinutes: 30,
          provenance: AI,
        },
      ],
    },
    {
      id: 'qa-practice',
      order: 2,
      kind: 'HANDS_ON',
      title: 'Reporting and automating',
      description: 'Communicate defects clearly and automate the checks worth automating.',
      objectives: ['Write actionable bug reports', 'Read and write reliable automated tests'],
      project: null,
      lessons: [
        {
          id: 'qa-bug-reports',
          order: 1,
          title: 'Bug reports developers can act on',
          summary: 'Reproducible steps, expected vs actual, environment and evidence.',
          level: 3,
          skillIds: ['software-testing'],
          objectives: [
            'Write a specific title and reproducible steps',
            'Distinguish severity from priority',
          ],
          explanation: [
            'A good bug report lets someone else see the problem in minutes: a specific title, numbered steps to reproduce, the expected and actual results, the environment (browser, device, version) and evidence such as a screenshot or log.',
            'Severity is how bad the impact is; priority is how soon it should be fixed. A typo on the home page is low severity but may be high priority; a crash in a rarely used admin screen can be high severity but lower priority.',
          ],
          examples: [],
          activities: [
            {
              id: 'qa-best-title',
              type: 'MULTIPLE_CHOICE',
              variant: 'SCENARIO',
              prompt: 'Which bug report title is most useful?',
              options: [
                {
                  id: 'a',
                  text: '"Checkout broken!!!"',
                  feedback: 'It says nothing about what fails or when.',
                },
                {
                  id: 'b',
                  text: '"Checkout: total shows NaN when a discount code is applied to a cart with one item"',
                  correct: true,
                  feedback: 'Right — specific area, trigger and symptom.',
                },
                {
                  id: 'c',
                  text: '"Bug in the code"',
                  feedback: 'Every bug is in the code; this gives no information.',
                },
              ],
              explanation: 'A title should name the area, the condition and the observed problem.',
            },
            {
              id: 'qa-severity-priority',
              type: 'MULTIPLE_CHOICE',
              variant: 'CONCEPT',
              prompt:
                'The company name is misspelled on the landing page the day before a launch. How would you usually classify it?',
              options: [
                {
                  id: 'a',
                  text: 'Low severity, high priority',
                  correct: true,
                  feedback: 'Right — little functional impact, but very visible and urgent.',
                },
                {
                  id: 'b',
                  text: 'High severity, low priority',
                  feedback: 'Nothing is broken functionally, so severity is low.',
                },
                {
                  id: 'c',
                  text: 'Severity and priority are the same thing',
                  feedback: 'Impact and urgency are assessed separately.',
                },
              ],
              explanation: 'Severity = impact; priority = urgency. They are decided separately.',
            },
            {
              id: 'qa-bug-report-checklist',
              type: 'CHECKLIST',
              prompt: 'Before you submit your next bug report, check it includes:',
              items: [
                { id: 'title', text: 'A specific title (area + condition + symptom)' },
                {
                  id: 'steps',
                  text: 'Numbered steps that reproduce it from a known starting point',
                },
                { id: 'expected-actual', text: 'Expected result and actual result' },
                { id: 'environment', text: 'Environment: browser/device, version, account type' },
                {
                  id: 'evidence',
                  text: 'Evidence (screenshot, video or log) with no personal data visible',
                },
              ],
              explanation: 'Self-assessed; not graded.',
            },
          ],
          exercises: [
            {
              id: 'qa-write-bug-report-exercise',
              title: 'Write a bug report',
              instructions:
                'Scenario: on a shop’s checkout page, applying the code SAVE10 to a cart with exactly one item shows the total as "NaN". With two items it works. Write a complete bug report for this, using the checklist above.',
              successCriteria: [
                'The title names the area, the condition (one item + discount code) and the symptom',
                'Steps start from a known state and reproduce the problem every time',
                'Expected and actual results are both stated',
                'Severity and priority are given separately, with a reason for each',
              ],
              estimatedMinutes: 20,
              provenance: AI,
            },
          ],
          resources: [R.istqbGlossary],
          recap:
            'Specific title, reproducible steps, expected vs actual, environment, evidence. Severity ≠ priority.',
          estimatedMinutes: 20,
          provenance: AI,
        },
        {
          id: 'qa-automation-basics',
          order: 2,
          title: 'Automated tests that stay reliable',
          summary: 'Arrange–act–assert, what to automate, and how to avoid flaky tests.',
          level: 4,
          skillIds: ['test-automation'],
          objectives: [
            'Read and write a unit test',
            'Choose what to automate',
            'Fix a flaky end-to-end test',
          ],
          explanation: [
            'An automated test arranges the input, acts by calling the code and asserts on the result. Automate checks that are repeated often, are stable, and protect important behaviour — for example the sign-in and checkout journeys. Keep exploratory testing for discovering new problems.',
            'A flaky test passes and fails without code changes. The usual causes are fixed waits, shared state between tests and dependence on timing or order. Wait for conditions instead of time, isolate test data and find elements the way users do (by role and label).',
          ],
          examples: [
            {
              title: 'A unit test (Vitest)',
              description: 'Arrange, act, assert — including a boundary.',
              code: {
                language: 'javascript',
                source:
                  "import { describe, expect, it } from 'vitest';\nimport { discountFor } from './discount.js';\n\ndescribe('discountFor', () => {\n  it('gives 10% from 50 upwards', () => {\n    expect(discountFor(50)).toBe(5);\n  });\n  it('gives nothing below 50', () => {\n    expect(discountFor(49.99)).toBe(0);\n  });\n});",
              },
            },
          ],
          activities: [
            {
              id: 'qa-does-test-pass',
              type: 'MULTIPLE_CHOICE',
              variant: 'CODE_READING',
              prompt: 'Does this test pass?',
              code: {
                language: 'javascript',
                source:
                  "function applyDiscount(price, percent) {\n  return price - (price * percent) / 100;\n}\n\nit('applies a 10% discount', () => {\n  expect(applyDiscount(200, 10)).toBe(180);\n});",
              },
              options: [
                { id: 'a', text: 'Yes', correct: true, feedback: 'Right — 200 − 20 = 180.' },
                {
                  id: 'b',
                  text: 'No, it returns 20',
                  feedback: '20 is the discount amount; the function returns the price minus it.',
                },
                {
                  id: 'c',
                  text: 'No, toBe cannot compare numbers',
                  feedback: 'toBe compares primitive values such as numbers.',
                },
              ],
              explanation: '(200 × 10) / 100 = 20, and 200 − 20 = 180, so the assertion holds.',
            },
            {
              id: 'qa-fill-assertion',
              type: 'FILL_IN_THE_GAP',
              asCode: true,
              prompt: 'Complete the assertion so the test checks that add(2, 3) equals 5.',
              segments: [
                'expect(add(2, 3)).',
                { gap: 'matcher', label: 'matcher', accept: ['toBe', 'toEqual', 'toStrictEqual'] },
                '(5);',
              ],
              explanation:
                'toBe checks a primitive value with ===; toEqual also works for numbers.',
            },
            {
              id: 'qa-flaky-test',
              type: 'MULTIPLE_CHOICE',
              variant: 'DEBUGGING',
              prompt: 'This Playwright test fails about one run in ten. What is the best fix?',
              code: {
                language: 'javascript',
                source:
                  "await page.getByRole('button', { name: 'Search' }).click();\nawait page.waitForTimeout(2000);\nexpect(await page.locator('.result').count()).toBeGreaterThan(0);",
              },
              options: [
                {
                  id: 'a',
                  text: 'Increase the timeout to 5000 ms',
                  feedback: 'Slower, and still fails when the server is slower than 5 s.',
                },
                {
                  id: 'b',
                  text: "Replace the fixed wait with a web-first assertion: await expect(page.getByRole('listitem').first()).toBeVisible()",
                  correct: true,
                  feedback:
                    'Right — the assertion retries until the condition is met or it times out.',
                },
                {
                  id: 'c',
                  text: 'Mark the test as skipped',
                  feedback: 'That hides the risk instead of fixing the test.',
                },
              ],
              explanation: 'Wait for the state you expect, not for an amount of time.',
            },
            {
              id: 'qa-what-to-automate',
              type: 'MULTIPLE_CHOICE',
              variant: 'DESIGN',
              prompt: 'Which check should you automate first?',
              options: [
                {
                  id: 'a',
                  text: 'Signing in and completing a purchase, run on every change',
                  correct: true,
                  feedback: 'Right — critical, stable and repeated constantly.',
                },
                {
                  id: 'b',
                  text: 'A one-off check of a page that is being redesigned next week',
                  feedback: 'It would need rewriting immediately.',
                },
                {
                  id: 'c',
                  text: 'Exploring a new feature for unexpected behaviour',
                  feedback: 'Exploration is valuable precisely because it is not scripted.',
                },
              ],
              explanation: 'Automate high-value, stable, frequently repeated checks.',
            },
          ],
          exercises: [],
          resources: [R.vitest, R.playwright, R.playwrightAssertions, R.testingLibrary],
          recap:
            'Arrange–act–assert; automate stable, valuable, repeated checks; wait for conditions, never fixed times.',
          estimatedMinutes: 35,
          provenance: AI,
        },
      ],
    },
    {
      id: 'qa-project',
      order: 3,
      kind: 'PORTFOLIO_PROJECT',
      title: 'Mini-project: test a small web app',
      description: 'Plan, execute and automate testing for a real (small) application.',
      objectives: ['Produce a test plan, bug reports and an automated suite'],
      lessons: [],
      project: {
        id: 'web-app-test-suite',
        title: 'Test plan and automated suite',
        brief:
          'Choose a small open-source web app or one you built. Write a one-page test plan, run exploratory sessions, report what you find, and automate the most important journeys.',
        requirements: [
          'A test plan: scope, risks, test levels and what will not be tested',
          'At least 10 designed test cases using partitions and boundaries',
          'At least 3 bug reports that follow the checklist (real or reproduced from the app)',
          'Automated tests for 2–3 critical journeys with no fixed waits',
          'A README with how to run the tests and what you learned',
        ],
        skills: ['Software Testing', 'Test Automation'],
        estimatedHours: 8,
        provenance: AI,
      },
    },
  ],
};
