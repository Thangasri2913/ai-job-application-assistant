import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { buildPdf, SAMPLE_RESUME_LINES } from './support/resume-fixtures.js';

/**
 * MANDATORY SECURITY TEST: User B must never read or change User A's data by
 * using User A's ids. Every attempt must look exactly like a missing resource (404).
 */
describe('Cross-user isolation (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let userA: TestUser;
  let userB: TestUser;
  let resumeId: string;
  let versionId: string;
  let experienceId: string;
  let skillId: string;
  let languageId: string;
  let achievementId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    userA = await signUp(app, 'User A');
    userB = await signUp(app, 'User B');

    const upload = await userA
      .upload('/resumes', buildPdf(SAMPLE_RESUME_LINES), 'a.pdf', { name: 'A private resume' })
      .expect(201);
    resumeId = upload.body.id;
    versionId = upload.body.latestVersion.id;
    await app.get(ParsingDispatcher).drain();
    await userA.post(`/resumes/${resumeId}/default`).expect(200);

    experienceId = (
      await userA
        .post('/profile/experiences', {
          company: 'A Corp',
          jobTitle: 'Engineer',
          location: null,
          startDate: null,
          endDate: null,
          isCurrent: false,
          description: null,
          responsibilities: [],
          achievements: [],
          technologies: [],
        })
        .expect(201)
    ).body.id;
    skillId = (
      await userA.post('/profile/skills', { name: 'Secret skill', category: 'OTHER' }).expect(201)
    ).body.id;
    languageId = (
      await userA.post('/profile/languages', { name: 'Tamil', proficiency: 'Native' }).expect(201)
    ).body.id;
    achievementId = (
      await userA
        .post('/profile/achievements', { title: 'Secret award', description: null, date: null })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const validContent = {
    contact: {
      fullName: null,
      email: null,
      phone: null,
      location: null,
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
    },
    summary: 'hijacked',
    skills: [],
    experiences: [],
    educations: [],
    projects: [],
    certifications: [],
    achievements: [],
    estimatedYearsOfExperience: null,
  };
  const validExperience = {
    company: 'x',
    jobTitle: 'y',
    location: null,
    startDate: null,
    endDate: null,
    isCurrent: false,
    description: null,
    responsibilities: [],
    achievements: [],
    technologies: [],
  };

  it.each([
    ['GET resume', () => userB.get(`/resumes/${resumeId}`)],
    ['PATCH resume', () => userB.patch(`/resumes/${resumeId}`, { name: 'hijacked' })],
    ['DELETE resume', () => userB.delete(`/resumes/${resumeId}`)],
    ['archive', () => userB.post(`/resumes/${resumeId}/archive`)],
    ['restore', () => userB.post(`/resumes/${resumeId}/restore`)],
    ['duplicate', () => userB.post(`/resumes/${resumeId}/duplicate`, {})],
    ['set default', () => userB.post(`/resumes/${resumeId}/default`)],
    ['clear default', () => userB.delete(`/resumes/${resumeId}/default`)],
    ['list versions', () => userB.get(`/resumes/${resumeId}/versions`)],
    ['create version', () => userB.post(`/resumes/${resumeId}/versions`, {})],
    [
      'upload version',
      () =>
        userB.upload(
          `/resumes/${resumeId}/versions/upload`,
          buildPdf(['x y z long enough text here']),
          'b.pdf',
        ),
    ],
    ['GET version', () => userB.get(`/resumes/${resumeId}/versions/${versionId}`)],
    ['parse status', () => userB.get(`/resumes/${resumeId}/versions/${versionId}/parse-status`)],
    ['re-parse', () => userB.post(`/resumes/${resumeId}/versions/${versionId}/parse`)],
    [
      'extracted data',
      () => userB.get(`/resumes/${resumeId}/versions/${versionId}/extracted-data`),
    ],
    [
      'edit extracted data',
      () => userB.patch(`/resumes/${resumeId}/versions/${versionId}/extracted-data`, validContent),
    ],
    ['activate version', () => userB.post(`/resumes/${resumeId}/versions/${versionId}/activate`)],
    ['download file', () => userB.get(`/resumes/${resumeId}/versions/${versionId}/file`)],
    [
      'PATCH experience',
      () => userB.patch(`/profile/experiences/${experienceId}`, validExperience),
    ],
    ['DELETE experience', () => userB.delete(`/profile/experiences/${experienceId}`)],
    [
      'PATCH skill',
      () => userB.patch(`/profile/skills/${skillId}`, { name: 'x', category: 'OTHER' }),
    ],
    ['DELETE skill', () => userB.delete(`/profile/skills/${skillId}`)],
    [
      'PATCH language',
      () => userB.patch(`/profile/languages/${languageId}`, { name: 'x', proficiency: null }),
    ],
    ['DELETE language', () => userB.delete(`/profile/languages/${languageId}`)],
    [
      'PATCH achievement',
      () =>
        userB.patch(`/profile/achievements/${achievementId}`, {
          title: 'x',
          description: null,
          date: null,
        }),
    ],
    ['DELETE achievement', () => userB.delete(`/profile/achievements/${achievementId}`)],
    ['resume parsing-status', () => userB.get(`/resumes/${resumeId}/parsing-status`)],
    ['resume re-parse', () => userB.post(`/resumes/${resumeId}/parse`)],
    ['resume structured-data', () => userB.get(`/resumes/${resumeId}/structured-data`)],
    [
      'edit resume structured-data',
      () => userB.patch(`/resumes/${resumeId}/structured-data`, validContent),
    ],
  ])('User B cannot %s of User A', async (_label, attempt) => {
    const res = await attempt();
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it("User B's lists and dashboard never include User A's data", async () => {
    expect((await userB.get('/resumes?status=ALL').expect(200)).body).toEqual([]);
    expect((await userB.get('/resumes?status=ALL&q=private').expect(200)).body).toEqual([]);
    const profile = await userB.get('/profile').expect(200);
    expect(profile.body.experiences).toEqual([]);
    expect(profile.body.skills).toEqual([]);
    expect((await userB.get('/dashboard/summary').expect(200)).body.resumes.total).toBe(0);
  });

  it("User B cannot reorder User A's items by sending their ids", async () => {
    const res = await userB.put('/profile/languages/order', { ids: [languageId] }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it("User A's data is untouched after all of User B's attempts", async () => {
    const resume = await userA.get(`/resumes/${resumeId}`).expect(200);
    expect(resume.body).toMatchObject({
      name: 'A private resume',
      status: 'ACTIVE',
      isDefault: true,
      versionCount: 1,
    });
    await userA.get(`/resumes/${resumeId}/versions/${versionId}/file`).expect(200);
    const profile = await userA.get('/profile').expect(200);
    expect(profile.body.experiences[0].company).toBe('A Corp');
    expect(profile.body.skills[0].name).toBe('Secret skill');
    expect(profile.body.languages[0].name).toBe('Tamil');
    expect(profile.body.achievements[0].title).toBe('Secret award');
    expect(await prisma.resume.count({ where: { userId: userB.userId } })).toBe(0);
  });

  it('rejects unauthenticated access to every resume endpoint', async () => {
    await request(app.getHttpServer()).get(`/api/v1/resumes/${resumeId}`).expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/resumes/${resumeId}/versions/${versionId}/file`)
      .expect(401);
    await request(app.getHttpServer()).post('/api/v1/resumes').expect(401);
    await request(app.getHttpServer()).get('/api/v1/profile').expect(401);
  });
});
