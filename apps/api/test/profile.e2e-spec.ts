import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/database/prisma.service.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';

const fullProfile = {
  fullName: 'Thanga Sri',
  phone: '+91 98765 43210',
  location: 'Chennai',
  country: 'India',
  linkedinUrl: 'https://linkedin.com/in/thangasri',
  githubUrl: 'https://github.com/thangasri',
  portfolioUrl: null,
  preferredRoles: ['Angular Developer', 'Frontend Developer'],
  preferredLocations: ['Chennai', 'Remote'],
  workModes: ['REMOTE', 'HYBRID'],
  salaryMin: 1200000,
  salaryMax: 1800000,
  salaryCurrency: 'INR',
  employmentTypes: ['FULL_TIME', 'CONTRACT'],
  noticePeriod: '30 days',
  workAuthorization: 'Indian citizen',
  headline: 'Frontend Developer · Angular & TypeScript',
  summary: 'Frontend developer focused on Angular, TypeScript and accessible, maintainable UI.',
  yearsOfExperience: 3.3,
  currentJobTitle: 'Frontend Developer',
  currentCompany: 'Acme Technologies',
  previousJobTitles: ['Software Engineer Intern'],
  previousCompanies: ['Beta Labs'],
};

const experience = {
  company: 'Acme Technologies',
  jobTitle: 'Frontend Developer',
  location: 'Chennai, India',
  startDate: '2023-07-01',
  endDate: null,
  isCurrent: true,
  description: null,
  responsibilities: ['Built reusable Angular components'],
  achievements: [],
  technologies: ['Angular', 'TypeScript'],
};

describe('Career profile (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Thanga Sri');
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns an empty profile for a new user', async () => {
    const res = await user.get('/profile').expect(200);
    expect(res.body.details).toMatchObject({
      fullName: 'Thanga Sri',
      email: user.email,
      phone: null,
      yearsOfExperience: null,
    });
    expect(res.body.skills).toEqual([]);
    expect(res.body.experiences).toEqual([]);
  });

  it('saves profile details exactly as entered (3.3 years stays 3.3)', async () => {
    const res = await user.put('/profile', fullProfile).expect(200);
    expect(res.body).toMatchObject({ ...fullProfile, email: user.email });

    const reloaded = await user.get('/profile').expect(200);
    expect(reloaded.body.details.yearsOfExperience).toBe(3.3);
    expect(reloaded.body.details.workModes).toEqual(['REMOTE', 'HYBRID']);
    // The first save creates the profile; later saves update it.
    const actions = async () =>
      (
        await prisma.auditLog.findMany({
          where: { userId: user.userId, action: { startsWith: 'profile.' } },
          orderBy: { createdAt: 'asc' },
        })
      ).map((a) => a.action);
    expect(await actions()).toEqual(['profile.created']);
    await user.put('/profile', { ...fullProfile, headline: null }).expect(200);
    expect(await actions()).toEqual(['profile.created', 'profile.updated']);
    expect((await user.get('/profile').expect(200)).body.details.headline).toBeNull();
  });

  it('validates the headline length', async () => {
    await user.put('/profile', { ...fullProfile, headline: 'x'.repeat(151) }).expect(400);
  });

  it('validates profile fields', async () => {
    const res = await user
      .put('/profile', {
        ...fullProfile,
        linkedinUrl: 'javascript:alert(1)',
        salaryCurrency: 'rupees',
        yearsOfExperience: 3.33,
      })
      .expect(400);
    const fields = (res.body.details as { field: string }[]).map((d) => d.field).sort();
    expect(fields).toEqual(['linkedinUrl', 'salaryCurrency', 'yearsOfExperience']);
  });

  it('supports experience CRUD with date validation', async () => {
    const created = await user.post('/profile/experiences', experience).expect(201);
    expect(created.body).toMatchObject(experience);

    await user
      .patch(`/profile/experiences/${created.body.id}`, {
        ...experience,
        isCurrent: false,
        endDate: '2025-01-01',
      })
      .expect(200);
    const list = await user.get('/profile/experiences').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ endDate: '2025-01-01', isCurrent: false });

    const bad = await user
      .post('/profile/experiences', {
        ...experience,
        isCurrent: false,
        startDate: '2024-01-01',
        endDate: '2023-01-01',
      })
      .expect(400);
    expect(bad.body.details[0].field).toBe('endDate');

    await user.delete(`/profile/experiences/${created.body.id}`).expect(204);
    await user.delete(`/profile/experiences/${created.body.id}`).expect(404);
  });

  it('supports education, project and certification CRUD', async () => {
    const edu = await user
      .post('/profile/education', {
        institution: 'Anna University',
        degree: 'B.Tech',
        fieldOfStudy: 'CS',
        startDate: '2018-06-01',
        endDate: '2022-05-01',
        grade: '8.4/10',
      })
      .expect(201);
    await user
      .patch(`/profile/education/${edu.body.id}`, { ...edu.body, id: undefined, grade: '8.5/10' })
      .expect(200);

    const project = await user
      .post('/profile/projects', {
        name: 'Job Tracker',
        description: 'Kanban board',
        role: 'Sole developer',
        technologies: ['Angular'],
        responsibilities: [],
        achievements: [],
        url: 'https://github.com/x/job-tracker',
      })
      .expect(201);
    await user.delete(`/profile/projects/${project.body.id}`).expect(204);

    const cert = await user
      .post('/profile/certifications', {
        name: 'AWS Cloud Practitioner',
        issuer: 'AWS',
        issueDate: '2023-03-01',
        expiryDate: '2026-03-01',
        credentialId: 'ABC',
        credentialUrl: null,
      })
      .expect(201);
    await user
      .post('/profile/certifications', {
        name: 'X',
        issuer: null,
        issueDate: '2023-03-01',
        expiryDate: '2022-01-01',
        credentialId: null,
        credentialUrl: null,
      })
      .expect(400);

    const profile = await user.get('/profile').expect(200);
    expect(profile.body.educations[0].grade).toBe('8.5/10');
    expect(profile.body.projects).toEqual([]);
    expect(profile.body.certifications[0].id).toBe(cert.body.id);
  });

  it('manages skills with case-insensitive uniqueness', async () => {
    const angular = await user
      .post('/profile/skills', { name: 'Angular', category: 'FRONTEND' })
      .expect(201);
    const dup = await user
      .post('/profile/skills', { name: '  angular ', category: 'OTHER' })
      .expect(409);
    expect(dup.body.code).toBe('CONFLICT');

    await user
      .patch(`/profile/skills/${angular.body.id}`, { name: 'Angular', category: 'ARCHITECTURE' })
      .expect(200);
    await user.post('/profile/skills', { name: 'Python', category: 'NOT_A_CATEGORY' }).expect(400);

    const list = await user.get('/profile/skills').expect(200);
    expect(list.body).toEqual([{ id: angular.body.id, name: 'Angular', category: 'ARCHITECTURE' }]);
  });

  it('imports reviewed resume data without overwriting existing facts', async () => {
    await user
      .put('/profile', { ...fullProfile, phone: '+91 11111 11111', summary: null })
      .expect(200);
    await user.post('/profile/skills', { name: 'Angular', category: 'FRONTEND' }).expect(201);

    const res = await user
      .post('/profile/import', {
        details: { phone: '+91 99999 99999', summary: 'Imported summary text.' },
        skills: [
          { name: 'angular', category: 'FRONTEND' },
          { name: 'RxJS', category: 'FRONTEND' },
        ],
        experiences: [experience],
      })
      .expect(200);

    expect(res.body).toMatchObject({
      filledFields: ['summary'],
      skippedFields: ['phone'],
      added: { skills: 1, experiences: 1 },
      skippedDuplicateSkills: ['angular'],
    });
    const profile = await user.get('/profile').expect(200);
    expect(profile.body.details.phone).toBe('+91 11111 11111');
    expect(profile.body.details.summary).toBe('Imported summary text.');
    expect(profile.body.skills.map((s: { name: string }) => s.name).sort()).toEqual([
      'Angular',
      'RxJS',
    ]);
  });

  it('computes a transparent profile completion from real data', async () => {
    const empty = await user.get('/profile/completion').expect(200);
    expect(empty.body.percentage).toBe(0);
    expect(empty.body.items).toHaveLength(9);

    await user.put('/profile', fullProfile).expect(200);
    await user.post('/profile/experiences', experience).expect(201);
    const res = await user.get('/profile/completion').expect(200);
    // basic 10 + links 5 + summary 10 + preferences 10 + experience 20
    expect(res.body.percentage).toBe(55);
    const missing = (res.body.items as { key: string; complete: boolean }[])
      .filter((i) => !i.complete)
      .map((i) => i.key);
    expect(missing).toEqual(['SKILLS', 'EDUCATION', 'PROJECTS', 'RESUME']);
    expect(res.body.missingSections).toEqual(missing);
    expect(empty.body.missingSections).toHaveLength(9);
  });

  it('rejects a salary range where the maximum is below the minimum', async () => {
    const res = await user
      .put('/profile', { ...fullProfile, salaryMin: 2000000, salaryMax: 1000000 })
      .expect(400);
    expect(res.body.details[0].field).toBe('salaryMax');
  });

  it('manages languages and achievements', async () => {
    const english = await user
      .post('/profile/languages', { name: 'English', proficiency: 'Fluent' })
      .expect(201);
    await user.post('/profile/languages', { name: ' english ', proficiency: null }).expect(409);
    await user
      .patch(`/profile/languages/${english.body.id}`, {
        name: 'English',
        proficiency: 'Professional',
      })
      .expect(200);

    const award = await user
      .post('/profile/achievements', {
        title: 'Employee of the Quarter',
        description: 'Q2 2024',
        date: '2024-07-01',
      })
      .expect(201);
    const profile = await user.get('/profile').expect(200);
    expect(profile.body.languages).toEqual([
      { id: english.body.id, name: 'English', proficiency: 'Professional' },
    ]);
    expect(profile.body.achievements).toEqual([
      {
        id: award.body.id,
        title: 'Employee of the Quarter',
        description: 'Q2 2024',
        date: '2024-07-01',
      },
    ]);
    await user.delete(`/profile/achievements/${award.body.id}`).expect(204);
  });

  it('reorders a section and keeps the new order', async () => {
    const ids: string[] = [];
    for (const company of ['First Co', 'Second Co', 'Third Co']) {
      ids.push(
        (await user.post('/profile/experiences', { ...experience, company }).expect(201)).body.id,
      );
    }
    const initial = await user.get('/profile/experiences').expect(200);
    expect(initial.body.map((e: { company: string }) => e.company)).toEqual([
      'First Co',
      'Second Co',
      'Third Co',
    ]);

    await user.put('/profile/experiences/order', { ids: [ids[2], ids[0], ids[1]] }).expect(204);
    const reordered = await user.get('/profile/experiences').expect(200);
    expect(reordered.body.map((e: { company: string }) => e.company)).toEqual([
      'Third Co',
      'First Co',
      'Second Co',
    ]);

    // Must list every item exactly once.
    await user.put('/profile/experiences/order', { ids: [ids[0], ids[1]] }).expect(400);
    await user.put('/profile/experiences/order', { ids: [ids[0], ids[0], ids[1]] }).expect(400);
    await user.put('/profile/unknown/order', { ids }).expect(404);
  });

  it('imports languages from a reviewed resume without duplicating existing ones', async () => {
    await user.post('/profile/languages', { name: 'English', proficiency: 'Fluent' }).expect(201);
    const res = await user
      .post('/profile/import', {
        languages: [
          { name: 'english', proficiency: null },
          { name: 'Tamil', proficiency: 'Native' },
        ],
      })
      .expect(200);
    expect(res.body).toMatchObject({
      added: { languages: 1 },
      skippedDuplicateLanguages: ['english'],
    });
  });
});
