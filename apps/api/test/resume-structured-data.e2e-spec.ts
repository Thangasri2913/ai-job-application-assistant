import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/database/prisma.service.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { buildPdf, SAMPLE_RESUME_LINES } from './support/resume-fixtures.js';

describe('Resume structured data & parsing lifecycle (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let dispatcher: ParsingDispatcher;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    dispatcher = app.get(ParsingDispatcher);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Thanga Sri');
  });

  afterAll(async () => {
    await app.close();
  });

  async function upload(fields: Record<string, string> = {}) {
    const res = await user
      .upload('/resumes', buildPdf(SAMPLE_RESUME_LINES), 'resume.pdf', fields)
      .expect(201);
    await dispatcher.drain();
    return res.body as { id: string; latestVersion: { id: string } };
  }

  it('stores the resume category and lets the user change it', async () => {
    const resume = await upload({ name: 'Angular Developer', category: 'Frontend' });
    expect((await user.get(`/resumes/${resume.id}`).expect(200)).body.category).toBe('Frontend');
    const updated = await user
      .patch(`/resumes/${resume.id}`, { category: 'Full Stack' })
      .expect(200);
    expect(updated.body.category).toBe('Full Stack');
  });

  it('moves from NEEDS_REVIEW to COMPLETED once the user confirms the extraction', async () => {
    const resume = await upload();
    const status = await user.get(`/resumes/${resume.id}/parsing-status`).expect(200);
    expect(status.body).toMatchObject({
      versionId: resume.latestVersion.id,
      versionNumber: 1,
      parseStatus: 'NEEDS_REVIEW',
    });

    const data = await user.get(`/resumes/${resume.id}/structured-data`).expect(200);
    expect(data.body).toMatchObject({
      versionNumber: 1,
      versionStatus: 'DRAFT',
      editable: true,
      aiStatus: 'DISABLED',
      confirmed: null,
    });

    const saved = await user
      .patch(`/resumes/${resume.id}/structured-data`, { ...data.body.parsed, summary: 'Reviewed.' })
      .expect(200);
    expect(saved.body).toMatchObject({
      versionId: resume.latestVersion.id,
      parseStatus: 'COMPLETED',
    });
    expect(saved.body.confirmed.summary).toBe('Reviewed.');
  });

  it('round-trips a reviewed headline and reports provenance on the version summary', async () => {
    const resume = await upload();
    expect(resume.latestVersion).toMatchObject({
      hasAiExtraction: false,
      contentConfirmedAt: null,
    });
    const data = await user.get(`/resumes/${resume.id}/structured-data`).expect(200);
    // The sample has no title line under the name, so nothing is invented.
    expect(data.body.parsed.headline).toBeNull();

    await user
      .patch(`/resumes/${resume.id}/structured-data`, {
        ...data.body.parsed,
        headline: 'Angular Developer',
      })
      .expect(200);
    const detail = await user.get(`/resumes/${resume.id}`).expect(200);
    expect(detail.body.latestVersion.contentConfirmedAt).toEqual(expect.any(String));
    const version = await user
      .get(`/resumes/${resume.id}/versions/${resume.latestVersion.id}`)
      .expect(200);
    expect(version.body.content.headline).toBe('Angular Developer');
  });

  it('stores confirmed content in normalised tables, separate from the raw extraction', async () => {
    const resume = await upload();
    const data = await user.get(`/resumes/${resume.id}/structured-data`).expect(200);
    await user.patch(`/resumes/${resume.id}/structured-data`, data.body.parsed).expect(200);

    const versionId = resume.latestVersion.id;
    const skills = await prisma.resumeVersionSkill.findMany({
      where: { versionId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(skills.map((s) => s.name)).toEqual(['Angular', 'TypeScript', 'RxJS', 'Git', 'Jira']);
    const experiences = await prisma.resumeVersionExperience.findMany({ where: { versionId } });
    expect(experiences[0]).toMatchObject({
      company: 'Acme Technologies',
      jobTitle: 'Frontend Developer',
      isCurrent: true,
    });
    const version = await prisma.resumeVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(version.extractedText).toContain('Acme Technologies');
    expect(version.parsedData).not.toBeNull();
  });

  it('never edits a frozen version: structured-data edits on a current version create a new draft', async () => {
    const resume = await upload();
    const v1 = resume.latestVersion.id;
    const data = await user.get(`/resumes/${resume.id}/structured-data`).expect(200);
    await user.patch(`/resumes/${resume.id}/structured-data`, data.body.parsed).expect(200);
    await user.post(`/resumes/${resume.id}/versions/${v1}/activate`).expect(200);

    const current = await user.get(`/resumes/${resume.id}/structured-data`).expect(200);
    expect(current.body).toMatchObject({ versionId: v1, versionStatus: 'ACTIVE', editable: false });

    const edited = await user
      .patch(`/resumes/${resume.id}/structured-data`, {
        ...current.body.confirmed,
        summary: 'Angular-focused summary.',
      })
      .expect(200);
    expect(edited.body).toMatchObject({ versionNumber: 2, versionStatus: 'DRAFT' });
    expect(edited.body.versionId).not.toBe(v1);

    const original = await user.get(`/resumes/${resume.id}/versions/${v1}`).expect(200);
    expect(original.body.content.summary).toContain('3.3 years');
    expect(original.body.status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { action: 'resume.version_created' } })).toBe(1);
  });

  it('re-parses a failed upload on request', async () => {
    const res = await user.upload('/resumes', buildPdf([]), 'scan.pdf').expect(201);
    await dispatcher.drain();
    expect(
      (await user.get(`/resumes/${res.body.id}/parsing-status`).expect(200)).body.parseStatus,
    ).toBe('FAILED');

    const again = await user.post(`/resumes/${res.body.id}/parse`).expect(202);
    expect(['PENDING', 'PROCESSING']).toContain(again.body.parseStatus);
    await dispatcher.drain();
    const after = await user.get(`/resumes/${res.body.id}/parsing-status`).expect(200);
    expect(after.body.parseStatus).toBe('FAILED');
    expect(await prisma.auditLog.count({ where: { action: 'resume.parse_started' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'resume.parse_failed' } })).toBe(2);
  });

  it('reports resumes needing review and the latest upload on the dashboard', async () => {
    const first = await upload({ name: 'First' });
    const second = await upload({ name: 'Second' });
    const data = await user.get(`/resumes/${first.id}/structured-data`).expect(200);
    await user.patch(`/resumes/${first.id}/structured-data`, data.body.parsed).expect(200);

    const summary = await user.get('/dashboard/summary').expect(200);
    expect(summary.body.resumes).toMatchObject({ total: 2, active: 2, needsReview: 1 });
    expect(summary.body.resumes.latestUpload).toMatchObject({ id: second.id, name: 'Second' });
  });
});
