import type { LearningCategory } from '@job-assist/shared';

export interface SkillSource {
  id: string;
  /** Canonical display name; also matched against resumes and job requirements. */
  name: string;
  category: LearningCategory;
  description: string;
  /** Other spellings that mean the same skill (never a different technology). */
  alsoKnownAs?: string[];
}

const skill = (
  id: string,
  name: string,
  category: LearningCategory,
  description: string,
  alsoKnownAs: string[] = [],
): SkillSource => ({ id, name, category, description, alsoKnownAs });

/** Skill registry. Add a skill here before a course or role refers to it. */
export const SKILLS: SkillSource[] = [
  skill('html', 'HTML', 'SOFTWARE_DEVELOPMENT', 'Structuring web content with semantic elements.', [
    'HTML5',
  ]),
  skill('css', 'CSS', 'SOFTWARE_DEVELOPMENT', 'Styling and laying out web pages.', ['CSS3']),
  skill(
    'javascript',
    'JavaScript',
    'SOFTWARE_DEVELOPMENT',
    'The language of the web, in browsers and on servers.',
    ['JS', 'ECMAScript'],
  ),
  skill('typescript', 'TypeScript', 'SOFTWARE_DEVELOPMENT', 'JavaScript with static types.', [
    'TS',
  ]),
  skill('react', 'React', 'SOFTWARE_DEVELOPMENT', 'Building user interfaces from components.', [
    'React.js',
    'ReactJS',
  ]),
  skill(
    'angular',
    'Angular',
    'SOFTWARE_DEVELOPMENT',
    'A full framework for single-page applications.',
  ),
  skill(
    'accessibility',
    'Accessibility',
    'DESIGN',
    'Making products usable by everyone, including people using assistive technology.',
    ['a11y', 'WCAG'],
  ),
  skill('nodejs', 'Node.js', 'SOFTWARE_DEVELOPMENT', 'Running JavaScript on the server.', [
    'Node',
    'NodeJS',
  ]),
  skill('nestjs', 'NestJS', 'SOFTWARE_DEVELOPMENT', 'A structured Node.js framework for APIs.', [
    'Nest.js',
  ]),
  skill('rest-apis', 'REST APIs', 'SOFTWARE_DEVELOPMENT', 'Designing and consuming HTTP APIs.', [
    'REST',
    'RESTful APIs',
    'HTTP APIs',
  ]),
  skill(
    'python',
    'Python',
    'SOFTWARE_DEVELOPMENT',
    'A general-purpose language used for scripting, web back ends, data and AI.',
  ),
  skill(
    'java',
    'Java',
    'SOFTWARE_DEVELOPMENT',
    'A statically typed language common in enterprise back ends.',
  ),
  skill('sql', 'SQL', 'DATA', 'Querying and changing data in relational databases.'),
  skill('postgresql', 'PostgreSQL', 'DATA', 'An open-source relational database.', ['Postgres']),
  skill('data-modelling', 'Data Modelling', 'DATA', 'Designing tables, keys and relationships.', [
    'Data Modeling',
    'Database Design',
  ]),
  skill('git', 'Git', 'SOFTWARE_DEVELOPMENT', 'Version control for code and collaboration.'),
  skill(
    'system-design',
    'System Design',
    'SOFTWARE_DEVELOPMENT',
    'Designing components, data flow and trade-offs of larger systems.',
  ),
  skill(
    'software-testing',
    'Software Testing',
    'QUALITY_ASSURANCE',
    'Designing tests and finding defects systematically.',
    ['Testing', 'Unit Testing', 'Manual Testing'],
  ),
  skill(
    'test-automation',
    'Test Automation',
    'QUALITY_ASSURANCE',
    'Automating checks with test frameworks.',
    ['Automated Testing', 'Playwright', 'Cypress', 'Selenium'],
  ),
  skill(
    'web-security',
    'Web Security',
    'CYBERSECURITY',
    'Recognising and preventing common web vulnerabilities.',
    ['Application Security', 'OWASP'],
  ),
  skill(
    'security-operations',
    'Security Operations',
    'CYBERSECURITY',
    'Monitoring, detecting and responding to security incidents.',
    ['SOC', 'SIEM'],
  ),
  skill(
    'generative-ai',
    'Generative AI',
    'AI_AND_MACHINE_LEARNING',
    'Using large language models responsibly and effectively.',
    ['GenAI', 'LLM', 'LLMs', 'Large Language Models'],
  ),
  skill(
    'prompt-engineering',
    'Prompt Engineering',
    'AI_AND_MACHINE_LEARNING',
    'Writing clear instructions and context for language models.',
  ),
  skill(
    'llm-applications',
    'LLM Application Development',
    'AI_AND_MACHINE_LEARNING',
    'Building products on top of language-model APIs.',
    ['RAG', 'Retrieval-Augmented Generation'],
  ),
  skill(
    'machine-learning',
    'Machine Learning',
    'AI_AND_MACHINE_LEARNING',
    'Training models that learn patterns from data.',
    ['ML'],
  ),
  skill(
    'mlops',
    'MLOps',
    'AI_AND_MACHINE_LEARNING',
    'Deploying, monitoring and maintaining models in production.',
  ),
  skill('data-analysis', 'Data Analysis', 'DATA', 'Cleaning, exploring and explaining data.', [
    'Data Analytics',
  ]),
  skill(
    'business-intelligence',
    'Business Intelligence',
    'DATA',
    'Dashboards and reporting for decisions.',
    ['BI', 'Power BI', 'Tableau'],
  ),
  skill(
    'data-engineering',
    'Data Engineering',
    'DATA',
    'Building pipelines that move and transform data.',
    ['ETL', 'ELT', 'Data Pipelines'],
  ),
  skill(
    'cloud-computing',
    'Cloud Computing',
    'CLOUD_AND_DEVOPS',
    'Running systems on cloud platforms.',
    ['AWS', 'Azure', 'GCP', 'Cloud'],
  ),
  skill('docker', 'Docker', 'CLOUD_AND_DEVOPS', 'Packaging applications in containers.', [
    'Containers',
  ]),
  skill('ci-cd', 'CI/CD', 'CLOUD_AND_DEVOPS', 'Automating builds, tests and deployments.', [
    'Continuous Integration',
    'Continuous Delivery',
  ]),
  skill('ux-design', 'UX Design', 'DESIGN', 'Researching needs and designing usable experiences.', [
    'User Experience',
    'UI/UX',
    'UI Design',
    'Figma',
  ]),
];
