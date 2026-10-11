/**
 * DEVELOPMENT FIXTURES — NOT REAL JOB POSTINGS.
 *
 * Sample postings for the development job source (DEV_JOB_SOURCE). Every company name is
 * fictional and marked "(sample)", URLs point at example.com, and the UI labels these
 * jobs as development data. They exist so job alerts can be built and tested without a
 * real job board. Never use them in production.
 *
 * The raw shape intentionally differs from the common posting shape, so the adapter's
 * normalizeJob step is exercised like a real provider's would be.
 */
export interface DevRawJob {
  ref: string;
  position: string;
  employer: string;
  city: string | null;
  arrangement: 'office' | 'hybrid' | 'remote';
  contract: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
  level?: 'junior' | 'mid' | 'senior' | 'lead';
  body: string;
  /** Days before "now" the sample was posted (keeps freshness meaningful over time). */
  postedDaysAgo: number;
}

const URL_BASE = 'https://example.com/dev-job-source/';
export const devJobUrl = (ref: string) => `${URL_BASE}${ref}`;

export const DEV_JOB_FIXTURES: DevRawJob[] = [
  {
    ref: 'sample-fe-angular-blr',
    position: 'Frontend Developer',
    employer: 'Northwind Analytics (sample)',
    city: 'Bangalore, India',
    arrangement: 'hybrid',
    contract: 'Full-time',
    level: 'mid',
    postedDaysAgo: 1,
    body: `Sample posting (development fixture). We are looking for a Frontend Developer to build analytics dashboards.

Responsibilities:
- Build reusable Angular components for our dashboards

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS`,
  },
  {
    ref: 'sample-fe-angular-blr-2',
    position: 'Front-end Developer (Angular)',
    employer: 'Contoso Health (sample)',
    city: 'Bengaluru',
    arrangement: 'office',
    contract: 'Full-time',
    level: 'mid',
    postedDaysAgo: 4,
    body: `Sample posting (development fixture). Contoso Health is hiring a Frontend Developer for its patient portal.

Responsibilities:
- Build reusable Angular components for the patient portal
- Integrate REST APIs with RxJS

Requirements:
- 3+ years of experience in frontend development
- Experience with Angular and TypeScript
- Experience with Docker and Kubernetes
- Experience with GraphQL`,
  },
  {
    ref: 'sample-fe-react-blr',
    position: 'Frontend Developer (React)',
    employer: 'Fabrikam Retail (sample)',
    city: 'Bangalore',
    arrangement: 'hybrid',
    contract: 'Full-time',
    level: 'mid',
    postedDaysAgo: 2,
    body: `Sample posting (development fixture). Build the storefront for Fabrikam Retail.

Responsibilities:
- Build React.js pages and hooks
- Write unit tests with Jest

Requirements:
- 3+ years of experience with React and TypeScript
- Experience with Next.js and Redux
- Experience with Node.js`,
  },
  {
    ref: 'sample-fe-vue-blr',
    position: 'Frontend Developer',
    employer: 'Tailspin Travel (sample)',
    city: 'Bangalore',
    arrangement: 'office',
    contract: 'Contract',
    level: 'junior',
    postedDaysAgo: 9,
    body: `Sample posting (development fixture). Short-term contract on our booking site.

Responsibilities:
- Build Vue.js components for the booking flow

Requirements:
- 1+ years of experience with Vue.js and JavaScript
- Experience with CSS and HTML`,
  },
  {
    ref: 'sample-fe-angular-remote',
    position: 'Senior Frontend Developer',
    employer: 'Adventure Works Cloud (sample)',
    city: null,
    arrangement: 'remote',
    contract: 'Full-time',
    level: 'senior',
    postedDaysAgo: 3,
    body: `Sample posting (development fixture). Fully remote role on our cloud console.

Responsibilities:
- Lead the Angular frontend architecture
- Mentor frontend developers

Requirements:
- 6+ years of experience in frontend development
- Expert knowledge of Angular, TypeScript and RxJS
- Experience with AWS`,
  },
  {
    ref: 'sample-fe-angular-chennai',
    position: 'Frontend Developer',
    employer: 'Litware Logistics (sample)',
    city: 'Chennai, India',
    arrangement: 'office',
    contract: 'Full-time',
    level: 'mid',
    postedDaysAgo: 5,
    body: `Sample posting (development fixture). Build fleet-tracking dashboards.

Responsibilities:
- Build Angular dashboards
- Integrate REST APIs

Requirements:
- 2+ years of experience with Angular and TypeScript`,
  },
  {
    ref: 'sample-be-java-blr',
    position: 'Java Backend Developer',
    employer: 'Proseware Banking (sample)',
    city: 'Bangalore',
    arrangement: 'office',
    contract: 'Full-time',
    level: 'mid',
    postedDaysAgo: 2,
    body: `Sample posting (development fixture). Backend services for core banking.

Responsibilities:
- Build Java microservices with Spring Boot

Requirements:
- 3+ years of experience with Java and Spring Boot
- Experience with PostgreSQL and Kafka`,
  },
  {
    ref: 'sample-be-node-remote',
    position: 'Node.js Developer',
    employer: 'Woodgrove Media (sample)',
    city: null,
    arrangement: 'remote',
    contract: 'Full-time',
    level: 'mid',
    postedDaysAgo: 6,
    body: `Sample posting (development fixture). APIs for our streaming platform.

Responsibilities:
- Build REST APIs with Node.js and NestJS

Requirements:
- 3+ years of experience with Node.js and TypeScript
- Experience with PostgreSQL`,
  },
  {
    ref: 'sample-fe-intern-blr',
    position: 'Frontend Developer Intern',
    employer: 'Alpine Ski House (sample)',
    city: 'Bangalore',
    arrangement: 'office',
    contract: 'Internship',
    level: 'junior',
    postedDaysAgo: 12,
    body: `Sample posting (development fixture). Six-month internship.

Responsibilities:
- Help build JavaScript components

Requirements:
- Knowledge of JavaScript, HTML and CSS`,
  },
  {
    ref: 'sample-fullstack-pune',
    position: 'Full Stack Developer',
    employer: 'Coho Vineyard (sample)',
    city: 'Pune',
    arrangement: 'hybrid',
    contract: 'Full-time',
    level: 'mid',
    postedDaysAgo: 7,
    body: `Sample posting (development fixture). Full stack role on our ordering platform.

Responsibilities:
- Build Angular frontends and Node.js services

Requirements:
- 3+ years of experience with Angular, Node.js and TypeScript
- Experience with MongoDB`,
  },
];
