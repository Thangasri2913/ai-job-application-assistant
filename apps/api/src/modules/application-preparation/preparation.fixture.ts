import type { CareerProfile, ResumeContent } from '@job-assist/shared';
import { analyzeJobText } from '../jobs/analysis/job-analyzer.js';
import { scoreMatch } from '../jobs/matching/match-scorer.js';
import { subjectFromResume } from '../jobs/matching/match-subjects.js';
import { buildVerifiedFacts } from './grounding.js';
import type { PreparationContext } from './preparation-context.js';

export const JOB_TEXT = `We are looking for a Frontend Developer to build our SaaS IoT dashboards.

Responsibilities:
- Build interactive dashboards in Angular
- Integrate REST APIs and real-time WebSocket feeds

Requirements:
- 3+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS
- Experience with Docker

Nice to have:
- AWS`;

export const RESUME: ResumeContent = {
  contact: {
    fullName: 'Thanga Sri',
    email: null,
    phone: null,
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
  },
  headline: 'Frontend Developer',
  summary: 'Frontend developer building Angular applications for 4 years.',
  skills: [
    { name: 'Git', category: 'TOOLS' },
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
        'Maintained the design system documentation',
        'Reviewed pull requests',
        'Developed dashboards for industrial IoT applications using Angular',
        'Integrated REST APIs and WebSocket feeds for 12 device types',
      ],
      achievements: [],
      technologies: ['Angular', 'TypeScript', 'RxJS', 'WebSockets'],
    },
  ],
  educations: [],
  projects: [],
  certifications: [],
  achievements: [],
  languages: [],
  estimatedYearsOfExperience: 4,
};

export function profile(
  overrides: Partial<CareerProfile['details']> = {},
  extra: Partial<CareerProfile> = {},
): CareerProfile {
  return {
    details: {
      fullName: 'Thanga Sri',
      email: 'thanga@example.com',
      phone: null,
      location: 'Chennai',
      country: 'India',
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      preferredRoles: [],
      preferredLocations: ['Chennai'],
      workModes: ['REMOTE', 'HYBRID'],
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      employmentTypes: [],
      noticePeriod: '30 days',
      workAuthorization: null,
      headline: null,
      summary: null,
      yearsOfExperience: null,
      currentJobTitle: null,
      currentCompany: null,
      previousJobTitles: [],
      previousCompanies: [],
      updatedAt: null,
      ...overrides,
    },
    skills: [],
    experiences: [],
    educations: [],
    projects: [],
    certifications: [],
    languages: [],
    achievements: [],
    ...extra,
  };
}

export function context(
  resume: ResumeContent = RESUME,
  p: CareerProfile = profile(),
): PreparationContext {
  const analysis = analyzeJobText({ title: 'Frontend Developer', description: JOB_TEXT });
  const job = {
    title: 'Frontend Developer',
    requirements: analysis.requirements,
    keywords: analysis.keywords,
  };
  const scored = scoreMatch(job, subjectFromResume(resume, new Date('2026-10-01')));
  return {
    userId: 'u1',
    applicationId: 'a1',
    candidateName: 'Thanga Sri',
    job: {
      id: 'j1',
      title: 'Frontend Developer',
      companyName: 'ABC Technologies',
      description: JOB_TEXT,
      requirements: analysis.requirements,
      keywords: analysis.keywords,
    },
    resume: {
      resumeId: 'r1',
      resumeName: 'Angular Resume',
      resumeVersionId: 'v3',
      versionNumber: 3,
      content: resume,
    },
    profile: p,
    match: {
      score: scored.overallScore,
      strengths: scored.strengths,
      gaps: scored.gaps,
      evidence: scored.evidence,
    },
    facts: buildVerifiedFacts(resume, p),
  };
}
