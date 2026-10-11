import type { ResumeContent } from '@job-assist/shared';
import type { ParsingDispatcher } from '../../src/modules/resumes/parsing/parsing-dispatcher.js';
import type { TestUser } from './api-client.js';
import { buildPdf, SAMPLE_RESUME_LINES } from './resume-fixtures.js';

export const ANGULAR_JOB = {
  title: 'Frontend Developer',
  companyName: 'Example Corp',
  location: 'Chennai',
  source: 'Company website',
  description: `We are looking for a frontend developer to build our SaaS analytics dashboards.

Responsibilities:
- Build and maintain frontend applications in Angular
- Develop reusable UI components for our design system
- Integrate REST APIs

Requirements:
- 3+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS
- Bachelor's degree in Computer Science or equivalent experience

Nice to have:
- Docker and AWS`,
};

export const REACT_JOB_DESCRIPTION = `We are hiring a React engineer for our customer portal.

Responsibilities:
- Build React pages and hooks
- Write unit tests with Jest

Requirements:
- 2+ years of experience with React and TypeScript
- Experience with Node.js

Nice to have:
- Next.js`;

const empty: ResumeContent = {
  contact: {
    fullName: 'Thanga Sri',
    email: null,
    phone: null,
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
  },
  headline: null,
  summary: null,
  skills: [],
  experiences: [],
  educations: [],
  projects: [],
  certifications: [],
  achievements: [],
  languages: [],
  estimatedYearsOfExperience: null,
};

export const ANGULAR_CONTENT: ResumeContent = {
  ...empty,
  headline: 'Angular Developer',
  skills: [
    { name: 'Angular', category: 'FRONTEND' },
    { name: 'TypeScript', category: 'FRONTEND' },
    { name: 'RxJS', category: 'FRONTEND' },
  ],
  experiences: [
    {
      company: 'Acme',
      jobTitle: 'Frontend Developer',
      location: null,
      startDate: '2022-01-01',
      endDate: null,
      isCurrent: true,
      responsibilities: [
        'Built and maintained Angular frontend applications for SaaS dashboards',
        'Developed reusable UI components for the design system',
      ],
      achievements: [],
      technologies: ['Angular', 'TypeScript', 'RxJS', 'REST APIs'],
    },
  ],
  educations: [
    {
      institution: 'Anna University',
      degree: 'B.Tech',
      fieldOfStudy: 'Computer Science',
      startDate: null,
      endDate: null,
      grade: null,
    },
  ],
  estimatedYearsOfExperience: 4,
};

export const REACT_CONTENT: ResumeContent = {
  ...empty,
  headline: 'React Developer',
  skills: [
    { name: 'React', category: 'FRONTEND' },
    { name: 'TypeScript', category: 'FRONTEND' },
    { name: 'Jest', category: 'TESTING' },
  ],
  experiences: [
    {
      company: 'Beta',
      jobTitle: 'React Developer',
      location: null,
      startDate: '2023-01-01',
      endDate: null,
      isCurrent: true,
      responsibilities: ['Built React pages and custom hooks', 'Wrote unit tests with Jest'],
      achievements: [],
      technologies: ['React', 'TypeScript', 'Node.js'],
    },
  ],
  estimatedYearsOfExperience: 3,
};

/** Uploads a resume, then confirms `content` and makes it the current version. */
export async function createReviewedResume(
  user: TestUser,
  parsing: ParsingDispatcher,
  name: string,
  content: ResumeContent,
): Promise<{ resumeId: string; versionId: string }> {
  const created = await user
    .upload('/resumes', buildPdf(SAMPLE_RESUME_LINES), `${name}.pdf`, { name })
    .expect(201);
  await parsing.drain();
  const resumeId = created.body.id as string;
  const versionId = created.body.latestVersion.id as string;
  await user
    .patch(`/resumes/${resumeId}/versions/${versionId}/extracted-data`, content)
    .expect(200);
  await user.post(`/resumes/${resumeId}/versions/${versionId}/activate`).expect(200);
  return { resumeId, versionId };
}
