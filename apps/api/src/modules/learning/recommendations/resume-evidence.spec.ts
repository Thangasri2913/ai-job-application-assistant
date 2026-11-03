import type { ResumeContent } from '@job-assist/shared';
import { SKILLS } from '../catalogue/skills.js';
import { findResumeEvidence } from './resume-evidence.js';

const resume = (overrides: Partial<ResumeContent> = {}): ResumeContent => ({
  contact: {
    fullName: null,
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
  ...overrides,
});

describe('findResumeEvidence', () => {
  it('marks a skill only named in the skills section as LISTED', () => {
    const evidence = findResumeEvidence(
      resume({ skills: [{ name: 'Postgres', category: 'DATABASE' }] }),
      SKILLS,
    );
    expect(evidence.get('postgresql')).toEqual({
      strength: 'LISTED',
      items: [{ kind: 'SKILLS_SECTION', excerpt: 'Skills: Postgres', context: null }],
    });
  });

  it('marks a skill used in experience or a project as APPLIED, with context', () => {
    const evidence = findResumeEvidence(
      resume({
        skills: [{ name: 'SQL', category: 'DATABASE' }],
        experiences: [
          {
            company: 'Acme',
            jobTitle: 'Analyst',
            location: null,
            startDate: null,
            endDate: null,
            isCurrent: false,
            responsibilities: ['Wrote SQL reports for the sales team'],
            achievements: [],
            technologies: [],
          },
        ],
        projects: [
          {
            name: 'Portfolio site',
            description: null,
            technologies: ['React.js'],
            highlights: [],
            url: null,
          },
        ],
      }),
      SKILLS,
    );
    expect(evidence.get('sql')?.strength).toBe('APPLIED');
    expect(evidence.get('sql')?.items).toContainEqual({
      kind: 'EXPERIENCE',
      excerpt: 'Wrote SQL reports for the sales team',
      context: 'Analyst at Acme',
    });
    expect(evidence.get('react')).toMatchObject({
      strength: 'APPLIED',
      items: [{ kind: 'PROJECT', context: 'Portfolio site' }],
    });
  });

  it('never infers a skill from a different one (Java is not JavaScript)', () => {
    const evidence = findResumeEvidence(
      resume({
        skills: [{ name: 'Java', category: 'BACKEND' }],
        summary: 'Java developer',
      }),
      SKILLS,
    );
    expect(evidence.has('java')).toBe(true);
    expect(evidence.has('javascript')).toBe(false);
  });

  it('finds nothing in an empty resume', () => {
    expect(findResumeEvidence(resume(), SKILLS).size).toBe(0);
  });

  it('keeps excerpts short', () => {
    const long = `Built ${'very '.repeat(60)}large Python pipelines`;
    const evidence = findResumeEvidence(
      resume({
        projects: [{ name: 'ETL', description: long, technologies: [], highlights: [], url: null }],
      }),
      SKILLS,
    );
    expect(evidence.get('python')?.items[0]?.excerpt.length).toBeLessThanOrEqual(160);
  });
});
