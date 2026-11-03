import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type {
  AnalysedJobsResponse,
  InterviewFeedback,
  InterviewPracticeQuestionsResponse,
  InterviewQuestionDetail,
  JobReadinessResponse,
  LearningDashboard,
  ProjectChallengeDetail,
  ProjectChallengesResponse,
} from '@job-assist/shared';
import type { PrismaService } from '../src/database/prisma.service.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { ANGULAR_CONTENT, ANGULAR_JOB, createReviewedResume } from './support/job-fixtures.js';

const Q = 'iq-sql-where-having';
const PROJECT = 'pc-sql-job-search-analytics';
const GOOD =
  'WHERE filters individual rows before they are grouped. HAVING filters groups after aggregation, so it can use COUNT(*), for example HAVING COUNT(*) > 1.';

describe('Learn & Prepare practice and readiness (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Practising learner');
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication for every practice, project and readiness route', async () => {
    const server = app.getHttpServer();
    const calls = [
      () => request(server).get('/api/v1/learning/interview/questions'),
      () => request(server).get(`/api/v1/learning/interview/questions/${Q}`),
      () =>
        request(server)
          .post(`/api/v1/learning/interview/questions/${Q}/attempts`)
          .send({ answer: GOOD }),
      () => request(server).get('/api/v1/learning/projects'),
      () =>
        request(server)
          .put(`/api/v1/learning/projects/${PROJECT}/progress`)
          .send({ status: 'IN_PROGRESS', checkedItemIds: [] }),
      () => request(server).get('/api/v1/learning/jobs'),
      () =>
        request(server)
          .post('/api/v1/learning/job-readiness')
          .send({ jobId: '00000000-0000-7000-8000-000000000000' }),
    ];
    for (const call of calls) await call().expect(401);
  });

  describe('interview practice', () => {
    it('selects questions by skill, course, role and difficulty without revealing the rubric', async () => {
      const all = (await user.get('/learning/interview/questions').expect(200))
        .body as InterviewPracticeQuestionsResponse;
      expect(all.questions.length).toBeGreaterThan(10);
      const json = JSON.stringify(all);
      for (const secret of ['"concepts"', '"patterns"', '"exampleAnswer"'])
        expect(json).not.toContain(secret);

      const sql = (
        await user.get('/learning/interview/questions?skill=sql&difficulty=BEGINNER').expect(200)
      ).body as InterviewPracticeQuestionsResponse;
      expect(sql.questions.map((q) => q.id)).toEqual([Q]);
      expect(sql.questions[0]).toMatchObject({
        skill: { id: 'sql', name: 'SQL' },
        attempts: 0,
        courseIds: expect.arrayContaining(['sql-fundamentals']),
      });

      const course = (
        await user
          .get('/learning/interview/questions?courseId=software-testing-fundamentals')
          .expect(200)
      ).body as InterviewPracticeQuestionsResponse;
      expect(new Set(course.questions.map((q) => q.skill.id))).toEqual(
        new Set(['software-testing', 'test-automation']),
      );

      const role = (await user.get('/learning/interview/questions?role=QA_TESTER').expect(200))
        .body as InterviewPracticeQuestionsResponse;
      expect(
        role.questions.every((q) =>
          ['software-testing', 'test-automation', 'javascript', 'sql', 'rest-apis'].includes(
            q.skill.id,
          ),
        ),
      ).toBe(true);

      await user.get('/learning/interview/questions?difficulty=EXPERT').expect(400);
      await user.get('/learning/interview/questions?courseId=astronaut').expect(404);
      await user.get('/learning/interview/questions/no-such-question').expect(404);
    });

    it('gives structured, labelled feedback and keeps every attempt for review and retry', async () => {
      const weak = (
        await user
          .post(`/learning/interview/questions/${Q}/attempts`, {
            answer: 'They are both SQL keywords.',
          })
          .expect(201)
      ).body as InterviewFeedback;
      expect(weak).toMatchObject({
        attemptNumber: 1,
        source: 'RULES',
        dimensions: { correctness: { score: 0 } },
      });
      expect(weak.missingConcepts.map((c) => c.id)).toEqual([
        'where-rows',
        'having-groups',
        'aggregates',
      ]);
      expect(weak.missingConcepts[0]?.revise).toEqual({
        courseId: 'sql-fundamentals',
        lessonId: 'sql-aggregation',
        lessonTitle: 'GROUP BY and HAVING',
      });
      expect(weak.exampleAnswer.length).toBeGreaterThan(50);
      expect(weak.disclaimer).toMatch(/does not predict how a real interview will go/);

      const good = (
        await user.post(`/learning/interview/questions/${Q}/attempts`, { answer: GOOD }).expect(201)
      ).body as InterviewFeedback;
      expect(good).toMatchObject({
        attemptNumber: 2,
        dimensions: { correctness: { score: 10 } },
        missingConcepts: [],
      });

      const detail = (await user.get(`/learning/interview/questions/${Q}`).expect(200))
        .body as InterviewQuestionDetail;
      expect(detail.question.attempts).toBe(2);
      expect(detail.attempts.map((a) => [a.attemptNumber, a.answer])).toEqual([
        [2, GOOD],
        [1, 'They are both SQL keywords.'],
      ]);
    });

    it('rejects empty, malformed and oversized answers without recording them', async () => {
      const url = `/learning/interview/questions/${Q}/attempts`;
      expect((await user.post(url, { answer: '   ' }).expect(400)).body.code).toBe(
        'VALIDATION_FAILED',
      );
      await user.post(url, {}).expect(400);
      await user.post(url, { answer: 42 }).expect(400);
      await user.post(url, { answer: 'ok', extra: true }).expect(400);
      await user.post(url, { answer: 'x'.repeat(10_001) }).expect(400);
      expect(await prisma.learningInterviewAttempt.count()).toBe(0);
    });
  });

  describe('project challenges', () => {
    it('lists challenges by course and records self-reported progress', async () => {
      const list = (await user.get('/learning/projects?courseId=sql-fundamentals').expect(200))
        .body as ProjectChallengesResponse;
      expect(list.challenges.map((c) => c.id)).toContain(PROJECT);
      expect(list.challenges[0]?.progress).toMatchObject({
        status: 'NOT_STARTED',
        verification: 'SELF_REPORTED',
      });

      const started = (
        await user
          .put(`/learning/projects/${PROJECT}/progress`, {
            status: 'IN_PROGRESS',
            checkedItemIds: ['schema', 'null-handling'],
          })
          .expect(200)
      ).body as ProjectChallengeDetail;
      expect(started.progress).toMatchObject({
        status: 'IN_PROGRESS',
        checkedItemIds: ['schema', 'null-handling'],
        completedAt: null,
      });
      expect(started.progress.startedAt).not.toBeNull();

      // Completion needs every acceptance criterion ticked.
      const early = await user
        .put(`/learning/projects/${PROJECT}/progress`, {
          status: 'COMPLETED',
          checkedItemIds: ['schema'],
        })
        .expect(400);
      expect(early.body.message).toMatch(/acceptance criterion/);

      const all = started.acceptanceCriteria.map((c) => c.id);
      const done = (
        await user
          .put(`/learning/projects/${PROJECT}/progress`, {
            status: 'COMPLETED',
            checkedItemIds: all,
          })
          .expect(200)
      ).body as ProjectChallengeDetail;
      expect(done.progress).toMatchObject({ status: 'COMPLETED', verification: 'SELF_REPORTED' });
      expect(done.progress.startedAt).toBe(started.progress.startedAt);

      // Saving again does not create duplicates or reset dates.
      await user
        .put(`/learning/projects/${PROJECT}/progress`, { status: 'COMPLETED', checkedItemIds: all })
        .expect(200);
      expect(await prisma.learningProjectProgress.count()).toBe(1);
      const reread = (await user.get(`/learning/projects/${PROJECT}`).expect(200))
        .body as ProjectChallengeDetail;
      expect(reread.progress.completedAt).toBe(done.progress.completedAt);
    });

    it('validates progress updates', async () => {
      const url = `/learning/projects/${PROJECT}/progress`;
      await user.put(url, { status: 'VERIFIED', checkedItemIds: [] }).expect(400);
      await user.put(url, { status: 'IN_PROGRESS', checkedItemIds: ['not-an-item'] }).expect(400);
      await user.put(url, { status: 'IN_PROGRESS' }).expect(400);
      await user
        .put('/learning/projects/no-such-challenge/progress', {
          status: 'IN_PROGRESS',
          checkedItemIds: [],
        })
        .expect(404);
      expect(await prisma.learningProjectProgress.count()).toBe(0);
    });
  });

  describe('job readiness', () => {
    it('explains when there are no analysed jobs, and keeps learning available', async () => {
      const jobs = (await user.get('/learning/jobs').expect(200)).body as AnalysedJobsResponse;
      expect(jobs.jobs).toEqual([]);
      const dashboard = (await user.get('/learning/dashboard').expect(200))
        .body as LearningDashboard;
      expect(dashboard.readiness.jobs).toEqual({ analysedJobs: 0, sampleJobsExcluded: 0 });
      expect(dashboard.readiness.nextAction.kind).toBe('START_HERE');
    });

    it('links job skills to the user’s evidence, courses, lessons, projects and interview practice', async () => {
      const job = (await user.post('/jobs', ANGULAR_JOB).expect(201)).body as { id: string };
      await user.post(`/jobs/${job.id}/analyze`).expect(202);
      await app.get(JobAnalysisDispatcher).drain();

      const jobs = (await user.get('/learning/jobs').expect(200)).body as AnalysedJobsResponse;
      expect(jobs.jobs).toMatchObject([
        { id: job.id, title: 'Frontend Developer', isSampleData: false },
      ]);

      // No resume: every catalogued job skill is unknown, nothing invented.
      const noResume = (await user.post('/learning/job-readiness', { jobId: job.id }).expect(200))
        .body as JobReadinessResponse;
      expect(noResume.resume).toBeNull();
      const ts = noResume.skills.find((s) => s.skillId === 'typescript')!;
      expect(ts).toMatchObject({
        importance: 'REQUIRED',
        assessment: { basis: 'UNKNOWN', proficiency: { level: 'UNKNOWN' } },
      });
      expect(ts.courses.map((c) => c.id)).toEqual(expect.arrayContaining(['frontend-developer']));
      expect(noResume.counts.requested).toBe(noResume.skills.length);
      expect(noResume.limitations.join(' ')).toMatch(/not a prediction/);

      // RxJS is not in the skill catalogue: shown, but with no fabricated links.
      const rxjs = noResume.skills.find((s) => s.name.toLowerCase() === 'rxjs');
      expect(rxjs).toMatchObject({
        skillId: null,
        assessment: null,
        courses: [],
        interviewQuestionCount: 0,
      });

      // With a resume and a correction: the same labels as the personalised plan.
      const { versionId } = await createReviewedResume(
        user,
        app.get(ParsingDispatcher),
        'Angular CV',
        ANGULAR_CONTENT,
      );
      const withResume = (
        await user
          .post('/learning/job-readiness', {
            jobId: job.id,
            resumeVersionId: versionId,
            corrections: [{ skillId: 'docker', status: 'HAS_SKILL' }],
          })
          .expect(200)
      ).body as JobReadinessResponse;
      const skill = (id: string) => withResume.skills.find((s) => s.skillId === id);
      expect(skill('typescript')?.assessment).toMatchObject({
        basis: 'RESUME_EVIDENCE',
        evidenceStrength: 'APPLIED',
      });
      expect(skill('angular')?.assessment).toMatchObject({ basis: 'RESUME_EVIDENCE' });
      expect(skill('docker')?.assessment).toMatchObject({ basis: 'USER_CORRECTED' });
      expect(withResume.counts.resumeEvidence).toBeGreaterThan(0);
      expect(skill('typescript')?.lessons.length).toBeGreaterThan(0);
      expect(skill('docker')?.courses.map((c) => c.status)).toEqual(['PLANNED']);
    });

    it('never reads another user’s job or resume', async () => {
      const job = (await user.post('/jobs', ANGULAR_JOB).expect(201)).body as { id: string };
      await user.post(`/jobs/${job.id}/analyze`).expect(202);
      await app.get(JobAnalysisDispatcher).drain();
      const { versionId } = await createReviewedResume(
        user,
        app.get(ParsingDispatcher),
        'Private CV',
        ANGULAR_CONTENT,
      );

      const other = await signUp(app, 'Someone else');
      expect(
        ((await other.get('/learning/jobs').expect(200)).body as AnalysedJobsResponse).jobs,
      ).toEqual([]);
      const res = await other.post('/learning/job-readiness', { jobId: job.id }).expect(404);
      expect(JSON.stringify(res.body)).not.toMatch(/Frontend|Example Corp/);
      // Their own (missing) job with my resume id: still no access.
      const theirJob = (
        await other.post('/jobs', { ...ANGULAR_JOB, companyName: 'Other Co' }).expect(201)
      ).body as { id: string };
      await other.post(`/jobs/${theirJob.id}/analyze`).expect(202);
      await app.get(JobAnalysisDispatcher).drain();
      await other
        .post('/learning/job-readiness', { jobId: theirJob.id, resumeVersionId: versionId })
        .expect(404);
    });

    it('validates the request and needs an analysis', async () => {
      await user.post('/learning/job-readiness', { jobId: 'not-a-uuid' }).expect(400);
      await user
        .post('/learning/job-readiness', { jobId: '00000000-0000-7000-8000-000000000000' })
        .expect(404);
      const job = (await user.post('/jobs', ANGULAR_JOB).expect(201)).body as { id: string };
      expect(
        (await user.post('/learning/job-readiness', { jobId: job.id }).expect(409)).body.code,
      ).toBe('ANALYSIS_NOT_AVAILABLE');
    });
  });

  describe('dashboard and data isolation', () => {
    it('adds projects, interview practice and an explained next action to the dashboard', async () => {
      await user
        .post(`/learning/interview/questions/${Q}/attempts`, {
          answer: 'WHERE filters individual rows.',
        })
        .expect(201);
      await user
        .put(`/learning/projects/${PROJECT}/progress`, {
          status: 'IN_PROGRESS',
          checkedItemIds: ['schema'],
        })
        .expect(200);

      const { readiness } = (await user.get('/learning/dashboard').expect(200))
        .body as LearningDashboard;
      expect(readiness.interview).toMatchObject({ attempts: 1, questionsPractised: 1 });
      expect(readiness.interview.conceptsToRevise.map((c) => c.label)).toEqual(
        expect.arrayContaining(['HAVING filters groups after aggregation']),
      );
      expect(readiness.projects).toEqual([
        expect.objectContaining({
          challengeId: PROJECT,
          status: 'IN_PROGRESS',
          checked: 1,
          total: 5,
        }),
      ]);
      expect(readiness.nextAction).toMatchObject({
        kind: 'CONTINUE_PROJECT',
        href: `/learn/projects/${PROJECT}`,
      });
      expect(readiness.nextAction.reason).toMatch(/1 of 5/);
      expect(readiness).not.toHaveProperty('score');
    });

    it('keeps one user’s attempts and projects invisible and unchangeable to another', async () => {
      await user.post(`/learning/interview/questions/${Q}/attempts`, { answer: GOOD }).expect(201);
      await user
        .put(`/learning/projects/${PROJECT}/progress`, {
          status: 'IN_PROGRESS',
          checkedItemIds: ['schema'],
        })
        .expect(200);

      const other = await signUp(app, 'Other learner');
      const theirQuestion = (await other.get(`/learning/interview/questions/${Q}`).expect(200))
        .body as InterviewQuestionDetail;
      expect(theirQuestion).toMatchObject({ question: { attempts: 0 }, attempts: [] });
      const theirProject = (await other.get(`/learning/projects/${PROJECT}`).expect(200))
        .body as ProjectChallengeDetail;
      expect(theirProject.progress.status).toBe('NOT_STARTED');
      const theirDashboard = (await other.get('/learning/dashboard').expect(200))
        .body as LearningDashboard;
      expect(theirDashboard.readiness).toMatchObject({ projects: [], interview: { attempts: 0 } });

      // Their update creates their own row and leaves mine alone.
      await other
        .put(`/learning/projects/${PROJECT}/progress`, {
          status: 'NOT_STARTED',
          checkedItemIds: [],
        })
        .expect(200);
      const mine = (await user.get(`/learning/projects/${PROJECT}`).expect(200))
        .body as ProjectChallengeDetail;
      expect(mine.progress).toMatchObject({ status: 'IN_PROGRESS', checkedItemIds: ['schema'] });
    });
  });
});
