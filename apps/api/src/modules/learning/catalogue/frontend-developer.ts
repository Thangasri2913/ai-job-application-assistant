import { AI_UNREVIEWED as AI, type CourseSource, RESOURCES as R } from './content.js';

export const FRONTEND_DEVELOPER: CourseSource = {
  id: 'frontend-developer',
  title: 'Frontend Developer',
  description:
    'Go from web fundamentals to building, testing and explaining accessible React applications that talk to real APIs.',
  format: 'CAREER_TRACK',
  category: 'SOFTWARE_DEVELOPMENT',
  roles: ['FRONTEND_DEVELOPER', 'FULL_STACK_DEVELOPER'],
  skillIds: [
    'html',
    'css',
    'javascript',
    'typescript',
    'react',
    'rest-apis',
    'software-testing',
    'accessibility',
    'git',
  ],
  prerequisiteCourseIds: [],
  difficulty: 'BEGINNER',
  status: 'PUBLISHED',
  lastReviewedOn: null,
  outcomes: [
    'Structure pages with semantic, accessible HTML and lay them out with modern CSS',
    'Write JavaScript and TypeScript confidently, including asynchronous code',
    'Build React components with state, forms and data loaded from an API',
    'Test components the way users use them, and cover key journeys end to end',
    'Ship a portfolio project and talk through your decisions in an interview',
  ],
  prerequisites: [
    'Comfortable using a computer and a code editor',
    'No prior programming experience required',
  ],
  provenance: AI,
  modules: [
    {
      id: 'frontend-foundations',
      order: 1,
      kind: 'FOUNDATIONS',
      title: 'Web foundations',
      description: 'How the browser turns HTML, CSS and HTTP responses into the page people use.',
      objectives: [
        'Explain what happens between typing a URL and seeing a page',
        'Choose semantic HTML elements for structure and accessibility',
        'Lay out a page with Flexbox and Grid',
      ],
      project: null,
      lessons: [
        {
          id: 'how-the-web-works',
          order: 1,
          title: 'How the web works',
          summary: 'Requests, responses and what the browser does with them.',
          skillIds: ['html', 'rest-apis'],
          objectives: [
            'Describe the request/response cycle',
            'Name what HTML, CSS and JavaScript are each responsible for',
          ],
          explanation: [
            'When you open a page, the browser sends an HTTP request to a server and receives a response: a status code (such as 200 for success or 404 for not found), headers and a body. For a page, the body is HTML.',
            'The browser parses the HTML into a tree of elements (the DOM), downloads the CSS and JavaScript it references, applies the styles and runs the scripts. HTML describes structure and meaning, CSS describes presentation, and JavaScript adds behaviour.',
            'Keeping those responsibilities separate makes pages easier to maintain, faster to load and more accessible, because assistive technologies rely on the structure HTML provides.',
          ],
          examples: [
            {
              title: 'A minimal page',
              description: 'The smallest useful HTML document: a language, a title and content.',
              code: {
                language: 'html',
                source:
                  '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>My first page</title>\n  </head>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>',
              },
            },
          ],
          exercises: [
            {
              id: 'inspect-a-request',
              title: 'Inspect a real request',
              instructions:
                'Open your browser’s developer tools on any site, reload with the Network tab open, and find the request for the page itself.',
              successCriteria: [
                'You can name its status code and content type',
                'You can point to one CSS and one JavaScript request it triggered',
              ],
              estimatedMinutes: 15,
              provenance: AI,
            },
          ],
          resources: [R.mdnHttpOverview, R.mdnLearn],
          estimatedMinutes: 30,
          provenance: AI,
        },
        {
          id: 'semantic-html',
          order: 2,
          title: 'Semantic, accessible HTML',
          summary: 'Use elements for what they mean, so every user and tool understands the page.',
          skillIds: ['html', 'accessibility'],
          objectives: [
            'Choose landmark and heading elements correctly',
            'Label form controls and images',
          ],
          explanation: [
            'Semantic elements such as header, nav, main, button and label tell browsers and screen readers what each part of the page is. A clickable div looks like a button but cannot be focused with the keyboard or announced as a button; a real button can.',
            'Use one h1 per page and nested headings in order, give every form control a visible label connected with for/id, and describe meaningful images with alt text (empty alt for decorative ones).',
          ],
          examples: [
            {
              title: 'A labelled form field',
              description:
                'The label is connected to the input, so clicking it focuses the field and screen readers announce it.',
              code: {
                language: 'html',
                source:
                  '<label for="email">Email</label>\n<input id="email" type="email" autocomplete="email" />',
              },
            },
          ],
          activities: [
            {
              id: 'fe-clickable-div',
              type: 'MULTIPLE_CHOICE',
              variant: 'DEBUGGING',
              prompt: 'Keyboard users cannot activate this "Save" control. What is the best fix?',
              code: { language: 'html', source: '<div class="btn" onclick="save()">Save</div>' },
              options: [
                {
                  id: 'a',
                  text: 'Use <button type="button" onclick="save()">Save</button>',
                  correct: true,
                  feedback:
                    'Right — a real button is focusable, works with Enter and Space, and is announced as a button.',
                },
                {
                  id: 'b',
                  text: 'Add a CSS :hover style',
                  feedback: 'Hover styles do not help keyboard or screen-reader users.',
                },
                {
                  id: 'c',
                  text: 'Make the text bold',
                  feedback: 'Styling does not change what the element is.',
                },
              ],
              explanation:
                'Native elements bring keyboard support and the right role for free; a div needs extra code to imitate them, which is easy to get wrong.',
            },
          ],
          exercises: [
            {
              id: 'fix-a-form',
              title: 'Make a sign-up form accessible',
              instructions:
                'Build a small sign-up form with name, email and a submit button, then use only the keyboard to complete it.',
              successCriteria: [
                'Every field has a visible, connected label',
                'You can reach and submit everything with Tab and Enter',
              ],
              estimatedMinutes: 30,
              provenance: AI,
            },
          ],
          resources: [R.mdnHtml, R.webDevA11y],
          estimatedMinutes: 40,
          provenance: AI,
        },
        {
          id: 'css-layout',
          order: 3,
          title: 'CSS layout with Flexbox and Grid',
          summary: 'Arrange content in rows, columns and responsive layouts.',
          skillIds: ['css'],
          objectives: [
            'Use Flexbox for one-dimensional layouts',
            'Use Grid for two-dimensional layouts',
            'Adapt a layout to small screens',
          ],
          explanation: [
            'Flexbox arranges items along one axis (a row or a column) and is ideal for toolbars, cards in a row and centring. Grid arranges items in rows and columns at once and suits page layouts and galleries.',
            'Design for small screens first, then add media queries for wider ones. Relative units (rem, %, fr) keep layouts flexible as text size and screen width change.',
          ],
          examples: [
            {
              title: 'A responsive card grid',
              description: 'Cards fill the row and wrap to new rows when the screen is narrow.',
              code: {
                language: 'css',
                source:
                  '.cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));\n  gap: 1rem;\n}',
              },
            },
          ],
          activities: [
            {
              id: 'fe-flex-or-grid',
              type: 'MULTIPLE_CHOICE',
              variant: 'DESIGN',
              prompt:
                'You need a row of buttons that wrap onto the next line on narrow screens. What is the simplest fit?',
              options: [
                {
                  id: 'a',
                  text: 'Flexbox with flex-wrap: wrap and a gap',
                  correct: true,
                  feedback: 'Right — flexbox lays items out along one direction and can wrap them.',
                },
                {
                  id: 'b',
                  text: 'Absolute positioning for each button',
                  feedback: 'Positions would not adapt to the screen width.',
                },
                { id: 'c', text: 'A table', feedback: 'Tables are for tabular data, not layout.' },
              ],
              explanation:
                'Flexbox suits one-dimensional rows or columns; grid suits two-dimensional layouts such as page regions or card grids.',
            },
          ],
          exercises: [],
          resources: [R.mdnCss],
          estimatedMinutes: 45,
          provenance: AI,
        },
      ],
    },
    {
      id: 'frontend-core-concepts',
      order: 2,
      kind: 'CORE_CONCEPTS',
      title: 'JavaScript and TypeScript',
      description: 'The language of the browser, and the type system that makes larger apps safer.',
      objectives: [
        'Use functions, arrays and objects fluently',
        'Write asynchronous code with async/await',
        'Add types to everyday code with TypeScript',
      ],
      project: null,
      lessons: [
        {
          id: 'javascript-essentials',
          order: 1,
          title: 'JavaScript essentials',
          summary: 'Values, functions, arrays and asynchronous code.',
          skillIds: ['javascript'],
          objectives: [
            'Transform data with map, filter and reduce',
            'Explain what a Promise is and use async/await',
          ],
          explanation: [
            'Most frontend code transforms data: a list of jobs becomes a list of cards, a form becomes a request. Array methods such as map and filter express those transformations without manual loops and without changing the original array.',
            'Work that takes time, such as a network request, returns a Promise: a value that will arrive later. async/await lets you write that code top to bottom while the browser stays responsive. Always handle the failure case with try/catch.',
          ],
          examples: [
            {
              title: 'Filtering and mapping',
              description: 'Keep remote jobs and turn them into display strings.',
              code: {
                language: 'javascript',
                source:
                  "const jobs = [{ title: 'Frontend Developer', remote: true }, { title: 'Designer', remote: false }];\nconst remoteTitles = jobs.filter((job) => job.remote).map((job) => job.title);\n// ['Frontend Developer']",
              },
            },
          ],
          exercises: [
            {
              id: 'summarise-a-list',
              title: 'Summarise a list',
              instructions:
                'Given an array of { title, salary } objects, write functions that return the titles sorted alphabetically and the average salary.',
              successCriteria: [
                'The original array is not modified',
                'An empty array returns sensible results instead of throwing',
              ],
              estimatedMinutes: 30,
              provenance: AI,
            },
          ],
          resources: [R.mdnJsGuide],
          estimatedMinutes: 60,
          provenance: AI,
        },
        {
          id: 'typescript-basics',
          order: 2,
          title: 'TypeScript for everyday code',
          summary: 'Describe your data with types and let the compiler catch mistakes.',
          skillIds: ['typescript'],
          objectives: ['Declare types and interfaces for data', 'Narrow union types safely'],
          explanation: [
            'TypeScript adds types to JavaScript and checks them before the code runs. Describing the shape of your data once (for example, what a Job contains) lets the editor autocomplete fields and warns you when you use one that does not exist.',
            'Union types model values that can be one of several shapes, such as a request that is loading, failed or succeeded. Checking a distinguishing field narrows the type, so each branch can only use the data that actually exists there.',
          ],
          examples: [
            {
              title: 'A union for request state',
              description: 'Each state carries only the data that makes sense for it.',
              code: {
                language: 'typescript',
                source:
                  "type Load<T> =\n  | { status: 'loading' }\n  | { status: 'error'; message: string }\n  | { status: 'ready'; data: T };",
              },
            },
          ],
          exercises: [],
          resources: [R.tsHandbook],
          estimatedMinutes: 45,
          provenance: AI,
        },
      ],
    },
    {
      id: 'frontend-react',
      order: 3,
      kind: 'HANDS_ON',
      title: 'Building interfaces with React',
      description: 'Compose interfaces from components, manage state and handle user input.',
      objectives: [
        'Split a screen into components with props',
        'Manage state and events',
        'Build controlled forms with validation messages',
      ],
      project: null,
      lessons: [
        {
          id: 'components-and-state',
          order: 1,
          title: 'Components, props and state',
          summary: 'Describe the UI as a function of data.',
          skillIds: ['react'],
          objectives: ['Pass data down with props', 'Keep state in the closest common parent'],
          explanation: [
            'A React component is a function that returns what the UI should look like for the data it receives. Props pass data from a parent to a child; state is data a component remembers between renders, such as which tab is open.',
            'When two components need the same state, move it up to their closest common parent and pass it down. Derive values from state during rendering instead of storing copies that can go out of sync.',
          ],
          examples: [
            {
              title: 'A counter',
              description:
                'Clicking the button updates state, and React re-renders with the new value.',
              code: {
                language: 'tsx',
                source:
                  'function Counter() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>;\n}',
              },
            },
          ],
          activities: [
            {
              id: 'fe-lift-state',
              type: 'MULTIPLE_CHOICE',
              variant: 'DESIGN',
              prompt:
                'A search box and a results list are sibling components. Both need the current search text. Where should that state live?',
              options: [
                {
                  id: 'a',
                  text: 'In their closest common parent, passed down as props',
                  correct: true,
                  feedback: 'Right — one source of truth that both children read.',
                },
                {
                  id: 'b',
                  text: 'A separate copy in each component',
                  feedback: 'Two copies can drift apart and show inconsistent results.',
                },
                {
                  id: 'c',
                  text: 'In a global variable outside React',
                  feedback: 'React would not re-render when it changes.',
                },
              ],
              explanation:
                'Lift shared state to the closest common parent and pass it down; derive everything else from it.',
            },
          ],
          exercises: [
            {
              id: 'filterable-list',
              title: 'Build a filterable list',
              instructions:
                'Render a list of jobs with a search box that filters by title as you type.',
              successCriteria: [
                'The filtered list is derived from state, not stored separately',
                'An empty result shows a helpful message',
              ],
              estimatedMinutes: 45,
              provenance: AI,
            },
          ],
          resources: [R.reactLearn],
          estimatedMinutes: 60,
          provenance: AI,
        },
        {
          id: 'forms-and-input',
          order: 2,
          title: 'Forms and user input',
          summary: 'Controlled inputs, validation and clear error messages.',
          skillIds: ['react', 'accessibility'],
          objectives: [
            'Build controlled form fields',
            'Show accessible validation errors next to the field',
          ],
          explanation: [
            'In a controlled input, React state holds the value and every keystroke updates it. That makes validation straightforward: check the state when the user submits (or leaves a field) and show what needs fixing.',
            'Place each error message next to its field, connect it with aria-describedby and keep what the user typed when something fails, so they never have to start again.',
          ],
          examples: [],
          exercises: [],
          resources: [R.reactLearn, R.wcag],
          estimatedMinutes: 45,
          provenance: AI,
        },
      ],
    },
    {
      id: 'frontend-apis',
      order: 4,
      kind: 'INTEGRATION',
      title: 'Working with APIs',
      description: 'Load and send data over HTTP, and handle the slow, empty and failing cases.',
      objectives: [
        'Fetch JSON from an API',
        'Represent loading, empty, error and success states',
        'Handle HTTP errors and retries sensibly',
      ],
      project: null,
      lessons: [
        {
          id: 'fetching-data',
          order: 1,
          title: 'Fetching data and UI states',
          summary: 'Every request is loading, then either data, nothing, or an error.',
          skillIds: ['javascript', 'rest-apis'],
          objectives: ['Call an API with fetch', 'Design all four UI states for a list'],
          explanation: [
            'fetch sends an HTTP request and resolves with a response; call response.json() to read a JSON body. fetch only rejects on network failure, so check response.ok yourself to treat 4xx and 5xx responses as errors.',
            'A screen that loads data has four states: loading, empty, error (with a way to retry) and success. Designing all four up front avoids blank screens and endless spinners.',
          ],
          examples: [
            {
              title: 'Checking the response',
              description: 'Treat HTTP errors as errors, not as data.',
              code: {
                language: 'typescript',
                source:
                  "async function loadJobs(): Promise<Job[]> {\n  const response = await fetch('/api/jobs');\n  if (!response.ok) throw new Error(`Request failed (${response.status})`);\n  return (await response.json()) as Job[];\n}",
              },
            },
          ],
          activities: [
            {
              id: 'fe-fetch-states',
              type: 'MULTIPLE_CHOICE',
              variant: 'SCENARIO',
              prompt:
                'Your jobs page fetches data from an API. Which set of states should the UI handle?',
              options: [
                {
                  id: 'a',
                  text: 'Only the successful result',
                  feedback: 'Users then see a blank page while loading or after an error.',
                },
                {
                  id: 'b',
                  text: 'Loading, error (with a way to retry), empty, and success',
                  correct: true,
                  feedback: 'Right — each one is a state users will actually meet.',
                },
                {
                  id: 'c',
                  text: 'Success and a console.log for errors',
                  feedback: 'Users never see the console.',
                },
              ],
              explanation:
                'Network requests can be slow, fail or return nothing; design what users see in each case.',
            },
          ],
          exercises: [
            {
              id: 'four-states',
              title: 'Design the four states',
              instructions:
                'Using any public JSON API, build a list screen with loading, empty, error-with-retry and success states.',
              successCriteria: [
                'Turning off the network shows the error state and Retry recovers',
                'No state ever shows a permanent spinner',
              ],
              estimatedMinutes: 60,
              provenance: AI,
            },
          ],
          resources: [R.mdnFetch, R.mdnHttpStatus],
          estimatedMinutes: 50,
          provenance: AI,
        },
      ],
    },
    {
      id: 'frontend-testing',
      order: 5,
      kind: 'TESTING',
      title: 'Testing frontend code',
      description: 'Test behaviour the way users experience it, from components to full journeys.',
      objectives: [
        'Write component tests that query by role and label',
        'Cover a key journey with an end-to-end test',
      ],
      project: null,
      lessons: [
        {
          id: 'component-tests',
          order: 1,
          title: 'Component tests from the user’s point of view',
          summary: 'Find elements by what users see, then assert on what they experience.',
          skillIds: ['software-testing', 'test-automation'],
          objectives: ['Query elements by role and accessible name', 'Simulate user events'],
          explanation: [
            'Good component tests interact with the UI the way a user would: find the button labelled "Save", click it, and check that the confirmation appears. Tests written this way survive refactors because they do not depend on implementation details.',
            'Querying by role and label also checks accessibility for free: if a test cannot find a control by its name, a screen-reader user probably cannot either.',
          ],
          examples: [
            {
              title: 'A user-focused test',
              description: 'Type into a labelled field and check the result.',
              code: {
                language: 'tsx',
                source:
                  "await user.type(screen.getByLabelText('Search'), 'react');\nexpect(screen.getByRole('list', { name: 'Jobs' })).toHaveTextContent('React Developer');",
              },
            },
          ],
          activities: [
            {
              id: 'fe-query-by-role',
              type: 'MULTIPLE_CHOICE',
              variant: 'CODE_READING',
              prompt: 'Which query best finds the "Save" button in a Testing Library test?',
              options: [
                {
                  id: 'a',
                  text: "screen.getByRole('button', { name: 'Save' })",
                  correct: true,
                  feedback:
                    'Right — it finds the element the way users and assistive technology do.',
                },
                {
                  id: 'b',
                  text: "container.querySelector('.btn-primary')",
                  feedback:
                    'It breaks when class names change and checks nothing about accessibility.',
                },
                {
                  id: 'c',
                  text: "screen.getByTestId('save-btn')",
                  feedback: 'Test ids work, but they are a last resort; users cannot see them.',
                },
              ],
              explanation:
                'Prefer queries by role and accessible name; they make tests resilient and double as accessibility checks.',
            },
          ],
          exercises: [],
          resources: [R.testingLibrary, R.vitest],
          estimatedMinutes: 50,
          provenance: AI,
        },
        {
          id: 'end-to-end-tests',
          order: 2,
          title: 'End-to-end tests',
          summary: 'Drive a real browser through the journeys that matter most.',
          skillIds: ['test-automation'],
          objectives: [
            'Decide which journeys deserve end-to-end coverage',
            'Write a stable end-to-end test',
          ],
          explanation: [
            'End-to-end tests run the real app in a real browser. They are slower than component tests, so reserve them for a few critical journeys such as signing in or submitting the main form.',
            'Wait for visible outcomes rather than fixed delays, and give each test its own data so tests can run in any order.',
          ],
          examples: [],
          exercises: [],
          resources: [R.playwright],
          estimatedMinutes: 40,
          provenance: AI,
        },
      ],
    },
    {
      id: 'frontend-portfolio',
      order: 6,
      kind: 'PORTFOLIO_PROJECT',
      title: 'Portfolio project',
      description: 'Build and publish a complete app that shows what you can do.',
      objectives: [
        'Plan a small app from requirements',
        'Deliver it with tests and a clear README',
      ],
      lessons: [
        {
          id: 'planning-the-project',
          order: 1,
          title: 'Planning a portfolio project',
          summary: 'Scope small, finish completely and document your decisions.',
          objectives: [
            'Turn requirements into a short plan',
            'Write a README that explains how to run and test the app',
          ],
          explanation: [
            'A finished small project impresses more than an unfinished large one. Write down the user stories, sketch the screens and list what is out of scope before you start.',
            'Commit in small steps with clear messages, and finish with a README covering what the app does, how to run and test it, and the trade-offs you made.',
          ],
          examples: [],
          exercises: [],
          resources: [R.gitBook],
          estimatedMinutes: 30,
          provenance: AI,
        },
      ],
      project: {
        id: 'job-tracker-dashboard',
        title: 'Job application tracker',
        brief:
          'A responsive React app to track job applications: add, filter and update their status, with data loaded from and saved to an API (a mock API is fine).',
        requirements: [
          'List, add and edit applications, with status and date',
          'Filter by status and search by company or title',
          'Loading, empty and error states, with keyboard-accessible controls',
          'Component tests for the main interactions and one end-to-end test',
          'A README with setup instructions and your design decisions',
        ],
        skills: ['React', 'TypeScript', 'REST APIs', 'Testing', 'Accessibility'],
        estimatedHours: 12,
        provenance: AI,
      },
    },
    {
      id: 'frontend-interview',
      order: 7,
      kind: 'INTERVIEW_PREPARATION',
      title: 'Interview preparation',
      description:
        'Explain your work clearly and practise the topics frontend interviews usually cover.',
      objectives: [
        'Walk through a project with structure',
        'Answer common frontend questions with examples from your own work',
      ],
      project: null,
      lessons: [
        {
          id: 'explaining-your-work',
          order: 1,
          title: 'Explaining your work',
          summary: 'Tell the story of a project: the problem, your decisions and the result.',
          objectives: [
            'Structure answers with situation, task, action and result',
            'Talk honestly about trade-offs',
          ],
          explanation: [
            'Interviewers want to understand how you think. For each project, prepare a two-minute walkthrough: the problem, the constraints, the decisions you made (and alternatives you rejected) and what you would improve next.',
            'Behavioural questions are easier with structure: describe the situation and your task, the actions you personally took, and the result. Use real examples, and say what you learned when something went wrong.',
          ],
          examples: [],
          exercises: [
            {
              id: 'record-a-walkthrough',
              title: 'Record a project walkthrough',
              instructions:
                'Record yourself explaining your portfolio project in under three minutes, then watch it back.',
              successCriteria: [
                'You state the problem in one sentence',
                'You explain at least one trade-off and one improvement',
              ],
              estimatedMinutes: 30,
              provenance: AI,
            },
          ],
          resources: [],
          estimatedMinutes: 30,
          provenance: AI,
        },
        {
          id: 'common-frontend-topics',
          order: 2,
          title: 'Common frontend interview topics',
          summary: 'What usually comes up, and how to prepare for each.',
          objectives: [
            'Revise the core topics with your own examples',
            'Practise explaining code out loud',
          ],
          explanation: [
            'Frontend interviews commonly cover JavaScript fundamentals (scope, closures, promises), how the browser renders and fetches, React state and effects, accessibility, performance basics and testing. Expect to write or read small pieces of code.',
            'For each topic, prepare a short explanation and one example from your own project. In live coding, talk through your approach before typing, start simple, and test your solution with an example input.',
          ],
          examples: [],
          exercises: [],
          resources: [R.mdnJsGuide, R.reactLearn],
          estimatedMinutes: 45,
          provenance: AI,
        },
      ],
    },
  ],
};
