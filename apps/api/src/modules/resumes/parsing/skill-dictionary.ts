import type { SkillCategory } from '@job-assist/shared';

/**
 * Known technologies/skills used to (a) categorise skills the resume explicitly lists and
 * (b) detect technologies that literally appear in an experience/project block.
 * Detection only ever reports terms present in the text — it never adds skills.
 */
const ENTRIES: [SkillCategory, string[]][] = [
  [
    'FRONTEND',
    [
      'Angular',
      'AngularJS',
      'React',
      'React.js',
      'Next.js',
      'Vue',
      'Vue.js',
      'Nuxt',
      'Svelte',
      'TypeScript',
      'JavaScript',
      'HTML',
      'HTML5',
      'CSS',
      'CSS3',
      'SCSS',
      'Sass',
      'Less',
      'Tailwind CSS',
      'Bootstrap',
      'Angular Material',
      'Material UI',
      'RxJS',
      'NgRx',
      'Redux',
      'jQuery',
      'Webpack',
      'Vite',
      'Signals',
      'Responsive Design',
      'Accessibility',
    ],
  ],
  [
    'BACKEND',
    [
      'Node.js',
      'NestJS',
      'Express',
      'Express.js',
      'Java',
      'Spring',
      'Spring Boot',
      'Python',
      'Django',
      'Flask',
      'FastAPI',
      'C#',
      '.NET',
      'ASP.NET',
      'PHP',
      'Laravel',
      'Ruby',
      'Rails',
      'Golang',
      'Kotlin',
      'Scala',
      'Rust',
      'REST',
      'REST APIs',
      'RESTful APIs',
      'GraphQL',
      'gRPC',
      'Microservices',
      'WebSockets',
    ],
  ],
  [
    'DATABASE',
    [
      'PostgreSQL',
      'MySQL',
      'MongoDB',
      'Redis',
      'SQL',
      'SQLite',
      'Oracle',
      'SQL Server',
      'MariaDB',
      'DynamoDB',
      'Cassandra',
      'Elasticsearch',
      'Firebase',
      'Prisma',
      'TypeORM',
      'Sequelize',
      'Mongoose',
    ],
  ],
  [
    'CLOUD',
    [
      'AWS',
      'Azure',
      'GCP',
      'Google Cloud',
      'Lambda',
      'EC2',
      'S3',
      'CloudFront',
      'Heroku',
      'Vercel',
      'Netlify',
      'Firebase Hosting',
    ],
  ],
  [
    'DEVOPS',
    [
      'Docker',
      'Kubernetes',
      'Jenkins',
      'GitHub Actions',
      'GitLab CI',
      'CI/CD',
      'Terraform',
      'Ansible',
      'Nginx',
      'Linux',
      'Bash',
      'Helm',
      'Azure DevOps',
    ],
  ],
  [
    'TESTING',
    [
      'Jest',
      'Jasmine',
      'Karma',
      'Vitest',
      'Cypress',
      'Playwright',
      'Selenium',
      'Mocha',
      'Chai',
      'JUnit',
      'PyTest',
      'Testing Library',
      'Unit Testing',
      'E2E Testing',
      'TDD',
    ],
  ],
  [
    'ARCHITECTURE',
    [
      'System Design',
      'Design Patterns',
      'Micro Frontends',
      'Microfrontends',
      'Domain-Driven Design',
      'Event-Driven Architecture',
      'SOLID',
      'Clean Architecture',
      'Monorepo',
      'Nx',
    ],
  ],
  [
    'AI',
    [
      'Machine Learning',
      'Deep Learning',
      'TensorFlow',
      'PyTorch',
      'scikit-learn',
      'NLP',
      'LLM',
      'LLMs',
      'OpenAI',
      'LangChain',
      'Prompt Engineering',
      'Computer Vision',
      'Pandas',
      'NumPy',
    ],
  ],
  [
    'TOOLS',
    [
      'Git',
      'GitHub',
      'GitLab',
      'Bitbucket',
      'Jira',
      'Confluence',
      'Figma',
      'Postman',
      'VS Code',
      'Visual Studio',
      'IntelliJ',
      'npm',
      'Yarn',
      'pnpm',
      'Storybook',
      'ESLint',
      'Prettier',
      'Swagger',
      'Agile',
      'Scrum',
    ],
  ],
  [
    'SOFT_SKILLS',
    [
      'Communication',
      'Leadership',
      'Teamwork',
      'Problem Solving',
      'Mentoring',
      'Collaboration',
      'Time Management',
      'Stakeholder Management',
      'Critical Thinking',
    ],
  ],
];

interface DictionaryEntry {
  canonical: string;
  category: SkillCategory;
  detectable: boolean;
  pattern: RegExp;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Practices/concepts: valid listed skills, but not reported as "technologies used" from prose. */
const NOT_DETECTED_IN_PROSE = new Set([
  'Accessibility',
  'Responsive Design',
  'Signals',
  'Agile',
  'Scrum',
  'SOLID',
  'TDD',
  'Design Patterns',
]);

/** Ordinary English words: only detected with their exact capitalisation. */
const CASE_SENSITIVE = new Set([
  'Express',
  'Spring',
  'Rails',
  'Lambda',
  'Helm',
  'Nx',
  'Ruby',
  'Rust',
  'Less',
  'Vite',
  'Prettier',
]);

const DICTIONARY: DictionaryEntry[] = ENTRIES.flatMap(([category, terms]) =>
  terms.map((canonical) => ({
    canonical,
    category,
    detectable: category !== 'SOFT_SKILLS' && !NOT_DETECTED_IN_PROSE.has(canonical),
    // Term must not be glued to other word characters (so "Java" ≠ "JavaScript", "C#" is whole).
    pattern: new RegExp(
      `(?<![\\w.#+])${escape(canonical)}(?![\\w#+]|\\.\\w)`,
      CASE_SENSITIVE.has(canonical) ? '' : 'i',
    ),
  })),
);

const BY_NAME = new Map(DICTIONARY.map((e) => [e.canonical.toLowerCase(), e]));

/** Category for an explicitly listed skill name; OTHER when unknown. */
export function categorizeSkill(name: string): SkillCategory {
  return BY_NAME.get(name.trim().toLowerCase())?.category ?? 'OTHER';
}

/** Known technologies that literally occur in `text`, in dictionary order, without duplicates. */
export function detectTechnologies(text: string): string[] {
  const found: string[] = [];
  for (const entry of DICTIONARY) {
    if (!entry.detectable) continue;
    if (
      entry.pattern.test(text) &&
      !found.some((f) => f.toLowerCase() === entry.canonical.toLowerCase())
    ) {
      found.push(entry.canonical);
    }
  }
  return found;
}

const CATEGORY_LABELS: [RegExp, SkillCategory][] = [
  [/front[\s-]?end|ui|web/i, 'FRONTEND'],
  [/back[\s-]?end|server|languages?|programming/i, 'BACKEND'],
  [/databases?|data\s*stores?|storage/i, 'DATABASE'],
  [/cloud/i, 'CLOUD'],
  [/devops|ci\/?cd|infrastructure|deployment/i, 'DEVOPS'],
  [/test(ing)?|qa/i, 'TESTING'],
  [/architecture|design/i, 'ARCHITECTURE'],
  [/\bai\b|ml|machine learning|data science/i, 'AI'],
  [/tools?|platforms?|ide/i, 'TOOLS'],
  [/soft|interpersonal/i, 'SOFT_SKILLS'],
];

/** Category implied by a label like "Frontend:" in a skills section, if recognisable. */
export function categoryFromLabel(label: string): SkillCategory | null {
  return CATEGORY_LABELS.find(([pattern]) => pattern.test(label))?.[1] ?? null;
}
