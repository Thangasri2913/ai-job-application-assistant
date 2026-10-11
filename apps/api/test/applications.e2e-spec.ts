import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { StorageService } from '../src/modules/storage/storage.service.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import {
  ANGULAR_CONTENT,
  ANGULAR_JOB,
  createReviewedResume,
  REACT_CONTENT,
} from './support/job-fixtures.js';
import { buildPdf, SAMPLE_RESUME_LINES } from './support/resume-fixtures.js';

const today = () => new Date().toISOString().slice(0, 10);

describe('Application tracking (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let parsing: ParsingDispatcher;
  let analysis: JobAnalysisDispatcher;
  let storage: StorageService;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    parsing = app.get(ParsingDispatcher);
    analysis = app.get(JobAnalysisDispatcher);
    storage = app.get(StorageService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Thanga Sri');
  });

  afterAll(async () => {
    await app.close();
  });

  /** A job analysed against an Angular and a React resume. */
  async function setup(as: TestUser = user) {
    const angular = await createReviewedResume(as, parsing, 'Angular Resume', ANGULAR_CONTENT);
    const react = await createReviewedResume(as, parsing, 'React Resume', REACT_CONTENT);
    const job = (await as.post('/jobs', ANGULAR_JOB).expect(201)).body as { id: string };
    await as.post(`/jobs/${job.id}/analyze`).expect(202);
    await analysis.drain();
    return { angular, react, jobId: job.id };
  }

  async function create(body: Record<string, unknown>, as: TestUser = user) {
    return (await as.post('/applications', body).expect(201)).body;
  }

  describe('creation', () => {
    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/applications').expect(401);
      await request(app.getHttpServer()).post('/api/v1/applications').send({}).expect(401);
    });

    it('stores the exact resume version chosen, with the recommendation snapshot', async () => {
      const { angular, react, jobId } = await setup();
      // The user picks the React resume although the Angular one is recommended.
      const res = await user
        .post('/applications', {
          jobId,
          resumeVersionId: react.versionId,
          source: 'Company website',
          applicationUrl: 'https://example.com/careers/1',
          note: 'Referred by a friend.',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        jobId,
        jobTitle: 'Frontend Developer',
        status: 'SAVED',
        appliedAt: null,
        source: 'Company website',
        resumeUsed: {
          resumeName: 'React Resume',
          resumeVersionId: react.versionId,
          versionNumber: 1,
          newerVersionExists: false,
        },
        recommendedAtCreation: { resumeVersionId: angular.versionId, resumeName: 'Angular Resume' },
        allowedNextStatuses: ['PREPARING', 'APPLIED', 'WITHDRAWN'],
      });
      expect(res.body.matchScoreAtCreation).toEqual(expect.any(Number));
      expect(res.body.recommendedAtCreation.score).toBeGreaterThan(res.body.matchScoreAtCreation);
      expect(JSON.stringify(res.body)).not.toMatch(/storageKey|users\//);

      const row = await prisma.application.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({ userId: user.userId, resumeVersionId: react.versionId });
      expect(
        await prisma.applicationStatusHistory.count({ where: { applicationId: res.body.id } }),
      ).toBe(1);

      const job = (await user.get(`/jobs/${jobId}`).expect(200)).body;
      expect(job.application).toEqual({
        id: res.body.id,
        status: 'SAVED',
        resumeName: 'React Resume',
        versionNumber: 1,
      });
      expect(job.selectedResume).toMatchObject({
        resumeVersionId: react.versionId,
        isRecommended: false,
      });

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'application.created' },
      });
      expect(audit.metadata).toMatchObject({
        matchesRecommendation: false,
        resumeVersionId: react.versionId,
      });
      expect(JSON.stringify(audit.metadata)).not.toContain('Referred');
    });

    it('records an application that was already sent, with its date', async () => {
      const { angular, jobId } = await setup();
      const res = await create({
        jobId,
        resumeVersionId: angular.versionId,
        status: 'APPLIED',
        appliedAt: '2026-10-01',
      });
      expect(res).toMatchObject({ status: 'APPLIED', appliedAt: '2026-10-01' });
      await user.post('/applications/' + res.id + '/archive').expect(200);
      const noDate = await create({ jobId, resumeVersionId: angular.versionId, status: 'APPLIED' });
      expect(noDate.appliedAt).toBe(today());
    });

    it('validates input', async () => {
      const { angular, jobId } = await setup();
      const base = { jobId, resumeVersionId: angular.versionId };
      await user.post('/applications', { ...base, status: 'INTERVIEW' }).expect(400);
      await user.post('/applications', { ...base, status: 'HIRED' }).expect(400);
      await user.post('/applications', { ...base, appliedAt: '2026-10-01' }).expect(400); // SAVED with a date
      await user
        .post('/applications', { ...base, status: 'APPLIED', appliedAt: '2999-01-01' })
        .expect(400);
      await user
        .post('/applications', { ...base, applicationUrl: 'javascript:alert(1)' })
        .expect(400);
      await user.post('/applications', { ...base, jobId: 'nope' }).expect(400);
      await user.post('/applications', { ...base, userId: 'x' }).expect(400);
      await user
        .post('/applications', { ...base, jobId: '019a0000-0000-7000-8000-000000000000' })
        .expect(404);
    });

    it('only accepts the current, reviewed version of an active resume and an active job', async () => {
      const { angular, react, jobId } = await setup();
      // Unreviewed upload: its only version is a draft.
      const draft = await user
        .upload('/resumes', buildPdf(SAMPLE_RESUME_LINES), 'draft.pdf')
        .expect(201);
      await parsing.drain();
      const res = await user
        .post('/applications', { jobId, resumeVersionId: draft.body.latestVersion.id })
        .expect(409);
      expect(res.body.code).toBe('RESUME_NOT_SELECTABLE');
      await user.post(`/resumes/${react.resumeId}/archive`).expect(200);
      await user.post('/applications', { jobId, resumeVersionId: react.versionId }).expect(409);
      await user.post(`/jobs/${jobId}/archive`).expect(200);
      expect(
        (
          await user
            .post('/applications', { jobId, resumeVersionId: angular.versionId })
            .expect(409)
        ).body.code,
      ).toBe('JOB_ARCHIVED');
    });

    it('prevents a second active application for the same job', async () => {
      const { angular, react, jobId } = await setup();
      const first = await create({ jobId, resumeVersionId: angular.versionId });
      const dup = await user
        .post('/applications', { jobId, resumeVersionId: react.versionId })
        .expect(409);
      expect(dup.body).toMatchObject({
        code: 'APPLICATION_EXISTS',
        meta: { existingApplicationId: first.id },
      });

      // After archiving, a new application is allowed; the old one can't be restored alongside it.
      await user.post(`/applications/${first.id}/archive`).expect(200);
      const second = await create({ jobId, resumeVersionId: react.versionId });
      const restore = await user.post(`/applications/${first.id}/restore`).expect(409);
      expect(restore.body.meta).toEqual({ existingApplicationId: second.id });
      expect(await prisma.application.count({ where: { jobId, archivedAt: null } })).toBe(1);
    });
  });

  describe('status lifecycle', () => {
    it('moves through the pipeline, keeps every history record and sets appliedAt once', async () => {
      const { angular, jobId } = await setup();
      const created = await create({ jobId, resumeVersionId: angular.versionId });
      const firstHistory = await prisma.applicationStatusHistory.findFirstOrThrow({
        where: { applicationId: created.id },
      });

      const applied = await user
        .post(`/applications/${created.id}/status`, { status: 'APPLIED', note: 'Sent via website' })
        .expect(200);
      expect(applied.body).toMatchObject({ status: 'APPLIED', appliedAt: today() });
      // Correct the real date, then make sure later changes never overwrite it.
      await user.patch(`/applications/${created.id}`, { appliedAt: '2026-10-02' }).expect(200);
      await user.post(`/applications/${created.id}/status`, { status: 'ASSESSMENT' }).expect(200);
      await user.post(`/applications/${created.id}/status`, { status: 'INTERVIEW' }).expect(200);
      const back = await user
        .post(`/applications/${created.id}/status`, { status: 'ASSESSMENT' })
        .expect(200);
      expect(back.body.appliedAt).toBe('2026-10-02');
      await user.post(`/applications/${created.id}/status`, { status: 'INTERVIEW' }).expect(200);

      const history = await prisma.applicationStatusHistory.findMany({
        where: { applicationId: created.id },
        orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
      });
      expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
        [null, 'SAVED'],
        ['SAVED', 'APPLIED'],
        ['APPLIED', 'ASSESSMENT'],
        ['ASSESSMENT', 'INTERVIEW'],
        ['INTERVIEW', 'ASSESSMENT'],
        ['ASSESSMENT', 'INTERVIEW'],
      ]);
      expect(history[0]).toEqual(firstHistory); // never rewritten
      expect(history[1]!.note).toBe('Sent via website');

      const detail = (await user.get(`/applications/${created.id}`).expect(200)).body;
      expect(detail.importantDates).toMatchObject({
        appliedAt: '2026-10-02',
        firstInterviewAt: history[3]!.changedAt.toISOString(),
      });
      expect(await prisma.auditLog.count({ where: { action: 'application.status_changed' } })).toBe(
        5,
      );
    });

    it('rejects invalid transitions and unknown statuses', async () => {
      const { angular, jobId } = await setup();
      const created = await create({ jobId, resumeVersionId: angular.versionId });
      const jump = await user
        .post(`/applications/${created.id}/status`, { status: 'INTERVIEW' })
        .expect(409);
      expect(jump.body).toMatchObject({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'An application can’t move from Saved to Interview.',
      });
      await user.post(`/applications/${created.id}/status`, { status: 'SAVED' }).expect(409);
      await user.post(`/applications/${created.id}/status`, { status: 'GHOSTED' }).expect(400);
      expect(
        await prisma.applicationStatusHistory.count({ where: { applicationId: created.id } }),
      ).toBe(1);
    });

    it('records rejection with a reason, and allows only an undo afterwards', async () => {
      const { angular, jobId } = await setup();
      const created = await create({
        jobId,
        resumeVersionId: angular.versionId,
        status: 'APPLIED',
      });
      await user
        .post(`/applications/${created.id}/status`, { status: 'OFFER', rejectionReason: 'x' })
        .expect(400);
      const rejected = await user
        .post(`/applications/${created.id}/status`, {
          status: 'REJECTED',
          rejectionReason: 'Position filled internally',
        })
        .expect(200);
      expect(rejected.body).toMatchObject({
        rejectionReason: 'Position filled internally',
        allowedNextStatuses: ['APPLIED'],
      });
      expect(rejected.body.importantDates.closedAt).toEqual(expect.any(String));
      await user.post(`/applications/${created.id}/status`, { status: 'OFFER' }).expect(409);
    });

    it('edits details with sensible rules', async () => {
      const { angular, jobId } = await setup();
      const created = await create({ jobId, resumeVersionId: angular.versionId });
      await user.patch(`/applications/${created.id}`, { appliedAt: '2026-10-01' }).expect(400); // not sent yet
      await user.patch(`/applications/${created.id}`, { rejectionReason: 'x' }).expect(400);
      const res = await user
        .patch(`/applications/${created.id}`, { source: 'Referral', applicationUrl: null })
        .expect(200);
      expect(res.body).toMatchObject({ source: 'Referral', applicationUrl: null });
      await user.post(`/applications/${created.id}/status`, { status: 'APPLIED' }).expect(200);
      await user.patch(`/applications/${created.id}`, { appliedAt: '2999-01-01' }).expect(400);
      await user
        .patch(`/applications/${created.id}`, { resumeVersionId: angular.versionId })
        .expect(400); // immutable
    });
  });

  describe('exact resume version', () => {
    it('keeps referencing v1 after v2 becomes current, and protects the version from deletion', async () => {
      const { angular, jobId } = await setup();
      const created = await create({
        jobId,
        resumeVersionId: angular.versionId,
        status: 'APPLIED',
      });

      const v2 = await user
        .upload(
          `/resumes/${angular.resumeId}/versions/upload`,
          buildPdf(SAMPLE_RESUME_LINES),
          'v2.pdf',
        )
        .expect(201);
      await parsing.drain();
      await user
        .patch(
          `/resumes/${angular.resumeId}/versions/${v2.body.id}/extracted-data`,
          ANGULAR_CONTENT,
        )
        .expect(200);
      await user.post(`/resumes/${angular.resumeId}/versions/${v2.body.id}/activate`).expect(200);

      const detail = (await user.get(`/applications/${created.id}`).expect(200)).body;
      expect(detail.resumeUsed).toMatchObject({
        resumeVersionId: angular.versionId,
        versionNumber: 1,
        newerVersionExists: true,
      });
      expect(
        (await prisma.application.findUniqueOrThrow({ where: { id: created.id } })).resumeVersionId,
      ).toBe(angular.versionId);
      // The version's own content is still retrievable.
      await user.get(`/resumes/${angular.resumeId}/versions/${angular.versionId}`).expect(200);

      const del = await user.delete(`/resumes/${angular.resumeId}`).expect(409);
      expect(del.body).toMatchObject({
        code: 'RESUME_IN_USE',
        message: expect.stringMatching(/used for 1 application/),
      });
      await user.post(`/resumes/${angular.resumeId}/archive`).expect(200);
      expect(
        (await user.get(`/applications/${created.id}`).expect(200)).body.resumeUsed.versionNumber,
      ).toBe(1);

      const delJob = await user.delete(`/jobs/${jobId}`).expect(409);
      expect(delJob.body.code).toBe('JOB_HAS_APPLICATIONS');
    });
  });

  describe('notes, documents and timeline', () => {
    it('creates, edits and deletes notes', async () => {
      const { angular, jobId } = await setup();
      const created = await create({ jobId, resumeVersionId: angular.versionId });
      const note = (
        await user
          .post(`/applications/${created.id}/notes`, {
            body: '  Recruiter contacted me on LinkedIn.  ',
          })
          .expect(201)
      ).body;
      expect(note.body).toBe('Recruiter contacted me on LinkedIn.');
      await user.post(`/applications/${created.id}/notes`, { body: '   ' }).expect(400);
      const edited = await user
        .patch(`/applications/${created.id}/notes/${note.id}`, { body: 'HR will reply next week.' })
        .expect(200);
      expect(edited.body.body).toBe('HR will reply next week.');
      expect((await user.get(`/applications/${created.id}/notes`).expect(200)).body).toHaveLength(
        1,
      );
      await user.delete(`/applications/${created.id}/notes/${note.id}`).expect(204);
      await user.delete(`/applications/${created.id}/notes/${note.id}`).expect(404);
      const actions = (
        await prisma.auditLog.findMany({ where: { action: { startsWith: 'application.note' } } })
      ).map((a) => a.action);
      expect(actions.sort()).toEqual([
        'application.note_created',
        'application.note_deleted',
        'application.note_updated',
      ]);
    });

    it('stores application documents separately from the resume and serves them safely', async () => {
      const { angular, jobId } = await setup();
      const created = await create({ jobId, resumeVersionId: angular.versionId });
      const pdf = buildPdf(['Dear hiring team,', 'I am excited to apply.']);
      const doc = (
        await user
          .upload(`/applications/${created.id}/documents`, pdf, '../Cover "Letter".pdf', {
            type: 'COVER_LETTER',
          })
          .expect(201)
      ).body;
      expect(doc).toMatchObject({
        type: 'COVER_LETTER',
        name: 'Cover Letter',
        originalFilename: 'Cover Letter.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
      });
      expect(JSON.stringify(doc)).not.toMatch(/storageKey|users\//);

      const file = await user
        .get(`/applications/${created.id}/documents/${doc.id}/file`)
        .buffer(true)
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, pdf)).toBe(0);
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['content-disposition']).toMatch(
        /^attachment; filename="Cover Letter\.pdf"/,
      );

      await user
        .upload(`/applications/${created.id}/documents`, Buffer.from('plain text'), 'notes.txt', {
          type: 'OTHER',
        })
        .expect(415);
      await user
        .upload(`/applications/${created.id}/documents`, pdf, 'x.pdf', { type: 'SELFIE' })
        .expect(400);

      // The original resume file is untouched.
      const resumeFiles = await prisma.resumeFile.count();
      const row = await prisma.applicationDocument.findUniqueOrThrow({ where: { id: doc.id } });
      expect(row.storageKey).toMatch(
        new RegExp(`^users/${user.userId}/applications/${created.id}/`),
      );
      await user.delete(`/applications/${created.id}/documents/${doc.id}`).expect(204);
      expect(await prisma.applicationDocument.count()).toBe(0);
      expect(await prisma.resumeFile.count()).toBe(resumeFiles);
      await expect(storage.get(row.storageKey)).rejects.toThrow();
    });

    it('builds a timeline from status changes, notes and documents, newest first', async () => {
      const { angular, jobId } = await setup();
      const created = await create({ jobId, resumeVersionId: angular.versionId });
      await user
        .post(`/applications/${created.id}/status`, {
          status: 'APPLIED',
          note: 'Submitted through company website',
        })
        .expect(200);
      await user
        .post(`/applications/${created.id}/notes`, { body: 'Technical assessment received' })
        .expect(201);
      await user
        .upload(`/applications/${created.id}/documents`, buildPdf(['Cover']), 'cover.pdf', {
          type: 'COVER_LETTER',
          name: 'Cover letter',
        })
        .expect(201);

      const timeline = (await user.get(`/applications/${created.id}/timeline`).expect(200)).body;
      expect(timeline.map((e: { kind: string }) => e.kind)).toEqual([
        'DOCUMENT_ADDED',
        'NOTE',
        'STATUS_CHANGED',
        'CREATED',
      ]);
      expect(timeline[3]).toMatchObject({
        kind: 'CREATED',
        status: 'SAVED',
        resumeName: 'Angular Resume',
        versionNumber: 1,
      });
      expect(timeline[2]).toMatchObject({
        fromStatus: 'SAVED',
        toStatus: 'APPLIED',
        note: 'Submitted through company website',
      });
      expect(timeline[1]).toMatchObject({ body: 'Technical assessment received', edited: false });
    });
  });

  describe('list, archive and dashboard', () => {
    it('lists with search, status/date filters and sorting; archives before permanent deletion', async () => {
      const { angular, react, jobId } = await setup();
      const second = (
        await user
          .post('/jobs', { ...ANGULAR_JOB, title: 'React Engineer', companyName: 'Beta Labs' })
          .expect(201)
      ).body;
      const a = await create({
        jobId,
        resumeVersionId: angular.versionId,
        status: 'APPLIED',
        appliedAt: '2026-10-01',
      });
      const b = await create({ jobId: second.id, resumeVersionId: react.versionId });
      const ids = (body: { id: string }[]) => body.map((x) => x.id);

      expect(ids((await user.get('/applications').expect(200)).body)).toEqual([b.id, a.id]);
      expect(ids((await user.get('/applications?q=beta').expect(200)).body)).toEqual([b.id]);
      expect(ids((await user.get('/applications?q=angular%20resume').expect(200)).body)).toEqual([
        a.id,
      ]);
      expect(ids((await user.get('/applications?status=APPLIED').expect(200)).body)).toEqual([
        a.id,
      ]);
      expect(
        ids(
          (await user.get('/applications?appliedFrom=2026-09-30&appliedTo=2026-10-01').expect(200))
            .body,
        ),
      ).toEqual([a.id]);
      expect(
        ids((await user.get('/applications?appliedFrom=2026-10-02').expect(200)).body),
      ).toEqual([]);
      expect(ids((await user.get('/applications?sort=title').expect(200)).body)).toEqual([
        a.id,
        b.id,
      ]);
      await user.get('/applications?status=HIRED').expect(400);

      const pipeline = (await user.get('/dashboard/summary').expect(200)).body.applications;
      expect(pipeline).toMatchObject({
        total: 2,
        archived: 0,
        byStatus: expect.objectContaining({ SAVED: 1, APPLIED: 1, INTERVIEW: 0 }),
      });

      expect((await user.delete(`/applications/${b.id}`).expect(409)).body.code).toBe(
        'APPLICATION_NOT_ARCHIVED',
      );
      await user.post(`/applications/${b.id}/archive`).expect(200);
      expect(ids((await user.get('/applications').expect(200)).body)).toEqual([a.id]);
      expect(ids((await user.get('/applications?archived=ARCHIVED').expect(200)).body)).toEqual([
        b.id,
      ]);
      await user.post(`/applications/${b.id}/status`, { status: 'PREPARING' }).expect(409);
      expect((await user.get('/dashboard/summary').expect(200)).body.applications).toMatchObject({
        total: 1,
        archived: 1,
      });
      await user.delete(`/applications/${b.id}`).expect(204);
      expect(await prisma.applicationStatusHistory.count({ where: { applicationId: b.id } })).toBe(
        0,
      );
    });
  });

  describe('isolation', () => {
    it("User B can't see or change User A's applications, notes or documents, nor use A's job or resume", async () => {
      const { angular, jobId } = await setup();
      const created = await create({ jobId, resumeVersionId: angular.versionId });
      const note = (
        await user.post(`/applications/${created.id}/notes`, { body: 'private' }).expect(201)
      ).body;
      const doc = (
        await user
          .upload(`/applications/${created.id}/documents`, buildPdf(['x']), 'c.pdf', {
            type: 'OTHER',
          })
          .expect(201)
      ).body;

      const b = await signUp(app, 'User B');
      const bResume = await createReviewedResume(b, parsing, 'B Resume', REACT_CONTENT);
      const bJob = (await b.post('/jobs', { ...ANGULAR_JOB, title: 'B job' }).expect(201)).body;
      const base = `/applications/${created.id}`;
      for (const call of [
        () => b.get(base),
        () => b.patch(base, { source: 'hijacked' }),
        () => b.delete(base),
        () => b.post(`${base}/status`, { status: 'APPLIED' }),
        () => b.post(`${base}/archive`),
        () => b.post(`${base}/restore`),
        () => b.get(`${base}/timeline`),
        () => b.get(`${base}/notes`),
        () => b.post(`${base}/notes`, { body: 'x' }),
        () => b.patch(`${base}/notes/${note.id}`, { body: 'x' }),
        () => b.delete(`${base}/notes/${note.id}`),
        () => b.get(`${base}/documents`),
        () => b.get(`${base}/documents/${doc.id}/file`),
        () => b.delete(`${base}/documents/${doc.id}`),
        () => b.upload(`${base}/documents`, buildPdf(['x']), 'c.pdf', { type: 'OTHER' }),
        // A's job with B's resume, and B's job with A's resume version.
        () => b.post('/applications', { jobId, resumeVersionId: bResume.versionId }),
        () => b.post('/applications', { jobId: bJob.id, resumeVersionId: angular.versionId }),
      ]) {
        const res = await call();
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toMatch(/private|Angular Resume/);
      }
      // B's note id under B's own application path doesn't reach A's note either.
      const bApp = await create({ jobId: bJob.id, resumeVersionId: bResume.versionId }, b);
      await b.patch(`/applications/${bApp.id}/notes/${note.id}`, { body: 'x' }).expect(404);
      await b.get(`/applications/${bApp.id}/documents/${doc.id}/file`).expect(404);
      expect(
        (await b.get('/applications?archived=ALL').expect(200)).body.map(
          (x: { id: string }) => x.id,
        ),
      ).toEqual([bApp.id]);

      const mine = (await user.get(base).expect(200)).body;
      expect(mine).toMatchObject({ status: 'SAVED', source: null });
      expect((await user.get(`${base}/notes`).expect(200)).body[0].body).toBe('private');
    });
  });
});
