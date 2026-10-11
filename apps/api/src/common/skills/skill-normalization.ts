import { detectTechnologies } from '../../modules/resumes/parsing/skill-dictionary.js';

/**
 * Skill-name normalisation shared by job analysis and matching.
 *
 * Only spelling variants of the SAME technology are merged (React.js → React, Postgres →
 * PostgreSQL). Different technologies are never merged: Java ≠ JavaScript, React ≠ React
 * Native, PostgreSQL ≠ MySQL, Angular ≠ AngularJS. Closeness between different skills is
 * expressed separately in RELATED_SKILLS and only ever earns partial credit.
 */

/** Lower-cased variant → canonical name. */
const ALIASES: Record<string, string> = {
  'react.js': 'React',
  reactjs: 'React',
  'react js': 'React',
  'vue.js': 'Vue',
  vuejs: 'Vue',
  'next.js': 'Next.js',
  nextjs: 'Next.js',
  'angular 2+': 'Angular',
  ts: 'TypeScript',
  js: 'JavaScript',
  node: 'Node.js',
  nodejs: 'Node.js',
  'node js': 'Node.js',
  postgres: 'PostgreSQL',
  postgre: 'PostgreSQL',
  'postgre sql': 'PostgreSQL',
  psql: 'PostgreSQL',
  nest: 'NestJS',
  'nest.js': 'NestJS',
  'nest js': 'NestJS',
  'express.js': 'Express',
  expressjs: 'Express',
  mongo: 'MongoDB',
  html5: 'HTML',
  css3: 'CSS',
  rest: 'REST APIs',
  'rest api': 'REST APIs',
  'rest apis': 'REST APIs',
  'restful api': 'REST APIs',
  'restful apis': 'REST APIs',
  restful: 'REST APIs',
  websocket: 'WebSockets',
  'web sockets': 'WebSockets',
  k8s: 'Kubernetes',
  'amazon web services': 'AWS',
  'google cloud': 'GCP',
  'google cloud platform': 'GCP',
  'ci cd': 'CI/CD',
  cicd: 'CI/CD',
  microfrontends: 'Micro Frontends',
  'micro-frontends': 'Micro Frontends',
  llms: 'LLM',
  'material-ui': 'Material UI',
  mui: 'Material UI',
  golang: 'Go',
  'unit tests': 'Unit Testing',
};

/**
 * Different-but-close skills: having any skill on the right gives PARTIAL credit for the
 * skill on the left. Directional and deliberately small. Never used to claim a MATCH.
 */
export const RELATED_SKILLS: Record<string, string[]> = {
  typescript: ['JavaScript'],
  javascript: ['TypeScript'],
  'node.js': ['NestJS', 'Express'],
  react: ['Next.js', 'React Native'],
  'react native': ['React'],
  angular: ['AngularJS'],
  angularjs: ['Angular'],
  'next.js': ['React'],
  sql: ['PostgreSQL', 'MySQL', 'SQL Server', 'SQLite', 'MariaDB', 'Oracle'],
  docker: ['Kubernetes'],
  kubernetes: ['Docker'],
  'ci/cd': ['GitHub Actions', 'GitLab CI', 'Jenkins', 'Azure DevOps'],
  jest: ['Vitest', 'Jasmine'],
  vitest: ['Jest'],
  scss: ['Sass'],
  sass: ['SCSS'],
  redux: ['NgRx'],
  ngrx: ['Redux', 'RxJS'],
};

/** Variants that occur in prose but aren't dictionary terms. Case-sensitive where noted. */
const PROSE_ALIASES: { pattern: RegExp; canonical: string }[] = [
  { pattern: /(?<![\w.])ReactJS(?![\w]|\.\w)/i, canonical: 'React' },
  { pattern: /(?<![\w.])React JS(?![\w]|\.\w)/i, canonical: 'React' },
  { pattern: /(?<![\w.])VueJS(?![\w]|\.\w)/i, canonical: 'Vue' },
  { pattern: /(?<![\w.])NextJS(?![\w]|\.\w)/i, canonical: 'Next.js' },
  { pattern: /(?<![\w.])Nest\.?js(?![\w]|\.\w)/i, canonical: 'NestJS' },
  { pattern: /(?<![\w.])Node(?:JS| JS)?(?![\w]|\.\w)/, canonical: 'Node.js' },
  { pattern: /(?<![\w.])Postgres(?:QL)?(?![\w]|\.\w)/i, canonical: 'PostgreSQL' },
  { pattern: /(?<![\w.])TS(?![\w]|\.\w)/, canonical: 'TypeScript' },
  { pattern: /(?<![\w.])K8s(?![\w]|\.\w)/i, canonical: 'Kubernetes' },
  { pattern: /(?<![\w.])RESTful(?![\w]|\.\w)/i, canonical: 'REST APIs' },
  { pattern: /(?<![\w.])REST(?![\w]|\.\w)/, canonical: 'REST APIs' },
  { pattern: /(?<![\w.])Web ?Sockets?(?![\w]|\.\w)/i, canonical: 'WebSockets' },
  { pattern: /(?<![\w.])Amazon Web Services(?![\w]|\.\w)/i, canonical: 'AWS' },
];

/**
 * Multi-word technologies containing another skill's name. They are detected first and
 * masked, so "React Native" is never also reported as "React" (nor "SQL Server" as SQL).
 */
const COMPOUND_SKILLS: { pattern: RegExp; canonical: string }[] = [
  { pattern: /(?<![\w.])React[\s-]Native(?![\w])/gi, canonical: 'React Native' },
  { pattern: /(?<![\w.])SQL Server(?![\w])/gi, canonical: 'SQL Server' },
  { pattern: /(?<![\w.])Azure DevOps(?![\w])/gi, canonical: 'Azure DevOps' },
];

const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

/** Canonical display name for a skill; unknown skills keep their (trimmed) spelling. */
export function normalizeSkillName(name: string): string {
  const cleaned = collapse(name);
  const compound = COMPOUND_SKILLS.find(
    (c) => c.canonical.toLowerCase() === cleaned.toLowerCase().replace('-', ' '),
  );
  if (compound) return compound.canonical;
  const alias = ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;
  // Dictionary terms have a canonical capitalisation ("typescript" → "TypeScript").
  const [known] = detectTechnologies(cleaned).filter(
    (term) => term.toLowerCase() === cleaned.toLowerCase(),
  );
  const canonical = known ?? cleaned;
  return ALIASES[canonical.toLowerCase()] ?? canonical;
}

/** Comparison key: canonical name, lower-cased. */
export function skillKey(name: string): string {
  return normalizeSkillName(name).toLowerCase();
}

/**
 * Canonical skills that literally occur in `text` (dictionary terms plus common prose
 * variants), de-duplicated by canonical name, in first-seen order.
 */
export function detectSkills(text: string): string[] {
  const found = new Map<string, string>();
  const add = (name: string) => {
    const canonical = normalizeSkillName(name);
    if (!found.has(canonical.toLowerCase())) found.set(canonical.toLowerCase(), canonical);
  };
  let rest = text;
  for (const { pattern, canonical } of COMPOUND_SKILLS) {
    if (rest.search(pattern) >= 0) {
      add(canonical);
      rest = rest.replace(pattern, ' ');
    }
  }
  for (const term of detectTechnologies(rest)) add(term);
  for (const { pattern, canonical } of PROSE_ALIASES) if (pattern.test(rest)) add(canonical);
  return [...found.values()];
}

/** Related skills (by key) that give partial credit for `name`. */
export function relatedSkillKeys(name: string): string[] {
  return (RELATED_SKILLS[skillKey(name)] ?? []).map((s) => s.toLowerCase());
}
