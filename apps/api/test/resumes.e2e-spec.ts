import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/database/prisma.service.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { StorageService } from '../src/modules/storage/storage.service.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { buildDocx, buildPdf, SAMPLE_RESUME_LINES } from './support/resume-fixtures.js';

describe('Resume library (e2e)', () => {
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

  /** Uploads a resume, waits for background parsing, returns the resume detail. */
  async function uploadParsed(file: Buffer, filename: string, fields: Record<string, string> = {}) {
    const res = await user.upload('/resumes', file, filename, fields).expect(201);
    await dispatcher.drain();
    return (await user.get(`/resumes/${res.body.id}`).expect(200)).body;
  }

  /** Reviews (saves parsed content as confirmed) and activates the latest version. */
  async function reviewAndActivate(resumeId: string, versionId: string) {
    const extracted = await user
      .get(`/resumes/${resumeId}/versions/${versionId}/extracted-data`)
      .expect(200);
    await user
      .patch(`/resumes/${resumeId}/versions/${versionId}/extracted-data`, extracted.body.parsed)
      .expect(200);
    return user.post(`/resumes/${resumeId}/versions/${versionId}/activate`).expect(200);
  }

  describe('upload and parsing', () => {
    it('uploads a PDF, stores it, extracts text and parses sections in the background', async () => {
      const res = await user
        .upload('/resumes', buildPdf(SAMPLE_RESUME_LINES), 'Thanga Resume.pdf', {
          tags: 'Angular, Frontend',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Thanga Resume',
        tags: ['Angular', 'Frontend'],
        status: 'ACTIVE',
        isDefault: false,
        versionCount: 1,
      });
      expect(res.body.currentVersion).toBeNull();
      expect(res.body.latestVersion).toMatchObject({
        versionNumber: 1,
        status: 'DRAFT',
        source: 'UPLOAD',
        hasFile: true,
      });

      await dispatcher.drain();
      const versionId = res.body.latestVersion.id;
      const status = await user
        .get(`/resumes/${res.body.id}/versions/${versionId}/parse-status`)
        .expect(200);
      // Extracted, waiting for the user's review.
      expect(status.body.parseStatus).toBe('NEEDS_REVIEW');

      const data = await user
        .get(`/resumes/${res.body.id}/versions/${versionId}/extracted-data`)
        .expect(200);
      expect(data.body.extractedText).toContain('Acme Technologies');
      expect(data.body.parsed.contact).toMatchObject({
        fullName: 'Thanga Sri',
        email: 'thanga.sri@example.com',
      });
      expect(data.body.parsed.skills.map((s: { name: string }) => s.name)).toEqual([
        'Angular',
        'TypeScript',
        'RxJS',
        'Git',
        'Jira',
      ]);
      expect(data.body.parsed.experiences[0]).toMatchObject({
        company: 'Acme Technologies',
        jobTitle: 'Frontend Developer',
        isCurrent: true,
      });
      expect(data.body.ai).toBeNull();
      expect(data.body.confirmed).toBeNull();
      expect(data.body.editable).toBe(true);

      expect(
        await prisma.auditLog.count({ where: { action: 'resume.uploaded', userId: user.userId } }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({ where: { action: 'resume.parsed', userId: user.userId } }),
      ).toBe(1);
    });

    it('uploads and parses a DOCX', async () => {
      const resume = await uploadParsed(await buildDocx(SAMPLE_RESUME_LINES), 'cv.docx');
      const data = await user
        .get(`/resumes/${resume.id}/versions/${resume.latestVersion.id}/extracted-data`)
        .expect(200);
      expect(data.body.parseStatus).toBe('NEEDS_REVIEW');
      expect(data.body.parsed.educations[0]).toMatchObject({
        degree: 'B.Tech',
        fieldOfStudy: 'Computer Science',
        institution: 'Anna University',
      });
    });

    it('marks a text-less PDF as failed with a helpful message', async () => {
      const resume = await uploadParsed(buildPdf([]), 'scan.pdf');
      expect(resume.latestVersion.parseStatus).toBe('FAILED');
      const status = await user
        .get(`/resumes/${resume.id}/versions/${resume.latestVersion.id}/parse-status`)
        .expect(200);
      expect(status.body.parseError).toMatch(/No readable text/);
    });

    it.each([
      [
        'a non-PDF disguised with a .pdf extension',
        Buffer.from('MZ\x90\x00 this is an executable'),
        'resume.pdf',
        415,
        'UNSUPPORTED_FILE_TYPE',
      ],
      ['a PDF renamed to .docx', buildPdf(['x']), 'resume.docx', 415, 'UNSUPPORTED_FILE_TYPE'],
      [
        'a plain-text file',
        Buffer.from('plain text resume'),
        'resume.txt',
        415,
        'UNSUPPORTED_FILE_TYPE',
      ],
      ['an empty file', Buffer.alloc(0), 'resume.pdf', 400, 'FILE_REQUIRED'],
      [
        'a file over the size limit',
        Buffer.concat([buildPdf(['x']), Buffer.alloc(600 * 1024)]),
        'big.pdf',
        413,
        'FILE_TOO_LARGE',
      ],
    ])('rejects %s', async (_label, file, filename, status, code) => {
      const res = await user.upload('/resumes', file, filename).expect(status);
      expect(res.body.code).toBe(code);
      expect(await prisma.resume.count()).toBe(0);
    });

    it('requires a file', async () => {
      const res = await user.post('/resumes', {}).expect(400);
      expect(res.body.code).toBe('FILE_REQUIRED');
    });

    it('audits rejected uploads without storing file contents', async () => {
      await user.upload('/resumes', Buffer.from('not a pdf at all'), 'resume.pdf').expect(415);
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'resume.upload_rejected' },
      });
      expect(log.metadata).toEqual({ reason: 'UNSUPPORTED_FILE_TYPE', sizeBytes: 16 });
    });
  });

  describe('review and versioning', () => {
    it('confirms reviewed content, activates it, then freezes the version', async () => {
      const resume = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'resume.pdf');
      const v1 = resume.latestVersion.id;

      // Activation requires a review first.
      const early = await user.post(`/resumes/${resume.id}/versions/${v1}/activate`).expect(409);
      expect(early.body.code).toBe('VERSION_NOT_READY');

      const extracted = await user
        .get(`/resumes/${resume.id}/versions/${v1}/extracted-data`)
        .expect(200);
      const edited = { ...extracted.body.parsed, summary: 'Edited by the user.' };
      const saved = await user
        .patch(`/resumes/${resume.id}/versions/${v1}/extracted-data`, edited)
        .expect(200);
      expect(saved.body.confirmed.summary).toBe('Edited by the user.');
      // The parser output is preserved separately from the user's edit.
      expect(saved.body.parsed.summary).toContain('3.3 years');

      await user.post(`/resumes/${resume.id}/versions/${v1}/activate`).expect(200);
      const detail = await user.get(`/resumes/${resume.id}`).expect(200);
      expect(detail.body.currentVersion).toMatchObject({ id: v1, status: 'ACTIVE' });

      const frozen = await user
        .patch(`/resumes/${resume.id}/versions/${v1}/extracted-data`, edited)
        .expect(409);
      expect(frozen.body.code).toBe('VERSION_NOT_EDITABLE');
    });

    it('rejects malformed content edits', async () => {
      const resume = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'resume.pdf');
      const res = await user
        .patch(`/resumes/${resume.id}/versions/${resume.latestVersion.id}/extracted-data`, {
          summary: 42,
          skills: 'Angular',
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('creates new versions without overwriting earlier ones', async () => {
      const resume = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'resume.pdf');
      const v1 = resume.latestVersion.id;
      await reviewAndActivate(resume.id, v1);

      // v2: edit draft based on current version
      const v2 = await user
        .post(`/resumes/${resume.id}/versions`, { notes: 'Tighten summary' })
        .expect(201);
      expect(v2.body).toMatchObject({
        versionNumber: 2,
        status: 'DRAFT',
        source: 'MANUAL_EDIT',
        parentVersionId: v1,
        hasFile: true,
      });
      expect(v2.body.content.summary).toContain('3.3 years');
      await user
        .patch(`/resumes/${resume.id}/versions/${v2.body.id}/extracted-data`, {
          ...v2.body.content,
          summary: 'Version two summary.',
        })
        .expect(200);
      await user.post(`/resumes/${resume.id}/versions/${v2.body.id}/activate`).expect(200);

      // v3: new file upload
      const v3 = await user
        .upload(
          `/resumes/${resume.id}/versions/upload`,
          await buildDocx(SAMPLE_RESUME_LINES),
          'new.docx',
        )
        .expect(201);
      expect(v3.body).toMatchObject({
        versionNumber: 3,
        status: 'DRAFT',
        source: 'UPLOAD',
        parseStatus: 'PENDING',
      });
      await dispatcher.drain();

      const versions = await user.get(`/resumes/${resume.id}/versions`).expect(200);
      expect(
        versions.body.map((v: { versionNumber: number; status: string }) => [
          v.versionNumber,
          v.status,
        ]),
      ).toEqual([
        [3, 'DRAFT'],
        [2, 'ACTIVE'],
        [1, 'ARCHIVED'],
      ]);
      const original = await user.get(`/resumes/${resume.id}/versions/${v1}`).expect(200);
      expect(original.body.content.summary).toContain('3.3 years');
      expect((await user.get(`/resumes/${resume.id}`).expect(200)).body.currentVersion.id).toBe(
        v2.body.id,
      );
      // Both later versions (manual edit and new file) are audited as version creations.
      const created = await prisma.auditLog.findMany({
        where: { action: 'resume.version_created', userId: user.userId },
      });
      expect(created.map((a) => (a.metadata as { source: string }).source).sort()).toEqual([
        'MANUAL_EDIT',
        'UPLOAD',
      ]);
    });

    it('downloads the original file with safe headers', async () => {
      const pdf = buildPdf(SAMPLE_RESUME_LINES);
      const resume = await uploadParsed(pdf, '../../etc/My "CV".pdf');
      const res = await user
        .get(`/resumes/${resume.id}/versions/${resume.latestVersion.id}/file`)
        .buffer(true)
        .expect(200);
      expect(Buffer.compare(res.body as Buffer, pdf)).toBe(0);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="My CV\.pdf"/);
    });
  });

  describe('library management', () => {
    it('lists, renames and tags resumes', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf', {
        name: 'Angular Developer',
      });
      await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'b.pdf', { name: 'Full Stack Developer' });

      const updated = await user
        .patch(`/resumes/${a.id}`, {
          name: '  Angular   Developer v2 ',
          tags: ['Angular', 'angular', ' Frontend '],
        })
        .expect(200);
      expect(updated.body).toMatchObject({
        name: 'Angular Developer v2',
        tags: ['Angular', 'Frontend'],
      });

      const list = await user.get('/resumes').expect(200);
      expect(list.body).toHaveLength(2);
      const tagged = await user.get('/resumes?tag=FRONTEND').expect(200);
      expect(tagged.body.map((r: { id: string }) => r.id)).toEqual([a.id]);

      await user.patch(`/resumes/${a.id}`, { name: '' }).expect(400);
      expect(await prisma.auditLog.count({ where: { action: 'resume.updated' } })).toBe(1);
    });

    it('keeps at most one default resume per user', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf');
      const b = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'b.pdf');

      await user.post(`/resumes/${a.id}/default`).expect(200);
      const res = await user.post(`/resumes/${b.id}/default`).expect(200);
      expect(res.body.isDefault).toBe(true);
      expect((await user.get(`/resumes/${a.id}`).expect(200)).body.isDefault).toBe(false);
      expect(await prisma.defaultResume.count({ where: { userId: user.userId } })).toBe(1);

      await user.delete(`/resumes/${b.id}/default`).expect(200);
      expect(await prisma.defaultResume.count()).toBe(0);
    });

    it('searches, filters by category and sorts the library (default first)', async () => {
      const angular = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf', {
        name: 'Angular Developer',
        category: 'Frontend',
      });
      const react = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'b.pdf', {
        name: 'React Developer',
        category: 'frontend',
      });
      const general = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'c.pdf', {
        name: 'General Software Developer',
        category: 'General',
      });
      const ids = (body: { id: string }[]) => body.map((r) => r.id);

      expect(ids((await user.get('/resumes?q=react').expect(200)).body)).toEqual([react.id]);
      expect(ids((await user.get('/resumes?q=GENERAL').expect(200)).body)).toEqual([general.id]);
      expect(
        ids((await user.get('/resumes?category=FRONTEND&sort=name').expect(200)).body),
      ).toEqual([angular.id, react.id]);
      expect(ids((await user.get('/resumes?sort=name').expect(200)).body)).toEqual([
        angular.id,
        general.id,
        react.id,
      ]);
      // Newest first by creation; the default always leads.
      await user.post(`/resumes/${angular.id}/default`).expect(200);
      expect(ids((await user.get('/resumes?sort=created').expect(200)).body)).toEqual([
        angular.id,
        general.id,
        react.id,
      ]);

      await user.get('/resumes?sort=random').expect(400);
      await user.get(`/resumes?q=${'x'.repeat(101)}`).expect(400);
    });

    it('hands the default to the most recently updated active resume when the default is deleted', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf', { name: 'A' });
      const b = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'b.pdf', { name: 'B' });
      const c = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'c.pdf', { name: 'C' });
      await user.post(`/resumes/${c.id}/archive`).expect(200); // archived: never promoted
      await user.patch(`/resumes/${a.id}`, { description: 'touched last' }).expect(200);
      await user.post(`/resumes/${b.id}/default`).expect(200);

      await user.delete(`/resumes/${b.id}`).expect(204);
      expect((await user.get(`/resumes/${a.id}`).expect(200)).body.isDefault).toBe(true);
      expect(
        await prisma.auditLog.count({
          where: {
            action: 'resume.set_as_default',
            metadata: { path: ['reason'], equals: 'previous_default_deleted' },
          },
        }),
      ).toBe(1);

      // Deleting the last active default leaves no default (the archived one is not eligible).
      await user.delete(`/resumes/${a.id}`).expect(204);
      expect(await prisma.defaultResume.count({ where: { userId: user.userId } })).toBe(0);
      expect((await user.get(`/resumes/${c.id}`).expect(200)).body.isDefault).toBe(false);
    });

    it('deleting a non-default resume keeps the current default', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf');
      const b = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'b.pdf');
      await user.post(`/resumes/${a.id}/default`).expect(200);
      await user.delete(`/resumes/${b.id}`).expect(204);
      expect((await user.get(`/resumes/${a.id}`).expect(200)).body.isDefault).toBe(true);
    });

    it('rejects making an archived resume the default', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf');
      await user.post(`/resumes/${a.id}/archive`).expect(200);
      await user.post(`/resumes/${a.id}/default`).expect(409);
      expect(await prisma.defaultResume.count()).toBe(0);
    });

    it('enforces the single-default and same-owner rules in the database itself', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf');
      const other = await signUp(app, 'Other');
      // Pointing another user's default at this user's resume violates the composite FK.
      await expect(
        prisma.defaultResume.create({ data: { userId: other.userId, resumeId: a.id } }),
      ).rejects.toThrow();
    });

    it('archives (clearing default), hides from active list, and restores', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf');
      await user.post(`/resumes/${a.id}/default`).expect(200);

      const archived = await user.post(`/resumes/${a.id}/archive`).expect(200);
      expect(archived.body).toMatchObject({ status: 'ARCHIVED', isDefault: false });
      expect((await user.get('/resumes').expect(200)).body).toEqual([]);
      expect((await user.get('/resumes?status=ARCHIVED').expect(200)).body).toHaveLength(1);

      const blocked = await user.post(`/resumes/${a.id}/default`).expect(409);
      expect(blocked.body.code).toBe('RESUME_ARCHIVED');
      await user.post(`/resumes/${a.id}/versions`, {}).expect(409);
      // Archived data stays readable.
      await user.get(`/resumes/${a.id}/versions/${a.latestVersion.id}/extracted-data`).expect(200);

      const restored = await user.post(`/resumes/${a.id}/restore`).expect(200);
      expect(restored.body.status).toBe('ACTIVE');
    });

    it('duplicates a resume with an independent copy of its file', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf', {
        name: 'Angular Developer',
        tags: 'Angular',
      });
      await reviewAndActivate(a.id, a.latestVersion.id);

      const copy = await user.post(`/resumes/${a.id}/duplicate`, {}).expect(201);
      expect(copy.body).toMatchObject({
        name: 'Copy of Angular Developer',
        tags: ['Angular'],
        versionCount: 1,
      });
      expect(copy.body.currentVersion).toMatchObject({
        status: 'ACTIVE',
        source: 'DUPLICATE',
        hasFile: true,
      });

      const [orig, dup] = await Promise.all([
        prisma.resumeVersion.findFirstOrThrow({
          where: { resumeId: a.id },
          include: { file: true },
        }),
        prisma.resumeVersion.findFirstOrThrow({
          where: { resumeId: copy.body.id },
          include: { file: true },
        }),
      ]);
      expect(dup.file?.storageKey).toBeDefined();
      expect(dup.file?.storageKey).not.toBe(orig.file?.storageKey);
      const [origContent, dupContent] = await Promise.all([
        user.get(`/resumes/${a.id}/versions/${orig.id}`).expect(200),
        user.get(`/resumes/${copy.body.id}/versions/${dup.id}`).expect(200),
      ]);
      expect(dupContent.body.content).toEqual(origContent.body.content);
      expect(dupContent.body.content.skills.length).toBeGreaterThan(0);

      // Deleting the original must not break the copy.
      await user.delete(`/resumes/${a.id}`).expect(204);
      await user
        .get(`/resumes/${copy.body.id}/versions/${copy.body.currentVersion.id}/file`)
        .expect(200);
    });

    it('deletes a resume, its versions and its stored files', async () => {
      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf');
      const version = await prisma.resumeVersion.findFirstOrThrow({
        where: { resumeId: a.id },
        include: { file: true },
      });
      const key = version.file!.storageKey;

      await user.delete(`/resumes/${a.id}`).expect(204);
      await user.get(`/resumes/${a.id}`).expect(404);
      expect(await prisma.resumeVersion.count({ where: { resumeId: a.id } })).toBe(0);
      expect(await prisma.resumeFile.count({ where: { storageKey: key } })).toBe(0);
      await expect(app.get(StorageService).get(key)).rejects.toThrow();
      expect(await prisma.auditLog.count({ where: { action: 'resume.deleted' } })).toBe(1);
    });

    it('creates a resume from the profile using only profile facts', async () => {
      await user
        .put('/profile', {
          fullName: 'Thanga Sri',
          phone: null,
          location: 'Chennai',
          country: null,
          linkedinUrl: null,
          githubUrl: null,
          portfolioUrl: null,
          summary: 'Angular developer.',
          yearsOfExperience: 3.3,
          currentJobTitle: null,
          currentCompany: null,
          noticePeriod: null,
          workAuthorization: null,
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
        })
        .expect(200);
      await user.post('/profile/skills', { name: 'Angular', category: 'FRONTEND' }).expect(201);

      const res = await user
        .post('/resumes/from-profile', { name: 'From profile', tags: ['General'] })
        .expect(201);
      expect(res.body.currentVersion).toMatchObject({
        source: 'PROFILE',
        status: 'ACTIVE',
        hasFile: false,
      });
      const version = await user
        .get(`/resumes/${res.body.id}/versions/${res.body.currentVersion.id}`)
        .expect(200);
      expect(version.body.content).toMatchObject({
        summary: 'Angular developer.',
        skills: [{ name: 'Angular', category: 'FRONTEND' }],
        experiences: [],
        estimatedYearsOfExperience: 3.3,
      });
      expect(version.body.file).toBeNull();
    });

    it('reports real numbers on the dashboard summary', async () => {
      const empty = await user.get('/dashboard/summary').expect(200);
      expect(empty.body.resumes).toEqual({
        total: 0,
        active: 0,
        archived: 0,
        defaultResume: null,
        needsReview: 0,
        latestUpload: null,
        recentlyUpdated: null,
      });

      const a = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'a.pdf', { name: 'Angular' });
      const b = await uploadParsed(buildPdf(SAMPLE_RESUME_LINES), 'b.pdf', { name: 'React' });
      await user.post(`/resumes/${a.id}/default`).expect(200);
      await user.post(`/resumes/${b.id}/archive`).expect(200);

      const res = await user.get('/dashboard/summary').expect(200);
      expect(res.body.resumes).toEqual({
        total: 2,
        active: 1,
        archived: 1,
        defaultResume: { id: a.id, name: 'Angular' },
        // "React" is archived, so only "Angular" counts as awaiting review.
        needsReview: 1,
        latestUpload: { id: b.id, name: 'React', uploadedAt: expect.any(String) },
        // Archived resumes are not "recently updated" library entries.
        recentlyUpdated: { id: a.id, name: 'Angular', updatedAt: expect.any(String) },
      });
      expect(
        res.body.profileCompletion.items.find((i: { key: string }) => i.key === 'RESUME').complete,
      ).toBe(true);
    });
  });
});
