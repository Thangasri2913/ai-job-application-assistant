import { estimateYearsOfExperience, normalizeDate, parseResumeText } from './resume-parser.js';

const NOW = new Date('2026-10-01T00:00:00Z');

const SAMPLE = `Thanga Sri
Frontend Developer
thanga.sri@example.com | +91 98765 43210 | Chennai, India
linkedin.com/in/thangasri | github.com/thangasri | thangasri.dev

PROFESSIONAL SUMMARY
Frontend developer with 3.3 years of experience building Angular applications.

TECHNICAL SKILLS
Frontend: Angular, TypeScript, JavaScript, RxJS, HTML5, SCSS
Backend: Node.js, Express
Tools: Git, Jira, Figma

WORK EXPERIENCE
Frontend Developer | Acme Technologies | Chennai, India
Jul 2023 – Present
• Built a reusable Angular component library used across 4 products
• Improved page load time by 35% through lazy loading
• Collaborated with designers on accessibility fixes

Software Engineer Intern - Beta Labs
Jan 2023 - Jun 2023
- Developed REST API integrations with Node.js
- Wrote unit tests with Jasmine and Karma

EDUCATION
B.Tech in Computer Science
Anna University, Chennai
2018 - 2022 | CGPA: 8.4/10

PROJECTS
Job Tracker | Angular, Firebase
- Built a kanban board for tracking job applications
- github.com/thangasri/job-tracker

CERTIFICATIONS
AWS Certified Cloud Practitioner - Amazon Web Services (Mar 2023)

ACHIEVEMENTS
• Employee of the Quarter, Q2 2024

LANGUAGES
English (Fluent), Tamil (Native)`;

describe('parseResumeText', () => {
  const result = parseResumeText(SAMPLE, NOW);

  it('extracts contact details from the header', () => {
    expect(result.contact).toEqual({
      fullName: 'Thanga Sri',
      email: 'thanga.sri@example.com',
      phone: '+91 98765 43210',
      location: 'Chennai, India',
      linkedinUrl: 'https://linkedin.com/in/thangasri',
      githubUrl: 'https://github.com/thangasri',
      portfolioUrl: 'https://thangasri.dev',
    });
  });

  it('takes the headline verbatim from the job-title line under the name', () => {
    expect(result.headline).toBe('Frontend Developer');
  });

  it('keeps the summary text verbatim', () => {
    expect(result.summary).toBe(
      'Frontend developer with 3.3 years of experience building Angular applications.',
    );
  });

  it('lists only skills the resume states, categorised by label or dictionary', () => {
    expect(result.skills.map((s) => s.name)).toEqual([
      'Angular',
      'TypeScript',
      'JavaScript',
      'RxJS',
      'HTML5',
      'SCSS',
      'Node.js',
      'Express',
      'Git',
      'Jira',
      'Figma',
    ]);
    expect(result.skills.find((s) => s.name === 'Angular')?.category).toBe('FRONTEND');
    expect(result.skills.find((s) => s.name === 'Express')?.category).toBe('BACKEND');
    expect(result.skills.find((s) => s.name === 'Jira')?.category).toBe('TOOLS');
  });

  it('splits experience entries with titles, companies, dates and bullets', () => {
    expect(result.experiences).toHaveLength(2);
    const [acme, beta] = result.experiences;
    expect(acme).toMatchObject({
      jobTitle: 'Frontend Developer',
      company: 'Acme Technologies',
      location: 'Chennai, India',
      startDate: '2023-07-01',
      endDate: null,
      isCurrent: true,
    });
    expect(acme?.achievements).toEqual(['Improved page load time by 35% through lazy loading']);
    expect(acme?.responsibilities).toEqual([
      'Built a reusable Angular component library used across 4 products',
      'Collaborated with designers on accessibility fixes',
    ]);
    expect(beta).toMatchObject({
      jobTitle: 'Software Engineer Intern',
      company: 'Beta Labs',
      startDate: '2023-01-01',
      endDate: '2023-06-01',
      isCurrent: false,
    });
  });

  it('only reports technologies that literally appear in the entry', () => {
    const [acme, beta] = result.experiences;
    expect(acme?.technologies).toEqual(['Angular']);
    expect(beta?.technologies).toEqual(
      expect.arrayContaining(['Node.js', 'Jasmine', 'Karma', 'REST']),
    );
    expect(beta?.technologies).not.toContain('Angular');
  });

  it('parses education with degree, field, institution, years and grade', () => {
    expect(result.educations).toEqual([
      {
        institution: 'Anna University, Chennai',
        degree: 'B.Tech',
        fieldOfStudy: 'Computer Science',
        startDate: '2018-01-01',
        endDate: '2022-01-01',
        grade: '8.4/10',
      },
    ]);
  });

  it('parses projects and certifications', () => {
    expect(result.projects[0]).toMatchObject({
      name: 'Job Tracker',
      url: 'https://github.com/thangasri/job-tracker',
    });
    expect(result.projects[0]?.technologies).toEqual(
      expect.arrayContaining(['Angular', 'Firebase']),
    );
    expect(result.certifications).toEqual([
      {
        name: 'AWS Certified Cloud Practitioner',
        issuer: 'Amazon Web Services',
        date: '2023-03-01',
      },
    ]);
    expect(result.achievements).toEqual(['Employee of the Quarter, Q2 2024']);
    expect(result.languages).toEqual(['English (Fluent)', 'Tamil (Native)']);
  });

  it('estimates total experience from date ranges without double-counting', () => {
    // Jan 2023 → Jun 2023 (5 months) + Jul 2023 → Oct 2026 (39 months) = 44 months ≈ 3.7 years
    expect(result.estimatedYearsOfExperience).toBe(3.7);
  });

  it('never invents content: every extracted string appears in the source text', () => {
    const strings: string[] = [];
    const collect = (value: unknown) => {
      if (typeof value === 'string') strings.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    const { contact, experiences, educations, projects, certifications, skills, ...rest } = result;
    collect([
      experiences.map(({ startDate: _s, endDate: _e, ...e }) => e),
      skills.map((s) => s.name),
      rest.headline,
      rest.summary,
      rest.achievements,
      rest.languages,
    ]);
    collect([contact.fullName, contact.email, contact.phone, contact.location]);
    collect([
      educations.map((e) => [e.institution, e.degree, e.fieldOfStudy, e.grade]),
      projects.map((p) => [p.name, p.highlights]),
      certifications.map((c) => [c.name, c.issuer]),
    ]);
    const source = SAMPLE.toLowerCase();
    for (const value of strings) expect(source).toContain(value.toLowerCase());
  });
});

describe('parseResumeText edge cases', () => {
  it('returns empty sections for text without recognisable headings', () => {
    const result = parseResumeText('Just some text\nwith no structure at all', NOW);
    expect(result.experiences).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.summary).toBeNull();
  });

  it('leaves the headline empty when the header has no job-title line', () => {
    const result = parseResumeText(
      'Jane Doe\njane@example.com | +44 7700 900123\n\nSKILLS\nPython',
      NOW,
    );
    expect(result.headline).toBeNull();
  });

  it('does not take a contact line as the headline', () => {
    const result = parseResumeText('Jane Doe\nengineer@example.com\n\nSKILLS\nPython', NOW);
    expect(result.headline).toBeNull();
  });

  it('does not treat a date range as a phone number', () => {
    const result = parseResumeText('Jane Doe\n2019 - 2021\n\nSKILLS\nPython', NOW);
    expect(result.contact.phone).toBeNull();
  });
});

describe('normalizeDate', () => {
  it.each([
    ['Jan 2021', '2021-01-01'],
    ['September 2019', '2019-09-01'],
    ["Mar '22", '2022-03-01'],
    ['03/2020', '2020-03-01'],
    ['2018', '2018-01-01'],
    ['13/2020', null],
    ['soon', null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });
});

describe('estimateYearsOfExperience', () => {
  const entry = (startDate: string, endDate: string | null, isCurrent = false) => ({
    company: 'x',
    jobTitle: 'y',
    location: null,
    startDate,
    endDate,
    isCurrent,
    responsibilities: [],
    achievements: [],
    technologies: [],
  });

  it('merges overlapping ranges', () => {
    expect(
      estimateYearsOfExperience(
        [entry('2020-01-01', '2021-01-01'), entry('2020-07-01', '2021-07-01')],
        NOW,
      ),
    ).toBe(1.5);
  });

  it('returns null when no dated entries exist', () => {
    expect(estimateYearsOfExperience([], NOW)).toBeNull();
  });
});

describe('technology detection', () => {
  it('ignores ordinary English uses of technology names', async () => {
    const { detectTechnologies } = await import('./skill-dictionary.js');
    expect(
      detectTechnologies('I express ideas clearly and have solid accessibility skills in spring'),
    ).toEqual([]);
    expect(detectTechnologies('Built APIs with Express and Spring Boot')).toEqual([
      'Express',
      'Spring',
      'Spring Boot',
    ]);
    expect(detectTechnologies('JavaScript only')).toEqual(['JavaScript']);
  });
});
