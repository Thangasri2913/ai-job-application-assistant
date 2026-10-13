import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { MockAiProvider } from '../src/modules/ai/providers/mock-ai.provider.js';
import { CareerInsightsDispatcher } from '../src/modules/career-intelligence/career-insights-dispatcher.js';
import { INSIGHTS_TASK } from '../src/modules/career-intelligence/insights/insights-ai.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { ANGULAR_CONTENT, ANGULAR_JOB, createReviewedResume } from './support/job-fixtures.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Shared helpers for a test app instance. */
function harness(get: () => { app: NestExpressApplication; prisma: PrismaService }) {
  const parsing = () => get().app.get(ParsingDispatcher);
  const analysis = () => get().app.get(JobAnalysisDispatcher);
  const insights = () => get().app.get(CareerInsightsDispatcher);

  /** An analysed job and an application for it with the given resume version. */
  async function applyTo(user: TestUser, versionId: string, title: string, company: string) {
    const job = (
      await user.post('/jobs', { ...ANGULAR_JOB, title, companyName: company }).expect(201)
    ).body as { id: string };
    await user.post(`/jobs/${job.id}/analyze`).expect(202);
    await analysis().drain();
    const created = await user
      .post('/applications', { jobId: job.id, resumeVersionId: versionId, status: 'APPLIED' })
      .expect(201);
    return { jobId: job.id, applicationId: created.body.id as string };
  }

  const move = (user: TestUser, id: string, status: string, extra: Record<string, unknown> = {}) =>
    user.post(`/applications/${id}/status`, { status, ...extra }).expect(200);

  return { parsing, analysis, insights, applyTo, move };
}

describe('Career intelligence (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let user: TestUser;
  const h = harness(() => ({ app, prisma }));

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Thanga Sri');
  });

  // Finish background work before the next test resets the database.
  afterEach(async () => {
    await h.insights().drain();
    await h.analysis().drain();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication', async () => {
    const server = app.getHttpServer();
    for (const path of ['overview', 'funnel', 'resumes', 'skills', 'roles', 'sources', 'insights'])
      await request(server).get(`/api/v1/career-intelligence/${path}`).expect(401);
    await request(server).post('/api/v1/career-intelligence/insights/refresh').expect(401);
  });

  describe('outcome tracking', () => {
    it('records technical interviews, offers, acceptance and voluntary outcome details', async () => {
      const resume = await createReviewedResume(
        user,
        h.parsing(),
        'Angular Resume',
        ANGULAR_CONTENT,
      );
      const { applicationId: a } = await h.applyTo(
        user,
        resume.versionId,
        'Frontend Developer',
        'Acme',
      );

      await h.move(user, a, 'RECRUITER_SCREEN', { occurredOn: today() });
      await h.move(user, a, 'TECHNICAL_INTERVIEW');
      await h.move(user, a, 'OFFER', { offerDetails: 'Base salary and joining date discussed.' });
      const accepted = (await h.move(user, a, 'ACCEPTED')).body;
      expect(accepted).toMatchObject({
        status: 'ACCEPTED',
        offerDetails: 'Base salary and joining date discussed.',
      });
      // Withdrawing stays possible; going back one step is the API's standard correction.
      expect(accepted.allowedNextStatuses).toEqual(expect.arrayContaining(['WITHDRAWN', 'OFFER']));
      expect(accepted.importantDates.firstInterviewAt).not.toBeNull();
      expect(accepted.importantDates.closedAt).not.toBeNull();

      const timeline = (await user.get(`/applications/${a}/timeline`).expect(200)).body;
      expect(
        timeline.find((e: { toStatus?: string }) => e.toStatus === 'RECRUITER_SCREEN'),
      ).toMatchObject({
        occurredOn: today(),
      });

      const { applicationId: b } = await h.applyTo(
        user,
        resume.versionId,
        'Frontend Developer',
        'Beta',
      );
      const rejected = (
        await h.move(user, b, 'REJECTED', {
          rejectionReason: 'They chose a candidate with React.',
          rejectionCategory: 'SKILLS_MISMATCH',
        })
      ).body;
      expect(rejected).toMatchObject({
        rejectionReason: 'They chose a candidate with React.',
        rejectionCategory: 'SKILLS_MISMATCH',
      });
      await user.patch(`/applications/${b}`, { rejectionCategory: 'POSITION_FILLED' }).expect(200);
    });

    it('validates outcome details', async () => {
      const resume = await createReviewedResume(
        user,
        h.parsing(),
        'Angular Resume',
        ANGULAR_CONTENT,
      );
      const { applicationId: a } = await h.applyTo(
        user,
        resume.versionId,
        'Frontend Developer',
        'Acme',
      );
      const status = (body: object) => user.post(`/applications/${a}/status`, body);
      await status({ status: 'INTERVIEW', rejectionCategory: 'OTHER' }).expect(400);
      await status({ status: 'INTERVIEW', rejectionCategory: 'NOPE' }).expect(400);
      await status({ status: 'INTERVIEW', offerDetails: 'x' }).expect(400);
      await status({ status: 'INTERVIEW', occurredOn: '2999-01-01' }).expect(400);
      await status({ status: 'INTERVIEW', occurredOn: '2000-01-01' }).expect(400); // before applied
      await status({ status: 'ACCEPTED' }).expect(409); // not from APPLIED
      await user.patch(`/applications/${a}`, { rejectionCategory: 'OTHER' }).expect(400);
      await user.patch(`/applications/${a}`, { offerDetails: 'x' }).expect(400);
    });

    it('keeps the historical match score when the job is analysed again', async () => {
      const resume = await createReviewedResume(
        user,
        h.parsing(),
        'Angular Resume',
        ANGULAR_CONTENT,
      );
      const { jobId, applicationId } = await h.applyTo(
        user,
        resume.versionId,
        'Frontend Developer',
        'Acme',
      );
      const before = (await user.get(`/applications/${applicationId}`).expect(200)).body
        .matchScoreAtCreation;
      expect(before).toEqual(expect.any(Number));

      // The job changes (now asks for skills the resume lacks) and is analysed again.
      await user
        .patch(`/jobs/${jobId}`, {
          description: `${ANGULAR_JOB.description}\n- Strong experience with Kubernetes, Go and Terraform`,
        })
        .expect(200);
      await user.post(`/jobs/${jobId}/analyze`).expect(202);
      await h.analysis().drain();
      const job = (await user.get(`/jobs/${jobId}`).expect(200)).body;
      expect(job.recommendation.score).not.toBe(before);

      const after = (await user.get(`/applications/${applicationId}`).expect(200)).body;
      expect(after.matchScoreAtCreation).toBe(before);
      const scores = (await user.get('/career-intelligence/match-scores').expect(200)).body;
      const bucket = scores.buckets.find(
        (b: { min: number; max: number }) => before >= b.min && before <= b.max,
      );
      expect(bucket.applications).toBe(1);
    });
  });

  describe('analytics', () => {
    it('computes the funnel, resume performance and limitations from stored data', async () => {
      const resume = await createReviewedResume(
        user,
        h.parsing(),
        'Angular Resume',
        ANGULAR_CONTENT,
      );
      const a = await h.applyTo(user, resume.versionId, 'Frontend Developer', 'A');
      const b = await h.applyTo(user, resume.versionId, 'Frontend Developer', 'B');
      await h.applyTo(user, resume.versionId, 'Angular Developer', 'C');
      await h.move(user, a.applicationId, 'INTERVIEW');
      await h.move(user, a.applicationId, 'OFFER');
      await h.move(user, b.applicationId, 'REJECTED', { rejectionCategory: 'EXPERIENCE_LEVEL' });
      // A saved, not-yet-submitted application.
      const saved = (await user.post('/jobs', { ...ANGULAR_JOB, companyName: 'D' }).expect(201))
        .body as { id: string };
      await user
        .post('/applications', { jobId: saved.id, resumeVersionId: resume.versionId })
        .expect(201);

      const report = (await user.get('/career-intelligence/overview').expect(200)).body;
      expect(report.totals).toMatchObject({
        tracked: 4,
        submitted: 3,
        notSubmitted: 1,
        inProgress: 2,
        analysedTargetJobs: 3, // the saved-only job was never analysed
      });
      expect(report.totals.outcomes).toMatchObject({
        applications: 3,
        interviews: 1,
        offers: 1,
        rejections: 1,
        responses: 2,
        interviewRate: 0.333,
        offerRate: 0.333,
        interviewToOfferRate: 1,
        reliable: false,
      });
      expect(report.funnel.stages.map((s: { count: number }) => s.count)).toEqual([
        4, 3, 1, 1, 1, 1, 0,
      ]);
      expect(report.funnel.rejectionCategories).toEqual([
        { category: 'EXPERIENCE_LEVEL', count: 1 },
      ]);
      expect(report.resumes).toHaveLength(1);
      expect(report.resumes[0]).toMatchObject({
        resumeName: 'Angular Resume',
        versionNumber: 1,
        isCurrent: true,
        applications: 3,
        interviews: 1,
        jobsMatched: 3,
      });
      expect(
        report.breakdowns.role.map((r: { label: string; applications: number }) => [
          r.label,
          r.applications,
        ]),
      ).toEqual([
        ['Frontend Developer', 2],
        ['Angular Developer', 1],
      ]);
      expect(report.limitations.sufficientForPatterns).toBe(false);
      expect(report.limitations.messages[0]).toMatch(
        /You have 3 submitted applications\. At least 10/,
      );
      expect(report.patterns.some((p: { kind: string }) => p.kind === 'STRONGEST_ROLE')).toBe(
        false,
      );
      expect(report.skills.map((s: { skill: string }) => s.skill)).toEqual(
        expect.arrayContaining(['Angular', 'TypeScript', 'RxJS']),
      );

      // Slices return the same numbers.
      expect((await user.get('/career-intelligence/funnel').expect(200)).body.totals).toEqual(
        report.totals,
      );
      expect((await user.get('/career-intelligence/roles').expect(200)).body).toEqual(
        report.breakdowns.role,
      );
      expect((await user.get('/career-intelligence/resumes').expect(200)).body).toEqual(
        report.resumes,
      );
    });

    it('shows empty analytics for a new user without inventing rates', async () => {
      const report = (await user.get('/career-intelligence/overview').expect(200)).body;
      expect(report.totals.outcomes.interviewRate).toBeNull();
      expect(report.resumes).toEqual([]);
      expect(report.limitations.messages[0]).toMatch(/haven’t tracked any applications/);
      const insights = (await user.get('/career-intelligence/insights').expect(200)).body;
      expect(insights).toMatchObject({
        run: null,
        insights: [],
        generating: false,
        aiEnabled: false,
      });
    });
  });

  describe('patterns and insights', () => {
    /** 12 submitted applications: Angular roles get more interviews than React roles. */
    async function history(as: TestUser = user) {
      const resume = await createReviewedResume(as, h.parsing(), 'Angular Resume', ANGULAR_CONTENT);
      for (let i = 1; i <= 6; i++) {
        const { applicationId } = await h.applyTo(
          as,
          resume.versionId,
          'Angular Developer',
          `A${i}`,
        );
        if (i <= 3) await h.move(as, applicationId, 'INTERVIEW');
        else await h.move(as, applicationId, 'REJECTED');
      }
      for (let i = 1; i <= 6; i++) {
        const { applicationId } = await h.applyTo(as, resume.versionId, 'React Developer', `R${i}`);
        if (i === 1) await h.move(as, applicationId, 'INTERVIEW');
      }
      return resume;
    }

    it('detects patterns and stores evidence-based rule insights, refreshing only when data changes', async () => {
      await history();
      const report = (await user.get('/career-intelligence/overview').expect(200)).body;
      expect(report.limitations.sufficientForPatterns).toBe(true);
      const role = report.patterns.find((p: { kind: string }) => p.kind === 'STRONGEST_ROLE');
      expect(role.finding).toBe(
        'Angular Developer had a 50% interview rate across 6 applications, compared with 17% across 6 applications in your other roles with enough data.',
      );

      // First read starts a background generation (AI is off: rule-based).
      const first = (await user.get('/career-intelligence/insights').expect(200)).body;
      expect(first.run).not.toBeNull();
      await h.insights().drain();
      const done = (await user.get('/career-intelligence/insights').expect(200)).body;
      expect(done).toMatchObject({ generating: false, stale: false, aiEnabled: false });
      expect(done.run).toMatchObject({ status: 'COMPLETED', source: 'RULES' });
      expect(done.run.note).toMatch(/AI is not configured/);
      const targeting = done.insights.find(
        (i: { category: string }) => i.category === 'TARGETING_RECOMMENDATION',
      );
      expect(targeting).toMatchObject({
        title: 'A role type with stronger response',
        explanation: role.finding,
        source: 'RULES',
        confidence: 'LOW',
      });
      expect(targeting.evidence).toEqual([
        { factId: expect.stringMatching(/^F\d+$/), statement: role.finding, sampleSize: 12 },
      ]);
      for (const i of done.insights) expect(i.evidence.length).toBeGreaterThan(0);
      const runs = await prisma.careerInsightRun.count({ where: { userId: user.userId } });
      expect(runs).toBe(1);

      // Unchanged data: no new run.
      await user.get('/career-intelligence/insights').expect(200);
      expect(await prisma.careerInsightRun.count({ where: { userId: user.userId } })).toBe(1);

      // An outcome changes: the insights are stale and regenerate in the background.
      const app = await prisma.application.findFirstOrThrow({
        where: { userId: user.userId, status: 'APPLIED' },
      });
      await h.move(user, app.id, 'INTERVIEW');
      const stale = (await user.get('/career-intelligence/insights').expect(200)).body;
      expect(stale.run.id).not.toBe(done.run.id); // a new run started for the changed data
      await h.insights().drain();
      expect(await prisma.careerInsightRun.count({ where: { userId: user.userId } })).toBe(2);
      const fresh = (await user.get('/career-intelligence/insights').expect(200)).body;
      expect(fresh).toMatchObject({ stale: false, generating: false });

      const audit = await prisma.auditLog.count({
        where: {
          userId: user.userId,
          action: { in: ['career_insights.requested', 'career_insights.generated'] },
        },
      });
      expect(audit).toBe(4);
    });

    it('refreshes on request, rejecting a second refresh while one runs', async () => {
      const resume = await createReviewedResume(
        user,
        h.parsing(),
        'Angular Resume',
        ANGULAR_CONTENT,
      );
      await h.applyTo(user, resume.versionId, 'Frontend Developer', 'Acme');
      await user.get('/career-intelligence/insights').expect(200);
      await h.insights().drain();

      const before = await prisma.careerInsightRun.count({ where: { userId: user.userId } });
      const refreshed = (await user.post('/career-intelligence/insights/refresh').expect(202)).body;
      expect(refreshed.run).not.toBeNull();
      await h.insights().drain();
      // A manual refresh regenerates even unchanged data.
      expect(await prisma.careerInsightRun.count({ where: { userId: user.userId } })).toBe(
        before + 1,
      );

      // While a run is in progress, another refresh is refused.
      const running = await prisma.careerInsightRun.create({
        data: {
          userId: user.userId,
          trigger: 'MANUAL',
          status: 'RUNNING',
          dataFingerprint: 'x'.repeat(64),
          analyticsVersion: 'test',
        },
      });
      const conflict = await user.post('/career-intelligence/insights/refresh').expect(409);
      expect(conflict.body.code).toBe('INSIGHTS_IN_PROGRESS');
      // An abandoned run (no progress for a long time) doesn't block a new one.
      await prisma.$executeRaw`UPDATE career_insight_runs SET updated_at = now() - interval '1 hour' WHERE id = ${running.id}::uuid`;
      await user.post('/career-intelligence/insights/refresh').expect(202);
      await h.insights().drain();
      expect(
        await prisma.careerInsightRun.findUniqueOrThrow({ where: { id: running.id } }),
      ).toMatchObject({
        status: 'FAILED',
        error: 'The generation was interrupted.',
      });
      const after = (await user.get('/career-intelligence/insights').expect(200)).body;
      // Few applications: the rules explain the limitation instead of comparing.
      expect(after.insights.map((i: { category: string }) => i.category)).toContain(
        'RECOMMENDATION',
      );
      expect(
        after.insights.find((i: { category: string }) => i.category === 'RECOMMENDATION').title,
      ).toBe('Record outcomes to unlock patterns');
    });

    it("never exposes another user's analytics or insights", async () => {
      await history();
      await user.get('/career-intelligence/insights').expect(200);
      await h.insights().drain();

      const other = await signUp(app, 'Other User');
      const report = (await other.get('/career-intelligence/overview').expect(200)).body;
      expect(report.totals).toMatchObject({ tracked: 0, submitted: 0, analysedTargetJobs: 0 });
      expect(report.resumes).toEqual([]);
      expect(report.breakdowns.role).toEqual([]);
      const insights = (await other.get('/career-intelligence/insights').expect(200)).body;
      expect(insights).toMatchObject({ run: null, insights: [] });
      await other.post('/career-intelligence/insights/refresh').expect(202);
      await h.insights().drain();
      // The other user's own run covers only their (empty) data.
      const theirs = await prisma.careerInsight.findMany({ where: { userId: other.userId } });
      expect(theirs.every((i) => !i.explanation.includes('Angular'))).toBe(true);
      const mine = await prisma.careerInsight.count({ where: { userId: user.userId } });
      expect(mine).toBeGreaterThan(0);
    });
  });
});

describe('Career insights with an AI provider (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let user: TestUser;
  const provider = new MockAiProvider();
  const h = harness(() => ({ app, prisma }));

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ aiProvider: provider }));
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Thanga Sri');
    const resume = await createReviewedResume(user, h.parsing(), 'Angular Resume', ANGULAR_CONTENT);
    await h.applyTo(user, resume.versionId, 'Frontend Developer', 'Acme');
  });

  afterEach(async () => {
    await h.insights().drain();
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores validated AI insights whose evidence is the computed facts', async () => {
    provider.respondTo(INSIGHTS_TASK, {
      insights: [
        {
          category: 'RECOMMENDATION',
          title: 'Keep recording your outcomes',
          explanation:
            'You have 1 submitted application so far, so no patterns can be compared yet.',
          recommendedAction: 'Update each application as you hear back.',
          factIds: ['F1', 'F2'],
          confidence: 'HIGH',
        },
      ],
    });
    await user.post('/career-intelligence/insights/refresh').expect(202);
    await h.insights().drain();
    const res = (await user.get('/career-intelligence/insights').expect(200)).body;
    expect(res.run).toMatchObject({ status: 'COMPLETED', source: 'AI', note: null });
    expect(res.aiEnabled).toBe(true);
    expect(res.insights).toHaveLength(1);
    expect(res.insights[0]).toMatchObject({ source: 'AI', title: 'Keep recording your outcomes' });
    expect(res.insights[0].evidence.map((e: { statement: string }) => e.statement)).toEqual([
      expect.stringMatching(/^You have 1 submitted application:/),
      expect.stringMatching(/^You have 1 submitted application; at least 10/),
    ]);
    const prompt = provider.requests.at(-1)!.input;
    expect(prompt).not.toContain(user.email);
    const usage = await prisma.aiUsage.findFirstOrThrow({ where: { userId: user.userId } });
    expect(usage).toMatchObject({ operation: INSIGHTS_TASK, status: 'SUCCEEDED' });
  });

  it('discards invented evidence and falls back to rule-based insights', async () => {
    provider.respondTo(INSIGHTS_TASK, {
      insights: [
        {
          category: 'STRENGTH',
          title: 'You are highly experienced in React',
          explanation: 'Your 14 React projects make you a strong candidate.',
          recommendedAction: 'Apply to senior React roles.',
          factIds: ['F1'],
          confidence: 'HIGH',
        },
      ],
    });
    await user.post('/career-intelligence/insights/refresh').expect(202);
    await h.insights().drain();
    const res = (await user.get('/career-intelligence/insights').expect(200)).body;
    expect(res.run.source).toBe('RULES');
    expect(res.run.note).toBe(
      'The AI output did not pass validation and was discarded. Showing rule-based insights instead.',
    );
    expect(res.insights.every((i: { source: string }) => i.source === 'RULES')).toBe(true);
    expect(JSON.stringify(res.insights)).not.toMatch(/highly experienced/);
    const usage = await prisma.aiUsage.findFirstOrThrow({ where: { userId: user.userId } });
    expect(usage).toMatchObject({ status: 'INVALID', attempts: 2 });
  });
});
