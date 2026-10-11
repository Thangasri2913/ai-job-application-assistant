import { FRONTEND_JOB } from '../analysis/job-analyzer.spec.js';
import { analyzeJobText } from '../analysis/job-analyzer.js';
import { type MatchJob, type MatchSubject, scoreMatch } from './match-scorer.js';
import { rankMatches, recommendationReasons } from './recommendation.js';

const analysis = analyzeJobText({ title: 'Frontend Developer', description: FRONTEND_JOB });
const job: MatchJob = {
  title: 'Frontend Developer',
  requirements: analysis.requirements,
  keywords: analysis.keywords,
};

const base: MatchSubject = {
  label: 'this resume',
  skills: [],
  experiences: [],
  projects: [],
  certifications: [],
  educations: [],
  summary: null,
  yearsOfExperience: null,
  yearsSource: null,
};

export const angularResume: MatchSubject = {
  ...base,
  skills: ['Angular', 'TypeScript', 'RxJS', 'Docker'],
  experiences: [
    {
      jobTitle: 'Frontend Developer',
      company: 'Acme',
      technologies: ['Angular', 'TypeScript', 'RxJS'],
      lines: [
        'Built and maintained Angular frontend applications for a SaaS dashboard',
        'Developed reusable UI components for the company design system',
        'Integrated REST APIs and WebSocket feeds',
      ],
    },
  ],
  educations: [
    { institution: 'Anna University', degree: 'B.Tech', fieldOfStudy: 'Computer Science' },
  ],
  yearsOfExperience: 4,
  yearsSource: 'estimated from experience dates',
};

export const reactResume: MatchSubject = {
  ...base,
  skills: ['React', 'JavaScript'],
  experiences: [
    {
      jobTitle: 'Software Engineer',
      company: 'Beta',
      technologies: ['React', 'Node.js'],
      lines: ['Built React pages'],
    },
  ],
  projects: [{ name: 'Portfolio', technologies: ['React', 'AWS'], lines: ['Personal site'] }],
  yearsOfExperience: 2,
  yearsSource: 'stated',
};

describe('scoreMatch', () => {
  const angular = scoreMatch(job, angularResume);
  const react = scoreMatch(job, reactResume);
  const skill = (m: typeof angular, name: string) =>
    m.evidence.skills.find((s) => s.skill === name)!;

  it('scores the closer resume higher and labels the level', () => {
    expect(angular.overallScore).toBeGreaterThan(react.overallScore);
    expect(angular.overallScore).toBeGreaterThanOrEqual(70);
    expect(angular.level).toMatch(/STRONG|EXCELLENT/);
    expect(react.level).toMatch(/LOW|MODERATE/);
  });

  it('is deterministic', () => {
    expect(scoreMatch(job, angularResume)).toEqual(angular);
  });

  it('cites where each skill was found, and never invents evidence', () => {
    expect(skill(angular, 'Angular')).toMatchObject({
      status: 'MATCH',
      location: 'EXPERIENCE',
      credit: 1,
    });
    expect(skill(angular, 'Angular').evidence).toBe(
      'This resume lists it in work experience: Frontend Developer at Acme.',
    );
    expect(skill(angular, 'Docker')).toMatchObject({
      status: 'MATCH',
      location: 'SKILLS',
      credit: 0.8,
    });
    expect(skill(angular, 'AWS')).toMatchObject({ status: 'MISSING', credit: 0, location: null });
    expect(skill(angular, 'AWS').evidence).toBe('No AWS experience was found in this resume.');
    expect(skill(react, 'AWS')).toMatchObject({ status: 'PARTIAL', location: 'PROJECTS' });
    // TypeScript isn't listed, but JavaScript is: partial credit, never a MATCH.
    expect(skill(react, 'TypeScript')).toMatchObject({
      status: 'PARTIAL',
      location: 'RELATED_SKILL',
      credit: 0.3,
    });
  });

  it('identifies missing required skills and experience gaps', () => {
    expect(react.gaps).toContain('Required skills not found: Angular, REST APIs, WebSockets, RxJS');
    expect(react.gaps).toContain('Required skills not shown in work experience: TypeScript');
    expect(react.gaps).toContain('2 years of experience vs 3+ asked for');
    expect(angular.strengths).toContain('4 years of experience meets the 3+ years asked for');
    expect(angular.strengths[0]).toBe(
      'Matches 5 of 5 required skills: Angular, REST APIs, WebSockets, TypeScript, RxJS',
    );
  });

  it('quotes the resume line that covers a responsibility', () => {
    const covered = angular.evidence.responsibilities.find((r) =>
      r.responsibility.startsWith('Develop reusable UI components'),
    )!;
    expect(covered.status).toBe('MATCH');
    expect(angularResume.experiences[0]!.lines).toContain(covered.matchedLine);
    expect(
      react.evidence.responsibilities.every((r) => r.status !== 'MATCH' || r.matchedLine),
    ).toBe(true);
  });

  it('checks education and leaves unstated dimensions out of the score', () => {
    expect(angular.evidence.education).toMatchObject({
      met: true,
      candidateHighest: "Bachelor's degree",
    });
    const noEducation: MatchJob = {
      ...job,
      requirements: job.requirements.filter((r) => r.type !== 'EDUCATION'),
    };
    expect(scoreMatch(noEducation, angularResume).scores.education).toBeNull();
  });

  it('gives a subject with no data a low score instead of failing', () => {
    const empty = scoreMatch(job, base);
    expect(empty.overallScore).toBeLessThan(20);
    expect(empty.level).toBe('LOW');
  });
});

describe('rankMatches / recommendationReasons', () => {
  const entry = (
    id: string,
    subject: MatchSubject,
    extra: Partial<{ isDefault: boolean; activatedAt: Date }> = {},
  ) => ({
    resumeVersionId: id,
    resumeName: id,
    isDefault: extra.isDefault ?? false,
    activatedAt: extra.activatedAt ?? null,
    scored: scoreMatch(job, subject),
  });

  it('puts the highest score first and explains why', () => {
    const ranked = rankMatches([entry('react', reactResume), entry('angular', angularResume)]);
    expect(ranked.map((r) => r.resumeVersionId)).toEqual(['angular', 'react']);
    const { reasons, gaps } = recommendationReasons(ranked);
    expect(reasons.at(-1)).toMatch(
      /^Highest compatibility of the 2 resumes compared \(\d+ points ahead of “react”\)$/,
    );
    expect(gaps).toEqual(ranked[0]!.scored.gaps.slice(0, 5));
  });

  it('breaks exact ties deterministically: default resume, then newest, then id', () => {
    const a = entry('b-version', angularResume, { activatedAt: new Date('2026-01-01') });
    const b = entry('a-version', angularResume, { activatedAt: new Date('2026-01-01') });
    expect(rankMatches([a, b]).map((r) => r.resumeVersionId)).toEqual(['a-version', 'b-version']);
    const newer = entry('z-version', angularResume, { activatedAt: new Date('2026-06-01') });
    expect(rankMatches([a, b, newer])[0]!.resumeVersionId).toBe('z-version');
    const def = entry('y-version', angularResume, { isDefault: true });
    expect(rankMatches([a, newer, def])[0]!.resumeVersionId).toBe('y-version');
    expect(recommendationReasons(rankMatches([a, def])).reasons.at(-1)).toMatch(
      /being your default resume/,
    );
  });
});
