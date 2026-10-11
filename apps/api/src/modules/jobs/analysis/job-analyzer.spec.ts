import {
  analyzeJobText,
  isInsufficient,
  jobContentHash,
  normalizeJobDescription,
} from './job-analyzer.js';

export const FRONTEND_JOB = `Frontend Developer

Company: Example Corp
Location: Chennai (Hybrid)

We are looking for a frontend developer to build our SaaS analytics dashboards. You will work closely with designers and backend engineers. This is a full-time role.

Responsibilities:
- Build and maintain frontend applications in Angular
- Develop reusable UI components for our design system
- Integrate REST APIs and real-time WebSocket feeds
- Optimize application performance

Requirements:
- 3+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS
- Experience building SaaS applications
- Bachelor's degree in Computer Science or equivalent experience

Nice to have:
- React.js or Vue
- Docker and AWS
- Experience with PostgreSQL

Benefits:
- Health insurance and Python training budget`;

describe('analyzeJobText', () => {
  const result = analyzeJobText({ title: 'Frontend Developer', description: FRONTEND_JOB });
  const of = (type: string) => result.requirements.filter((r) => r.type === type);
  const skill = (name: string) => of('SKILL').find((r) => r.name === name);

  it('separates required and preferred skills, with the stating line as evidence', () => {
    expect(skill('Angular')).toMatchObject({ importance: 'REQUIRED', origin: 'EXPLICIT' });
    expect(skill('TypeScript')).toMatchObject({ importance: 'REQUIRED', origin: 'EXPLICIT' });
    expect(skill('RxJS')?.evidence).toBe('Strong experience with Angular, TypeScript and RxJS');
    expect(skill('React')).toMatchObject({ importance: 'PREFERRED', origin: 'EXPLICIT' });
    expect(skill('Docker')?.importance).toBe('PREFERRED');
    expect(skill('AWS')?.importance).toBe('PREFERRED');
    expect(skill('PostgreSQL')?.importance).toBe('PREFERRED');
  });

  it('normalises skill spellings (React.js → React, REST → REST APIs) without merging different skills', () => {
    expect(skill('React')).toBeDefined();
    expect(of('SKILL').some((r) => r.name === 'React.js')).toBe(false);
    expect(skill('REST APIs')).toBeDefined();
    expect(skill('WebSockets')).toBeDefined();
  });

  it('ignores benefits/company sections (Python appears only in benefits)', () => {
    expect(skill('Python')).toBeUndefined();
  });

  it('extracts responsibilities, years of experience and education', () => {
    expect(of('RESPONSIBILITY').map((r) => r.name)).toEqual([
      'Build and maintain frontend applications in Angular',
      'Develop reusable UI components for our design system',
      'Integrate REST APIs and real-time WebSocket feeds',
      'Optimize application performance',
    ]);
    expect(of('EXPERIENCE')).toEqual([
      expect.objectContaining({ minYears: 3, importance: 'REQUIRED' }),
    ]);
    expect(of('EDUCATION')).toHaveLength(1);
    expect(of('OTHER').map((r) => r.name)).toContain('Experience building SaaS applications');
  });

  it('reports seniority, employment type, keywords and a verbatim summary', () => {
    expect(result.seniority).toBe('MID');
    expect(result.seniorityOrigin).toBe('INFERRED');
    expect(result.employmentType).toBe('FULL_TIME');
    expect(result.keywords).toEqual(expect.arrayContaining(['Angular', 'SaaS', 'Dashboards']));
    expect(result.summary).toMatch(/^We are looking for a frontend developer/);
    expect(FRONTEND_JOB).toContain(result.summary!.split('. ')[0]!);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('every requirement name and evidence comes from the description', () => {
    const source = FRONTEND_JOB.toLowerCase();
    for (const r of result.requirements) {
      if (r.evidence) expect(source).toContain(r.evidence.toLowerCase());
      if (r.type !== 'SKILL') expect(source).toContain(r.name.toLowerCase());
    }
  });

  it('states seniority when the title names it', () => {
    const senior = analyzeJobText({
      title: 'Senior Backend Engineer',
      description: 'Node.js and AWS.',
    });
    expect(senior).toMatchObject({ seniority: 'SENIOR', seniorityOrigin: 'STATED' });
  });

  it('treats a skill mentioned outside any requirements section as an inferred requirement', () => {
    const r = analyzeJobText({
      title: 'Developer',
      description: 'You will build services with NestJS and talk to Postgres every day.',
    });
    expect(r.requirements.filter((x) => x.type === 'SKILL')).toEqual([
      expect.objectContaining({ name: 'NestJS', importance: 'REQUIRED', origin: 'INFERRED' }),
      expect.objectContaining({ name: 'PostgreSQL', importance: 'REQUIRED', origin: 'INFERRED' }),
    ]);
  });

  it('flags text with nothing to compare against', () => {
    const r = analyzeJobText({
      title: 'Role',
      description: 'Great team, nice office, apply today please.',
    });
    expect(isInsufficient(r)).toBe(true);
    expect(isInsufficient(result)).toBe(false);
  });
});

describe('normalizeJobDescription / jobContentHash', () => {
  it('unifies bullets and whitespace', () => {
    expect(normalizeJobDescription('Req:\r\n  • Angular\t\n\n\n\n* React  ')).toBe(
      'Req:\n- Angular\n\n- React',
    );
  });

  it('hashes equal postings equally regardless of case and spacing', () => {
    expect(jobContentHash('Dev', 'ACME', 'a  b')).toBe(jobContentHash(' dev', 'acme ', 'A b'));
    expect(jobContentHash('Dev', 'ACME', 'a b')).not.toBe(jobContentHash('Dev', 'Other', 'a b'));
  });
});
