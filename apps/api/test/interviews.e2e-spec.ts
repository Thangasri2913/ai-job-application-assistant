import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ResumeContent } from '@job-assist/shared';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { MockAiProvider } from '../src/modules/ai/providers/mock-ai.provider.js';
import { EVALUATE_TASK, QUESTIONS_TASK, REPORT_TASK } from '../src/modules/interviews/prompts.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { createReviewedResume } from './support/job-fixtures.js';

const JOB = {
  title: 'Frontend Developer',
  companyName: 'ABC Technologies',
  description: `We are looking for a Frontend Developer to build IoT dashboards.

Responsibilities:
- Build interactive dashboards in Angular
- Integrate REST APIs

Requirements:
- 3+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS
- Experience with Docker`,
};

const CONTENT: ResumeContent = {
  contact: {
    fullName: 'Thanga Sri',
    email: null,
    phone: null,
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
  },
  headline: 'Frontend Developer',
  summary: null,
  skills: [
    { name: 'Angular', category: 'FRONTEND' },
    { name: 'TypeScript', category: 'FRONTEND' },
    { name: 'RxJS', category: 'FRONTEND' },
  ],
  experiences: [
    {
      company: 'Acme',
      jobTitle: 'Frontend Developer',
      location: null,
      startDate: '2022-01-01',
      endDate: null,
      isCurrent: true,
      responsibilities: [
        'Developed dashboards for industrial IoT applications using Angular',
        'Integrated REST APIs for device data',
      ],
      achievements: [],
      technologies: ['Angular', 'TypeScript', 'RxJS', 'REST APIs'],
    },
  ],
  educations: [],
  projects: [],
  certifications: [],
  achievements: [],
  languages: [],
  estimatedYearsOfExperience: 4,
};

const GOOD_ANSWER = `At Acme I built dashboards for industrial IoT devices in Angular.
For example, I switched heavy components to OnPush change detection and used RxJS to stream device data.

As a result the dashboards stayed responsive.`;

async function setup(app: NestExpressApplication, as: TestUser) {
  const resume = await createReviewedResume(
    as,
    app.get(ParsingDispatcher),
    'Angular Resume',
    CONTENT,
  );
  const job = (await as.post('/jobs', JOB).expect(201)).body as { id: string };
  await as.post(`/jobs/${job.id}/analyze`).expect(202);
  await app.get(JobAnalysisDispatcher).drain();
  const application = (
    await as.post('/applications', { jobId: job.id, resumeVersionId: resume.versionId }).expect(201)
  ).body as { id: string };
  return { resume, jobId: job.id, appId: application.id };
}

type Detail = {
  id: string;
  status: string;
  currentIndex: number;
  questionsSource: string | null;
  questionsNote: string | null;
  questions: {
    id: string;
    order: number;
    question: string;
    category: string;
    expectedTopics: string[];
    rationale: string | null;
    source: string;
    answers: {
      id: string;
      attempt: number;
      answer: string;
      evaluation: { source: string; overallScore: number; note: string | null } | null;
    }[];
  }[];
};

describe('Interviews (e2e, no AI provider)', () => {
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

  async function newSession(appId: string, body: Record<string, unknown>) {
    const created = (await user.post(`/applications/${appId}/interviews`, body).expect(201))
      .body as Detail;
    return (await user.post(`/interviews/${created.id}/questions/generate`).expect(200))
      .body as Detail;
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/interviews').expect(401);
  });

  it('creates a session that keeps the exact application, job and resume version', async () => {
    const { appId, jobId, resume } = await setup(app, user);
    const created = (
      await user.post(`/applications/${appId}/interviews`, { type: 'TECHNICAL' }).expect(201)
    ).body;
    expect(created).toMatchObject({
      type: 'TECHNICAL',
      focus: 'TECHNICAL',
      difficulty: 'MEDIUM',
      questionCount: 10,
      status: 'CREATED',
      isMock: false,
      job: { id: jobId, title: 'Frontend Developer', companyName: 'ABC Technologies' },
      resume: { resumeName: 'Angular Resume', resumeVersionId: resume.versionId, versionNumber: 1 },
      questions: [],
    });
    const row = await prisma.interviewSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(row).toMatchObject({
      userId: user.userId,
      applicationId: appId,
      jobId,
      resumeVersionId: resume.versionId,
    });
    await user.post(`/applications/${appId}/interviews`, { type: 'PODCAST' }).expect(400);
    await user
      .post(`/applications/${appId}/interviews`, { type: 'MOCK_INTERVIEW', questionCount: 7 })
      .expect(400);

    const focus = (await user.get(`/applications/${appId}/interview-focus`).expect(200)).body;
    expect(focus).toMatchObject({
      strengths: expect.arrayContaining(['Angular', 'TypeScript', 'RxJS']),
      gaps: ['Docker'],
      aiEnabled: false,
    });
    expect(focus.responsibilities).toContain('Build interactive dashboards in Angular');
  });

  it('practice: generates questions once, keeps answers unchanged and stores evaluations separately', async () => {
    const { appId } = await setup(app, user);
    const s = await newSession(appId, { type: 'TECHNICAL' });
    expect(s.questions).toHaveLength(10);
    expect(s).toMatchObject({
      questionsSource: 'RULES',
      questionsNote: expect.stringMatching(/AI is not configured/),
    });
    expect(new Set(s.questions.map((q) => q.question)).size).toBe(10);
    expect(s.questions.find((q) => q.question.includes('Docker'))?.question).toMatch(
      /^The role requires Docker\. What is your experience/,
    );
    // Generated once: a second call returns the same questions.
    const again = (await user.post(`/interviews/${s.id}/questions/generate`).expect(200))
      .body as Detail;
    expect(again.questions.map((q) => q.id)).toEqual(s.questions.map((q) => q.id));

    const q = s.questions.find((x) => x.question.includes('Angular application'))!;
    await user
      .post(`/interviews/${s.id}/questions/${q.id}/answer`, { answer: GOOD_ANSWER })
      .expect(409); // not started
    await user.post(`/interviews/${s.id}/start`).expect(200);
    const answered = (
      await user
        .post(`/interviews/${s.id}/questions/${q.id}/answer`, { answer: `  ${GOOD_ANSWER}  ` })
        .expect(200)
    ).body as Detail;
    const a1 = answered.questions.find((x) => x.id === q.id)!.answers[0]!;
    expect(a1).toMatchObject({ attempt: 1, answer: GOOD_ANSWER, evaluation: null });

    const evaluated = (
      await user.post(`/interviews/${s.id}/questions/${q.id}/evaluate`).expect(200)
    ).body as Detail;
    const ev = evaluated.questions.find((x) => x.id === q.id)!.answers[0]!.evaluation!;
    expect(ev).toMatchObject({
      source: 'RULES',
      note: expect.stringMatching(/Technical accuracy is not assessed/),
    });
    expect(ev.overallScore).toBeGreaterThan(5);
    expect((await prisma.interviewAnswer.findUniqueOrThrow({ where: { id: a1.id } })).answer).toBe(
      GOOD_ANSWER,
    );

    // A second answer is a new attempt; the first answer and its evaluation stay as they were.
    const second = (
      await user
        .post(`/interviews/${s.id}/questions/${q.id}/answer`, { answer: 'Basically many things.' })
        .expect(200)
    ).body as Detail;
    const answers = second.questions.find((x) => x.id === q.id)!.answers;
    expect(answers.map((a) => [a.attempt, a.answer, a.evaluation?.overallScore ?? null])).toEqual([
      [1, GOOD_ANSWER, ev.overallScore],
      [2, 'Basically many things.', null],
    ]);
    await user
      .patch(`/interviews/${s.id}/questions/${q.id}/answer`, { answer: 'changed' })
      .expect(404); // no way to edit
    await user.post(`/interviews/${s.id}/questions/${q.id}/answer`, { answer: '   ' }).expect(400);

    const actions = (
      await prisma.auditLog.findMany({
        where: {
          action: {
            in: [
              'interview.session_created',
              'interview.questions_generated',
              'interview.started',
              'interview.answer_submitted',
              'interview.answer_evaluated',
            ],
          },
        },
      })
    ).map((a) => a.action);
    expect(actions.sort()).toEqual([
      'interview.answer_evaluated',
      'interview.answer_submitted',
      'interview.answer_submitted',
      'interview.questions_generated',
      'interview.session_created',
      'interview.started',
    ]);
    expect(
      JSON.stringify(
        await prisma.auditLog.findMany({ where: { action: 'interview.answer_submitted' } }),
      ),
    ).not.toContain('Acme');
  });

  it('mock interview: in order, feedback hidden until the end, then a stored report; closed afterwards', async () => {
    const { appId } = await setup(app, user);
    const s = await newSession(appId, {
      type: 'MOCK_INTERVIEW',
      questionCount: 5,
      difficulty: 'EASY',
      focus: 'MIXED',
    });
    expect(s).toMatchObject({ isMock: true, currentIndex: 0 });
    expect(s.questions).toHaveLength(5);
    expect(s.questions.every((q) => q.expectedTopics.length === 0 && q.rationale === null)).toBe(
      true,
    ); // hidden during the mock
    await user.post(`/interviews/${s.id}/start`).expect(200);
    const [q1, q2] = s.questions;
    expect(
      (
        await user
          .post(`/interviews/${s.id}/questions/${q2!.id}/answer`, { answer: 'x' })
          .expect(409)
      ).body.code,
    ).toBe('ANSWER_OUT_OF_ORDER');
    await user
      .post(`/interviews/${s.id}/questions/${q1!.id}/answer`, { answer: GOOD_ANSWER })
      .expect(200);
    expect(
      (
        await user
          .post(`/interviews/${s.id}/questions/${q1!.id}/answer`, { answer: 'again' })
          .expect(409)
      ).body.code,
    ).toBe('ANSWER_EXISTS');
    expect(
      (await user.post(`/interviews/${s.id}/questions/${q1!.id}/evaluate`).expect(409)).body.code,
    ).toBe('EVALUATION_DEFERRED');
    await user.get(`/interviews/${s.id}/report`).expect(409);
    for (const q of s.questions.slice(1, 4))
      await user
        .post(`/interviews/${s.id}/questions/${q.id}/answer`, { answer: GOOD_ANSWER })
        .expect(200);
    const mid = (await user.get(`/interviews/${s.id}`).expect(200)).body as Detail;
    expect(mid.currentIndex).toBe(4);
    expect(mid.questions.flatMap((q) => q.answers).every((a) => a.evaluation === null)).toBe(true);

    // Complete with one question unanswered: it counts as 0.
    const report = (await user.post(`/interviews/${s.id}/complete`).expect(200)).body;
    expect(report).toMatchObject({
      answered: 4,
      total: 5,
      source: 'RULES',
      label: 'Rule-based practice feedback',
      summary: null,
    });
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThanOrEqual(80);
    expect(report.improvements[0]).toBe('1 question was not answered.');
    expect(report.categories.length).toBeGreaterThan(0);

    const done = (await user.get(`/interviews/${s.id}`).expect(200)).body as Detail;
    expect(done.status).toBe('COMPLETED');
    expect(done.questions.slice(0, 4).every((q) => q.answers[0]!.evaluation !== null)).toBe(true);
    expect((await user.get(`/interviews/${s.id}/report`).expect(200)).body).toEqual(report);
    expect((await user.post(`/interviews/${s.id}/start`).expect(409)).body.code).toBe(
      'INTERVIEW_CLOSED',
    );
    await user
      .post(`/interviews/${s.id}/questions/${s.questions[4]!.id}/answer`, { answer: 'late' })
      .expect(409);
    expect((await user.post(`/interviews/${s.id}/complete`).expect(200)).body).toEqual(report); // idempotent
    expect(await prisma.auditLog.count({ where: { action: 'interview.report_generated' } })).toBe(
      1,
    );
  });

  it('refuses to complete without answers, and can be abandoned', async () => {
    const { appId } = await setup(app, user);
    const s = await newSession(appId, { type: 'HR', questionCount: 5 });
    await user.post(`/interviews/${s.id}/start`).expect(200);
    expect((await user.post(`/interviews/${s.id}/complete`).expect(409)).body.code).toBe(
      'NO_ANSWERS',
    );
    expect((await user.post(`/interviews/${s.id}/abandon`).expect(200)).body.status).toBe(
      'ABANDONED',
    );
    await user.post(`/interviews/${s.id}/start`).expect(409);
  });

  it('keeps sessions on the original resume version and lists history across applications', async () => {
    const { appId, resume } = await setup(app, user);
    const s = await newSession(appId, { type: 'BEHAVIORAL', questionCount: 5 });
    const v2 = await user.post(`/resumes/${resume.resumeId}/versions`, {}).expect(201);
    await user
      .patch(`/resumes/${resume.resumeId}/versions/${v2.body.id}/extracted-data`, CONTENT)
      .expect(200);
    await user.post(`/resumes/${resume.resumeId}/versions/${v2.body.id}/activate`).expect(200);
    const after = (await user.get(`/interviews/${s.id}`).expect(200)).body;
    expect(after.resume).toMatchObject({ resumeVersionId: resume.versionId, versionNumber: 1 });
    const history = (await user.get('/interviews').expect(200)).body;
    expect(history.map((h: { id: string; type: string }) => [h.id, h.type])).toEqual([
      [s.id, 'BEHAVIORAL'],
    ]);
    expect((await user.get(`/applications/${appId}/interviews`).expect(200)).body).toHaveLength(1);
  });

  it("User B can't access or use User A's interviews or application", async () => {
    const { appId } = await setup(app, user);
    const s = await newSession(appId, { type: 'TECHNICAL', questionCount: 5 });
    await user.post(`/interviews/${s.id}/start`).expect(200);
    const q = s.questions[0]!;
    await user
      .post(`/interviews/${s.id}/questions/${q.id}/answer`, { answer: GOOD_ANSWER })
      .expect(200);
    const b = await signUp(app, 'User B');
    for (const call of [
      () => b.post(`/applications/${appId}/interviews`, { type: 'TECHNICAL' }),
      () => b.get(`/applications/${appId}/interviews`),
      () => b.get(`/applications/${appId}/interview-focus`),
      () => b.get(`/interviews/${s.id}`),
      () => b.get(`/interviews/${s.id}/questions`),
      () => b.post(`/interviews/${s.id}/questions/generate`),
      () => b.post(`/interviews/${s.id}/start`),
      () => b.post(`/interviews/${s.id}/questions/${q.id}/answer`, { answer: 'x' }),
      () => b.post(`/interviews/${s.id}/questions/${q.id}/evaluate`),
      () => b.post(`/interviews/${s.id}/complete`),
      () => b.post(`/interviews/${s.id}/abandon`),
      () => b.get(`/interviews/${s.id}/report`),
    ]) {
      const res = await call();
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/Acme|Angular Resume/);
    }
    expect((await b.get('/interviews').expect(200)).body).toEqual([]);
    expect(
      (await user.get(`/interviews/${s.id}`).expect(200)).body.questions[0].answers,
    ).toHaveLength(1);
  });
});

describe('Interviews (e2e, AI provider)', () => {
  const provider = new MockAiProvider();
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ aiProvider: provider }));
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    provider.requests.length = 0;
    user = await signUp(app, 'Thanga Sri');
  });
  afterAll(async () => {
    await app.close();
  });

  it('uses validated AI questions and feedback, tops up from rules, and records usage', async () => {
    const { appId } = await setup(app, user);
    const q = (question: string, category = 'TECHNICAL') => ({
      question,
      category,
      difficulty: 'MEDIUM',
      expectedTopics: ['Angular', 'OnPush'],
      rationale: 'Required by the job',
    });
    provider.respondTo(QUESTIONS_TASK, {
      questions: [
        q('How would you optimise change detection in an Angular IoT dashboard?'),
        q('Tell me about your experience with Docker in production.'), // presumes experience → dropped
        q('How have you integrated REST APIs for device data?'),
        q('The role requires Docker. What is your experience with containers?'),
      ],
    });
    const created = (
      await user
        .post(`/applications/${appId}/interviews`, { type: 'TECHNICAL', questionCount: 5 })
        .expect(201)
    ).body;
    const s = (await user.post(`/interviews/${created.id}/questions/generate`).expect(200))
      .body as Detail;
    expect(s.questions.map((x) => x.source)).toEqual(['AI', 'AI', 'AI', 'RULES', 'RULES']);
    expect(
      s.questions.some((x) => x.question.startsWith('Tell me about your experience with Docker')),
    ).toBe(false);
    expect(s.questionsSource).toBe('AI');
    const input = provider.requests.find((r) => r.task === QUESTIONS_TASK)!.input;
    expect(input).toContain('Developed dashboards for industrial IoT applications using Angular');

    provider.respondTo(EVALUATE_TASK, {
      overallScore: 8,
      dimensions: {
        relevance: 9,
        clarity: 8,
        technicalAccuracy: 8,
        structure: 7,
        specificity: 7,
        communication: 8,
        completeness: 7,
      },
      strengths: ['Correctly explains OnPush change detection'],
      improvements: ['Explain when you would not use OnPush'],
      star: null,
      technical: { correctness: 8, depth: 7, tradeOffs: 6, practicalExperience: 8, clarity: 8 },
      feedback: 'A solid, practical answer.',
    });
    await user.post(`/interviews/${s.id}/start`).expect(200);
    await user
      .post(`/interviews/${s.id}/questions/${s.questions[0]!.id}/answer`, { answer: GOOD_ANSWER })
      .expect(200);
    const evaluated = (
      await user.post(`/interviews/${s.id}/questions/${s.questions[0]!.id}/evaluate`).expect(200)
    ).body;
    expect(evaluated.questions[0].answers[0].evaluation).toMatchObject({
      source: 'AI',
      overallScore: 8,
      technical: { tradeOffs: 6 },
      feedback: 'A solid, practical answer.',
      note: null,
    });

    provider.respondTo(REPORT_TASK, {
      summary: 'Strong Angular fundamentals; explain trade-offs more.',
      strengths: ['Practical Angular examples'],
      improvements: ['Discuss trade-offs'],
    });
    const report = (await user.post(`/interviews/${s.id}/complete`).expect(200)).body;
    expect(report).toMatchObject({
      source: 'AI',
      label: 'AI-generated practice feedback',
      summary: 'Strong Angular fundamentals; explain trade-offs more.',
      answered: 1,
      total: 5,
    });

    const usage = (
      await prisma.aiUsage.findMany({
        where: { userId: user.userId },
        orderBy: { createdAt: 'asc' },
      })
    ).map((u) => [u.operation, u.status]);
    expect(usage).toEqual([
      [QUESTIONS_TASK, 'SUCCEEDED'],
      [EVALUATE_TASK, 'SUCCEEDED'],
      [REPORT_TASK, 'SUCCEEDED'],
    ]);
  });
});
