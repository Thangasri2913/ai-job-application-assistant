import type { LearningCategory, LearningRole } from '@job-assist/shared';

export interface RoleSource {
  id: LearningRole;
  category: LearningCategory;
  description: string;
  /** Curated core skills (ids from SKILLS), most fundamental first. */
  coreSkillIds: string[];
  /** Lower-case words that identify the role in job titles (for the user's own analysed jobs). */
  titleKeywords: string[];
}

/** What every curated role skill list is (and is not) based on. */
export const ROLE_EVIDENCE = {
  kind: 'CURATED' as const,
  basis:
    'Selected by JobAssist from responsibilities commonly described for this role. Drafted with AI assistance; not yet reviewed by a hiring expert.',
  limitations:
    'Not derived from job-market statistics. Requirements vary by employer, seniority, industry and region, and change over time. Compare with the skills in jobs you have analysed.',
};

export const ROLES: RoleSource[] = [
  {
    id: 'FRONTEND_DEVELOPER',
    category: 'SOFTWARE_DEVELOPMENT',
    description: 'Builds the parts of web applications people see and use.',
    coreSkillIds: [
      'html',
      'css',
      'javascript',
      'typescript',
      'react',
      'accessibility',
      'software-testing',
      'git',
    ],
    titleKeywords: ['frontend', 'front-end', 'front end', 'ui developer', 'react', 'angular'],
  },
  {
    id: 'BACKEND_DEVELOPER',
    category: 'SOFTWARE_DEVELOPMENT',
    description: 'Builds APIs, business logic and data storage behind applications.',
    coreSkillIds: [
      'javascript',
      'nodejs',
      'rest-apis',
      'sql',
      'data-modelling',
      'web-security',
      'software-testing',
      'git',
    ],
    titleKeywords: ['backend', 'back-end', 'back end', 'api', 'server', 'node'],
  },
  {
    id: 'FULL_STACK_DEVELOPER',
    category: 'SOFTWARE_DEVELOPMENT',
    description: 'Works across the interface, the API and the database.',
    coreSkillIds: [
      'html',
      'css',
      'javascript',
      'typescript',
      'react',
      'nodejs',
      'rest-apis',
      'sql',
      'software-testing',
      'git',
    ],
    titleKeywords: ['full stack', 'full-stack', 'fullstack'],
  },
  {
    id: 'QA_TESTER',
    category: 'QUALITY_ASSURANCE',
    description: 'Plans and runs tests, automates checks and reports defects clearly.',
    coreSkillIds: ['software-testing', 'test-automation', 'javascript', 'sql', 'rest-apis', 'git'],
    titleKeywords: [
      'qa',
      'quality assurance',
      'quality engineer',
      'test',
      'tester',
      'testing',
      'sdet',
    ],
  },
  {
    id: 'DATA_ANALYST',
    category: 'DATA',
    description: 'Turns data into answers and reports that support decisions.',
    coreSkillIds: ['sql', 'data-analysis', 'business-intelligence', 'python'],
    titleKeywords: ['data analyst', 'analytics', 'business analyst', 'bi', 'business intelligence'],
  },
  {
    id: 'DATA_ENGINEER',
    category: 'DATA',
    description: 'Builds and runs the pipelines and storage that data teams rely on.',
    coreSkillIds: ['sql', 'python', 'data-modelling', 'data-engineering', 'cloud-computing'],
    titleKeywords: ['data engineer', 'etl', 'data platform'],
  },
  {
    id: 'AI_APPLICATION_DEVELOPER',
    category: 'AI_AND_MACHINE_LEARNING',
    description: 'Builds products that use language models and other AI services.',
    coreSkillIds: [
      'python',
      'javascript',
      'rest-apis',
      'generative-ai',
      'prompt-engineering',
      'llm-applications',
      'web-security',
    ],
    titleKeywords: ['ai engineer', 'ai developer', 'llm', 'genai', 'generative'],
  },
  {
    id: 'ML_ENGINEER',
    category: 'AI_AND_MACHINE_LEARNING',
    description: 'Trains, deploys and maintains machine-learning models.',
    coreSkillIds: ['python', 'machine-learning', 'sql', 'mlops', 'cloud-computing'],
    titleKeywords: ['machine learning', 'ml engineer', 'mlops'],
  },
  {
    id: 'CLOUD_DEVOPS_ENGINEER',
    category: 'CLOUD_AND_DEVOPS',
    description: 'Automates delivery and runs reliable infrastructure.',
    coreSkillIds: ['cloud-computing', 'docker', 'ci-cd', 'git', 'web-security'],
    titleKeywords: [
      'devops',
      'cloud',
      'sre',
      'site reliability',
      'platform engineer',
      'infrastructure',
    ],
  },
  {
    id: 'SECURITY_ANALYST',
    category: 'CYBERSECURITY',
    description: 'Protects systems by finding weaknesses and responding to incidents.',
    coreSkillIds: ['web-security', 'security-operations', 'cloud-computing', 'python'],
    titleKeywords: ['security', 'cyber', 'soc', 'penetration'],
  },
  {
    id: 'UI_UX_DESIGNER',
    category: 'DESIGN',
    description: 'Researches user needs and designs clear, accessible interfaces.',
    coreSkillIds: ['ux-design', 'accessibility', 'html', 'css'],
    titleKeywords: ['ux', 'ui designer', 'product designer', 'interaction designer'],
  },
];
