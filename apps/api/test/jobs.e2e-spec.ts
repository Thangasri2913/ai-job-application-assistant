import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import {
  ANGULAR_CONTENT,
  ANGULAR_JOB,
  createReviewedResume,
  REACT_CONTENT,
  REACT_JOB_DESCRIPTION,
} from './support/job-fixtures.js';
import { buildPdf, SAMPLE_RESUME_LINES } from './support/resume-fixtures.js';

describe('Jobs, analysis and resume matching (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let parsing: ParsingDispatcher;
  let analysis: JobAnalysisDispatcher;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    parsing = app.get(ParsingDispatcher);
    analysis = app.get(JobAnalysisDispatcher);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Thanga Sri');
  });

  afterAll(async () => {
    await app.close();
  });

  async function createJob(overrides: Record<string, unknown> = {}, as: TestUser = user) {
    return (await as.post('/jobs', { ...ANGULAR_JOB, ...overrides }).expect(201)).body as {
      id: string;
    };
  }

  /** Starts an analysis and waits for it to finish; returns the job detail. */
  async function analyze(jobId: string, as: TestUser = user) {
    await as.post(`/jobs/${jobId}/analyze`).expect(202);
    await analysis.drain();
    return (await as.get(`/jobs/${jobId}`).expect(200)).body;
  }

  describe('job intake', () => {
    it('requires authentication', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/jobs').expect(401);
      await request(server).post('/api/v1/jobs').send(ANGULAR_JOB).expect(401);
    });

    it('creates a job for the signed-in user and audits it', async () => {
      const res = await user
        .post('/jobs', { ...ANGULAR_JOB, jobUrl: 'https://example.com/jobs/1' })
        .expect(201);
      expect(res.body).toMatchObject({
        title: 'Frontend Developer',
        companyName: 'Example Corp',
        location: 'Chennai',
        source: 'Company website',
        jobUrl: 'https://example.com/jobs/1',
        status: 'ACTIVE',
        analysisStatus: null,
        bestMatch: null,
        latestAnalysis: null,
        recommendation: null,
        selectedResume: null,
      });
      const row = await prisma.job.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.userId).toBe(user.userId);
      expect(row.normalizedDescription).toContain(
        '- Build and maintain frontend applications in Angular',
      );
      expect(
        await prisma.auditLog.count({ where: { action: 'job.created', userId: user.userId } }),
      ).toBe(1);
    });

    it('validates input with useful messages', async () => {
      const short = await user
        .post('/jobs', { ...ANGULAR_JOB, description: 'React dev wanted.' })
        .expect(400);
      expect(JSON.stringify(short.body.details)).toMatch(/Paste the full job description/);
      await user.post('/jobs', { ...ANGULAR_JOB, title: '   ' }).expect(400);
      await user.post('/jobs', { ...ANGULAR_JOB, jobUrl: 'javascript:alert(1)' }).expect(400);
      await user.post('/jobs', { ...ANGULAR_JOB, employmentType: 'FOREVER' }).expect(400);
      await user.post('/jobs', { ...ANGULAR_JOB, userId: 'someone-else' }).expect(400);
    });

    it('rejects a duplicate submission and points to the existing job', async () => {
      const job = await createJob();
      const res = await user
        .post('/jobs', {
          ...ANGULAR_JOB,
          title: ' frontend developer ',
          description: `  ${ANGULAR_JOB.description}\n\n`,
        })
        .expect(409);
      expect(res.body).toMatchObject({ code: 'DUPLICATE_JOB', meta: { existingJobId: job.id } });
      // Another user may add the same posting.
      const other = await signUp(app, 'Other');
      await other.post('/jobs', ANGULAR_JOB).expect(201);
    });

    it('lists, searches, sorts, archives and restores jobs', async () => {
      const a = await createJob();
      const b = await createJob({
        title: 'React Engineer',
        companyName: 'Beta Labs',
        description: REACT_JOB_DESCRIPTION,
      });
      const ids = (body: { id: string }[]) => body.map((j) => j.id);
      expect(ids((await user.get('/jobs').expect(200)).body)).toEqual([b.id, a.id]);
      expect(ids((await user.get('/jobs?q=beta').expect(200)).body)).toEqual([b.id]);
      expect(ids((await user.get('/jobs?sort=title').expect(200)).body)).toEqual([a.id, b.id]);
      await user.get('/jobs?sort=random').expect(400);

      await user.post(`/jobs/${a.id}/archive`).expect(200);
      expect(ids((await user.get('/jobs').expect(200)).body)).toEqual([b.id]);
      expect(ids((await user.get('/jobs?status=ARCHIVED').expect(200)).body)).toEqual([a.id]);
      const archived = await user.post(`/jobs/${a.id}/analyze`).expect(409);
      expect(archived.body.code).toBe('JOB_ARCHIVED');
      await user.post(`/jobs/${a.id}/restore`).expect(200);
      expect(ids((await user.get('/jobs').expect(200)).body)).toHaveLength(2);
    });

    it('treats a malformed or unknown id as not found', async () => {
      await user.get('/jobs/not-a-uuid').expect(404);
      await user.get('/jobs/019a0000-0000-7000-8000-000000000000').expect(404);
    });
  });

  describe('analysis and matching', () => {
    it('analyses the job, compares every active reviewed resume and recommends the best', async () => {
      const angular = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const react = await createReviewedResume(user, parsing, 'React Resume', REACT_CONTENT);
      const archived = await createReviewedResume(user, parsing, 'Old Resume', ANGULAR_CONTENT);
      await user.post(`/resumes/${archived.resumeId}/archive`).expect(200);
      // Uploaded but never reviewed: can't be compared, and is reported as such.
      await user
        .upload('/resumes', buildPdf(SAMPLE_RESUME_LINES), 'draft.pdf', { name: 'Draft Resume' })
        .expect(201);
      await parsing.drain();
      await user.post(`/resumes/${react.resumeId}/default`).expect(200);

      const job = await createJob();
      const started = await user.post(`/jobs/${job.id}/analyze`).expect(202);
      expect(started.body).toMatchObject({ status: 'PENDING', analysisId: expect.any(String) });
      // A second request while the first is pending is refused.
      expect((await user.post(`/jobs/${job.id}/analyze`).expect(409)).body.code).toBe(
        'ANALYSIS_IN_PROGRESS',
      );
      await analysis.drain();

      const detail = (await user.get(`/jobs/${job.id}`).expect(200)).body;
      expect(detail.latestAnalysis).toMatchObject({
        status: 'COMPLETED',
        error: null,
        outdated: false,
      });

      const result = (await user.get(`/jobs/${job.id}/analysis`).expect(200)).body;
      const skills = result.requirements.filter((r: { type: string }) => r.type === 'SKILL');
      const imp = (name: string) =>
        skills.find((s: { name: string }) => s.name === name)?.importance;
      expect([imp('Angular'), imp('TypeScript'), imp('RxJS')]).toEqual([
        'REQUIRED',
        'REQUIRED',
        'REQUIRED',
      ]);
      expect([imp('Docker'), imp('AWS')]).toEqual(['PREFERRED', 'PREFERRED']);
      expect(result).toMatchObject({
        aiStatus: 'DISABLED',
        seniority: 'MID',
        analyzerVersion: 'job-analyzer@1',
      });
      expect(
        result.requirements.find((r: { type: string }) => r.type === 'EXPERIENCE'),
      ).toMatchObject({ minYears: 3 });

      const matches = (await user.get(`/jobs/${job.id}/matches`).expect(200)).body;
      expect(matches.resumes.map((m: { resumeName: string }) => m.resumeName)).toEqual([
        'Angular Resume',
        'React Resume',
      ]);
      expect(matches.resumes.map((m: { rank: number }) => m.rank)).toEqual([1, 2]);
      expect(matches.resumes[0].resumeVersionId).toBe(angular.versionId);
      expect(matches.resumes[0].overallScore).toBeGreaterThan(matches.resumes[1].overallScore);
      expect(matches.excluded).toEqual([
        expect.objectContaining({
          resumeName: 'Draft Resume',
          reason: expect.stringMatching(/No reviewed version/),
        }),
      ]);
      expect(
        matches.resumes.some((m: { resumeName: string }) => m.resumeName === 'Old Resume'),
      ).toBe(false);
      expect(matches.profile).toMatchObject({ subjectType: 'PROFILE', resumeVersionId: null });
      expect(matches.weights).toEqual({
        skills: 40,
        experience: 25,
        responsibilities: 15,
        projects: 10,
        education: 5,
        keywords: 5,
      });
      expect(matches.stale).toBe(false);

      // Evidence cites the stored resume content.
      const angularSkill = matches.resumes[0].evidence.skills.find(
        (s: { skill: string }) => s.skill === 'Angular',
      );
      expect(angularSkill).toMatchObject({ status: 'MATCH', location: 'EXPERIENCE' });
      expect(angularSkill.evidence).toContain('Frontend Developer at Acme');
      const aws = matches.resumes[0].evidence.skills.find(
        (s: { skill: string }) => s.skill === 'AWS',
      );
      expect(aws).toMatchObject({
        status: 'MISSING',
        evidence: 'No AWS experience was found in this resume.',
      });
      expect(matches.resumes[1].gaps).toEqual([
        'Required skills not found: Angular, REST APIs, RxJS',
        'Preferred skills not found: AWS, Docker',
        '3 of 3 responsibilities aren’t clearly reflected',
      ]);

      const rec = (await user.get(`/jobs/${job.id}/recommendation`).expect(200)).body;
      expect(rec.recommendation).toMatchObject({
        resumeName: 'Angular Resume',
        resumeVersionId: angular.versionId,
        score: matches.resumes[0].overallScore,
      });
      expect(rec.recommendation.reasons.at(-1)).toMatch(
        /Highest compatibility of the 2 resumes compared/,
      );
      expect(detail.bestMatch).toMatchObject({
        resumeName: 'Angular Resume',
        score: rec.recommendation.score,
      });

      const actions = (
        await prisma.auditLog.findMany({
          where: { userId: user.userId, action: { startsWith: 'job.' } },
        })
      ).map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'job.created',
          'job.analysis_started',
          'job.analysis_completed',
          'job.match_analysis_created',
          'job.resume_recommended',
        ]),
      );
    });

    it('scores deterministically across runs', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      await createReviewedResume(user, parsing, 'React Resume', REACT_CONTENT);
      const job = await createJob();
      await analyze(job.id);
      const first = (await user.get(`/jobs/${job.id}/matches`).expect(200)).body;
      await analyze(job.id);
      const second = (await user.get(`/jobs/${job.id}/matches`).expect(200)).body;
      expect(second.analysisId).not.toBe(first.analysisId);
      const strip = (m: { id: string; createdAt: string }) => ({
        ...m,
        id: undefined,
        createdAt: undefined,
      });
      expect(second.resumes.map(strip)).toEqual(first.resumes.map(strip));
      expect(await prisma.jobAnalysis.count({ where: { jobId: job.id } })).toBe(2);
    });

    it('keeps historical matches on the exact version after a new version, and flags them as stale', async () => {
      const angular = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const job = await createJob();
      await analyze(job.id);
      const before = (await user.get(`/jobs/${job.id}/matches`).expect(200)).body;
      expect(before.resumes[0].resumeVersionId).toBe(angular.versionId);

      // New version v2 of the same resume becomes current.
      const v2 = await user.post(`/resumes/${angular.resumeId}/versions`, {}).expect(201);
      await user
        .patch(
          `/resumes/${angular.resumeId}/versions/${v2.body.id}/extracted-data`,
          ANGULAR_CONTENT,
        )
        .expect(200);
      await user.post(`/resumes/${angular.resumeId}/versions/${v2.body.id}/activate`).expect(200);

      const stale = (await user.get(`/jobs/${job.id}/matches`).expect(200)).body;
      expect(stale.stale).toBe(true);
      expect(stale.resumes[0]).toMatchObject({
        resumeVersionId: angular.versionId,
        versionNumber: 1,
      });

      await analyze(job.id);
      const after = (await user.get(`/jobs/${job.id}/matches`).expect(200)).body;
      expect(after).toMatchObject({ stale: false });
      expect(after.resumes[0]).toMatchObject({ resumeVersionId: v2.body.id, versionNumber: 2 });
      // The old run's match still points at v1.
      const old = await prisma.matchAnalysis.findFirstOrThrow({
        where: { analysisId: before.analysisId, subjectType: 'RESUME_VERSION' },
      });
      expect(old.resumeVersionId).toBe(angular.versionId);
    });

    it('changing the job changes the result', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      await createReviewedResume(user, parsing, 'React Resume', REACT_CONTENT);
      const job = await createJob();
      await analyze(job.id);
      expect(
        (await user.get(`/jobs/${job.id}/recommendation`).expect(200)).body.recommendation
          .resumeName,
      ).toBe('Angular Resume');

      const edited = await user
        .patch(`/jobs/${job.id}`, { title: 'React Engineer', description: REACT_JOB_DESCRIPTION })
        .expect(200);
      expect(edited.body.latestAnalysis.outdated).toBe(true);
      expect((await user.get(`/jobs/${job.id}/analysis`).expect(200)).body.outdated).toBe(true);

      await analyze(job.id);
      const rec = (await user.get(`/jobs/${job.id}/recommendation`).expect(200)).body;
      expect(rec.recommendation.resumeName).toBe('React Resume');
      const skills = (await user.get(`/jobs/${job.id}/analysis`).expect(200)).body.requirements
        .filter((r: { type: string }) => r.type === 'SKILL')
        .map((r: { name: string }) => r.name);
      expect(skills).toEqual(
        expect.arrayContaining(['React', 'TypeScript', 'Node.js', 'Next.js', 'Jest']),
      );
      expect(skills).not.toContain('Angular');
    });

    it('fails clearly when the description has nothing to compare against', async () => {
      const job = await createJob({
        description:
          'Join our wonderful team in a beautiful office. We value kindness, curiosity and good coffee every single day.',
      });
      const detail = await analyze(job.id);
      expect(detail.latestAnalysis).toMatchObject({
        status: 'FAILED',
        error: expect.stringMatching(/couldn’t find any skills/),
      });
      expect((await user.get(`/jobs/${job.id}/matches`).expect(409)).body.code).toBe(
        'ANALYSIS_NOT_AVAILABLE',
      );
      expect(await prisma.auditLog.count({ where: { action: 'job.analysis_failed' } })).toBe(1);
    });

    it('still compares the profile, and explains the missing recommendation, when there are no resumes', async () => {
      await user.post('/profile/skills', { name: 'Angular', category: 'FRONTEND' }).expect(201);
      const job = await createJob();
      await analyze(job.id);
      const matches = (await user.get(`/jobs/${job.id}/matches`).expect(200)).body;
      expect(matches.resumes).toEqual([]);
      const angular = matches.profile.evidence.skills.find(
        (s: { skill: string }) => s.skill === 'Angular',
      );
      expect(angular).toMatchObject({ status: 'MATCH', location: 'SKILLS' });
      expect(angular.evidence).toMatch(/^Your profile lists it in the skills section/);
      const rec = (await user.get(`/jobs/${job.id}/recommendation`).expect(200)).body;
      expect(rec).toEqual({
        recommendation: null,
        reason: expect.stringMatching(/no active resumes/),
      });
    });
  });

  describe('resume choice', () => {
    it('lets the user choose a different resume than the recommended one', async () => {
      const angular = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const react = await createReviewedResume(user, parsing, 'React Resume', REACT_CONTENT);
      const job = await createJob();
      await analyze(job.id);

      const chosen = await user
        .put(`/jobs/${job.id}/selected-resume`, { resumeVersionId: react.versionId })
        .expect(200);
      expect(chosen.body.selectedResume).toMatchObject({
        resumeName: 'React Resume',
        isRecommended: false,
      });
      const recommended = await user
        .put(`/jobs/${job.id}/selected-resume`, { resumeVersionId: angular.versionId })
        .expect(200);
      expect(recommended.body.selectedResume).toMatchObject({
        resumeName: 'Angular Resume',
        isRecommended: true,
      });
      expect((await user.get('/jobs').expect(200)).body[0].selectedResumeName).toBe(
        'Angular Resume',
      );

      await user.post(`/resumes/${react.resumeId}/archive`).expect(200);
      const res = await user
        .put(`/jobs/${job.id}/selected-resume`, { resumeVersionId: react.versionId })
        .expect(409);
      expect(res.body.code).toBe('RESUME_NOT_SELECTABLE');
      await user.put(`/jobs/${job.id}/selected-resume`, { resumeVersionId: 'nope' }).expect(400);

      const cleared = await user.delete(`/jobs/${job.id}/selected-resume`).expect(200);
      expect(cleared.body.selectedResume).toBeNull();
    });

    it('deleting a job removes its analyses and matches but never the resumes', async () => {
      const angular = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const job = await createJob();
      await analyze(job.id);
      await user.delete(`/jobs/${job.id}`).expect(204);
      await user.get(`/jobs/${job.id}`).expect(404);
      expect(await prisma.matchAnalysis.count()).toBe(0);
      expect(await prisma.jobAnalysis.count()).toBe(0);
      await user.get(`/resumes/${angular.resumeId}`).expect(200);
    });
  });

  describe('isolation', () => {
    it("User B can't read, change, analyse or use User A's job, matches or resumes", async () => {
      const angular = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const job = await createJob();
      await analyze(job.id);
      const b = await signUp(app, 'User B');
      const bJob = await createJob({ title: 'B job' }, b);

      for (const call of [
        () => b.get(`/jobs/${job.id}`),
        () => b.patch(`/jobs/${job.id}`, { title: 'hijacked' }),
        () => b.delete(`/jobs/${job.id}`),
        () => b.post(`/jobs/${job.id}/archive`),
        () => b.post(`/jobs/${job.id}/restore`),
        () => b.post(`/jobs/${job.id}/analyze`),
        () => b.get(`/jobs/${job.id}/analysis`),
        () => b.get(`/jobs/${job.id}/matches`),
        () => b.get(`/jobs/${job.id}/recommendation`),
        () => b.put(`/jobs/${job.id}/selected-resume`, { resumeVersionId: angular.versionId }),
        () => b.delete(`/jobs/${job.id}/selected-resume`),
        // B's own job can't point at A's resume version.
        () => b.put(`/jobs/${bJob.id}/selected-resume`, { resumeVersionId: angular.versionId }),
      ]) {
        const res = await call();
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain('Angular Resume');
      }
      expect(
        (await b.get('/jobs?status=ALL').expect(200)).body.map((j: { id: string }) => j.id),
      ).toEqual([bJob.id]);

      // B's analysis never compares A's resumes.
      await analyze(bJob.id, b);
      const bMatches = (await b.get(`/jobs/${bJob.id}/matches`).expect(200)).body;
      expect(bMatches.resumes).toEqual([]);
      expect(
        await prisma.matchAnalysis.count({
          where: { userId: b.userId, resumeVersionId: angular.versionId },
        }),
      ).toBe(0);

      // A's data is untouched.
      const mine = (await user.get(`/jobs/${job.id}`).expect(200)).body;
      expect(mine).toMatchObject({
        title: 'Frontend Developer',
        status: 'ACTIVE',
        selectedResume: null,
      });
    });
  });
});
