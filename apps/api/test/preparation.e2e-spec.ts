import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ResumeContent } from '@job-assist/shared';
import mammoth from 'mammoth';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { MockAiProvider } from '../src/modules/ai/providers/mock-ai.provider.js';
import {
  ANSWER_TASK,
  COVER_LETTER_TASK,
  RESUME_TAILORING_TASK,
} from '../src/modules/application-preparation/prompts.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { createReviewedResume, REACT_CONTENT } from './support/job-fixtures.js';

const JOB = {
  title: 'Frontend Developer',
  companyName: 'ABC Technologies',
  description: `We are looking for a Frontend Developer to build SaaS IoT dashboards.

Responsibilities:
- Build interactive dashboards in Angular
- Integrate REST APIs and real-time WebSocket feeds

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
    { name: 'Git', category: 'TOOLS' },
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
        'Maintained the design system documentation',
        'Reviewed pull requests',
        'Developed dashboards for industrial IoT applications using Angular',
      ],
      achievements: [],
      technologies: ['Angular', 'TypeScript', 'RxJS'],
    },
  ],
  educations: [],
  projects: [],
  certifications: [],
  achievements: [],
  languages: [],
  estimatedYearsOfExperience: 4,
};

async function setup(app: NestExpressApplication, as: TestUser, analyze = true) {
  const parsing = app.get(ParsingDispatcher);
  const resume = await createReviewedResume(as, parsing, 'Angular Resume', CONTENT);
  const job = (await as.post('/jobs', JOB).expect(201)).body as { id: string };
  if (analyze) {
    await as.post(`/jobs/${job.id}/analyze`).expect(202);
    await app.get(JobAnalysisDispatcher).drain();
  }
  const application = (
    await as.post('/applications', { jobId: job.id, resumeVersionId: resume.versionId }).expect(201)
  ).body as { id: string };
  return { resume, jobId: job.id, appId: application.id, base: `/applications/${application.id}` };
}

describe('Application preparation (e2e, no AI provider)', () => {
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

  it('requires authentication', async () => {
    const { base } = await setup(app, user);
    await request(app.getHttpServer()).post(`/api/v1${base}/preparation`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1${base}/questions`).expect(401);
  });

  it('starts a preparation tied to the application’s exact resume version', async () => {
    const { base, resume } = await setup(app, user);
    await user.get(`${base}/preparation`).expect(404);
    const prep = (await user.post(`${base}/preparation`).expect(200)).body;
    expect(prep).toMatchObject({
      status: 'NOT_STARTED',
      aiEnabled: false,
      busyOperation: null,
      job: { title: 'Frontend Developer', companyName: 'ABC Technologies' },
      resume: { resumeName: 'Angular Resume', resumeVersionId: resume.versionId, versionNumber: 1 },
      blockers: ['Generate resume suggestions, a cover letter or answers first'],
    });
    expect(prep.match.score).toEqual(expect.any(Number));
    // Idempotent.
    expect((await user.post(`${base}/preparation`).expect(200)).body.id).toBe(prep.id);
    expect(await prisma.auditLog.count({ where: { action: 'preparation.started' } })).toBe(1);
  });

  it('needs the job to be analysed first', async () => {
    const { base } = await setup(app, user, false);
    const res = await user.post(`${base}/preparation/resume-suggestions`).expect(409);
    expect(res.body).toMatchObject({
      code: 'ANALYSIS_NOT_AVAILABLE',
      message: expect.stringMatching(/Analyse the job first/),
    });
  });

  it('suggests without AI, lets the user decide, and never modifies the original version', async () => {
    const { base, resume } = await setup(app, user);
    const versionBefore = (
      await user.get(`/resumes/${resume.resumeId}/versions/${resume.versionId}`).expect(200)
    ).body.content;

    const res = (await user.post(`${base}/preparation/resume-suggestions`).expect(200)).body;
    expect(res.note).toMatch(/AI is not configured/);
    const s = res.suggestions as {
      id: string;
      kind: string;
      section: string;
      jobRequirement: string | null;
      status: string;
      source: string;
    }[];
    expect(s.every((x) => x.source === 'RULES' && x.status === 'PENDING')).toBe(true);
    const bullet = s.find((x) => x.kind === 'REORDER' && x.section === 'EXPERIENCE')!;
    const skills = s.find((x) => x.kind === 'REORDER' && x.section === 'SKILLS')!;
    const docker = s.find((x) => x.jobRequirement === 'Docker')!;
    expect(docker).toMatchObject({ kind: 'GAP' });

    await user
      .patch(`${base}/preparation/resume-suggestions/${bullet.id}`, { action: 'ACCEPT' })
      .expect(200);
    await user
      .patch(`${base}/preparation/resume-suggestions/${skills.id}`, { action: 'REJECT' })
      .expect(200);
    await user
      .patch(`${base}/preparation/resume-suggestions/${docker.id}`, {
        action: 'EDIT',
        text: 'I know Docker',
      })
      .expect(400); // only rewrites
    await user
      .patch(`${base}/preparation/resume-suggestions/${docker.id}`, { action: 'ACCEPT' })
      .expect(200); // acknowledged

    const draft = (await user.get(`${base}/preparation/tailored-resume`).expect(200)).body;
    expect(draft).toMatchObject({
      sourceResumeVersionId: resume.versionId,
      sourceResumeName: 'Angular Resume',
      sourceVersionNumber: 1,
      appliedSuggestionIds: [bullet.id],
    });
    expect(draft.content.experiences[0].responsibilities[0]).toBe(
      'Developed dashboards for industrial IoT applications using Angular',
    );
    expect(draft.content.skills.map((k: { name: string }) => k.name)).toEqual([
      'Git',
      'Angular',
      'TypeScript',
      'RxJS',
    ]); // rejected

    const versionAfter = (
      await user.get(`/resumes/${resume.resumeId}/versions/${resume.versionId}`).expect(200)
    ).body.content;
    expect(versionAfter).toEqual(versionBefore);

    // Regenerating keeps decisions and replaces only undecided suggestions.
    const again = (await user.post(`${base}/preparation/resume-suggestions`).expect(200)).body
      .suggestions as { id: string; status: string }[];
    expect(
      again
        .filter((x) => x.status !== 'PENDING')
        .map((x) => x.id)
        .sort(),
    ).toEqual([bullet.id, skills.id, docker.id].sort());
    expect(again.filter((x) => x.status === 'PENDING').length).toBe(s.length - 3);

    const decisions = [
      'preparation.resume_suggestion_accepted',
      'preparation.resume_suggestion_rejected',
      'preparation.resume_suggestion_edited',
    ];
    const actions = (await prisma.auditLog.findMany({ where: { action: { in: decisions } } })).map(
      (a) => a.action,
    );
    expect(actions.sort()).toEqual([
      'preparation.resume_suggestion_accepted',
      'preparation.resume_suggestion_accepted',
      'preparation.resume_suggestion_rejected',
    ]);
    expect(
      await prisma.auditLog.count({
        where: { action: 'preparation.resume_suggestions_generated' },
      }),
    ).toBe(2);
  });

  it('versions cover letters, keeps edits, and attaches the approved letter as a DOCX document', async () => {
    const { base } = await setup(app, user);
    const v1 = (await user.post(`${base}/preparation/cover-letter`, {}).expect(200)).body.latest;
    expect(v1).toMatchObject({
      versionNumber: 1,
      source: 'TEMPLATE',
      status: 'GENERATED',
      note: expect.stringMatching(/AI is not configured/),
      notClaimed: ['REST APIs', 'WebSockets', 'Docker'],
    });
    expect(v1.text).toContain('Frontend Developer position at ABC Technologies');
    expect(v1.text).not.toMatch(/Docker|REST|WebSocket/);

    const edited = `${v1.text}\n\nP.S. I am available for interviews any weekday.`;
    const afterEdit = (
      await user.patch(`${base}/preparation/cover-letter`, { text: edited }).expect(200)
    ).body.latest;
    expect(afterEdit).toMatchObject({ status: 'EDITED', text: edited, generatedText: v1.text });

    const approved = (await user.post(`${base}/preparation/cover-letter/approve`).expect(200)).body
      .latest;
    expect(approved).toMatchObject({ status: 'APPROVED', documentId: expect.any(String) });
    const docs = (await user.get(`${base}/documents`).expect(200)).body;
    expect(docs).toEqual([
      expect.objectContaining({
        id: approved.documentId,
        type: 'COVER_LETTER',
        name: 'Cover letter v1',
        originalFilename: 'Cover letter v1.docx',
      }),
    ]);
    const file = await user
      .get(`${base}/documents/${approved.documentId}/file`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect((await mammoth.extractRawText({ buffer: file.body as Buffer })).value).toContain(
      'P.S. I am available for interviews any weekday.',
    );

    // Regenerating creates v2 and keeps v1.
    const v2 = (await user.post(`${base}/preparation/cover-letter`, {}).expect(200)).body;
    expect(
      v2.versions.map((v: { versionNumber: number; status: string }) => [
        v.versionNumber,
        v.status,
      ]),
    ).toEqual([
      [2, 'GENERATED'],
      [1, 'APPROVED'],
    ]);
    const manual = (
      await user.post(`${base}/preparation/cover-letter`, { mode: 'MANUAL' }).expect(200)
    ).body.latest;
    expect(manual).toMatchObject({ versionNumber: 3, source: 'MANUAL', text: '' });
    await user.post(`${base}/preparation/cover-letter/approve`).expect(400); // empty
  });

  it('answers questions from verified data only, keeping the user’s answer separate, within limits', async () => {
    const { base } = await setup(app, user);
    const q = (
      await user
        .post(`${base}/questions`, {
          question: 'Describe your experience with Angular. (Maximum 20 words)',
        })
        .expect(201)
    ).body;
    expect(q).toMatchObject({
      questionType: 'EXPERIENCE',
      maxWords: 20,
      maxCharacters: null,
      status: 'PENDING',
      suggestedAnswer: null,
    });

    const generated = (await user.post(`${base}/questions/${q.id}/generate`).expect(200)).body;
    expect(generated).toMatchObject({
      status: 'GENERATED',
      answerSource: 'RULES',
      insufficientInformation: false,
      note: expect.stringMatching(/AI is not configured/),
    });
    expect(generated.suggestedAnswer.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(generated.suggestedAnswer).toMatch(/Angular/);

    const why = (
      await user
        .post(`${base}/questions`, { question: 'Why do you want to work at ABC Technologies?' })
        .expect(201)
    ).body;
    const whyGen = (await user.post(`${base}/questions/${why.id}/generate`).expect(200)).body;
    expect(whyGen).toMatchObject({
      insufficientInformation: true,
      suggestedAnswer: expect.stringMatching(/^I don’t have enough verified information/),
    });
    expect((await user.post(`${base}/questions/${why.id}/approve`).expect(409)).body.code).toBe(
      'ANSWER_REQUIRED',
    );

    const mine = 'ABC builds the kind of IoT dashboards I enjoy working on.';
    const edited = (
      await user.patch(`${base}/questions/${why.id}`, { userAnswer: mine }).expect(200)
    ).body;
    expect(edited).toMatchObject({
      status: 'EDITED',
      userAnswer: mine,
      suggestedAnswer: whyGen.suggestedAnswer,
    });

    await user
      .patch(`${base}/questions/${q.id}`, { userAnswer: 'word '.repeat(25).trim() })
      .expect(200);
    const over = await user.post(`${base}/questions/${q.id}/approve`).expect(400);
    expect(JSON.stringify(over.body)).toMatch(/over the limit \(25 words/);
    await user.patch(`${base}/questions/${q.id}`, { userAnswer: null }).expect(200);
    const approved = (await user.post(`${base}/questions/${q.id}/approve`).expect(200)).body;
    expect(approved).toMatchObject({ status: 'APPROVED', userAnswer: generated.suggestedAnswer });

    // A new suggestion never overwrites the user's answer.
    await user.post(`${base}/questions/${why.id}/approve`).expect(200);
    const regenerated = (await user.post(`${base}/questions/${why.id}/generate`).expect(200)).body;
    expect(regenerated).toMatchObject({ userAnswer: mine, status: 'EDITED', approvedAt: null });
  });

  it('becomes application-ready only after explicit approval, and later changes revoke it', async () => {
    const { base } = await setup(app, user);
    await user.post(`${base}/preparation/cover-letter`, {}).expect(200);
    const q = (
      await user.post(`${base}/questions`, { question: 'When can you start?' }).expect(201)
    ).body;
    await user.patch(`${base}/questions/${q.id}`, { userAnswer: 'In 30 days.' }).expect(200);

    let prep = (await user.get(`${base}/preparation`).expect(200)).body;
    expect(prep.status).toBe('READY');
    expect(prep.blockers).toEqual([
      'Approve cover letter v1',
      '1 application answer still needs approval',
    ]);
    expect((await user.post(`${base}/preparation/approve`).expect(409)).body.code).toBe(
      'PREPARATION_NOT_READY',
    );

    await user.post(`${base}/preparation/cover-letter/approve`).expect(200);
    await user.post(`${base}/questions/${q.id}/approve`).expect(200);
    prep = (await user.get(`${base}/preparation`).expect(200)).body;
    expect(prep).toMatchObject({ status: 'REVIEWED', blockers: [], approvedAt: null });

    prep = (await user.post(`${base}/preparation/approve`).expect(200)).body;
    expect(prep).toMatchObject({ status: 'APPROVED', approvedAt: expect.any(String) });

    await user
      .patch(`${base}/preparation/cover-letter`, { text: `${'Dear Hiring Team, '.repeat(5)}` })
      .expect(200);
    prep = (await user.get(`${base}/preparation`).expect(200)).body;
    expect(prep).toMatchObject({ status: 'READY', approvedAt: null });
  });

  it('refuses concurrent generation and changes to archived applications', async () => {
    const { base, appId } = await setup(app, user);
    await user.post(`${base}/preparation`).expect(200);
    await prisma.applicationPreparation.update({
      where: { applicationId: appId },
      data: { busyOperation: 'cover-letter', busySince: new Date() },
    });
    expect((await user.get(`${base}/preparation`).expect(200)).body.busyOperation).toBe(
      'cover-letter',
    );
    expect((await user.post(`${base}/preparation/resume-suggestions`).expect(409)).body.code).toBe(
      'AI_GENERATION_IN_PROGRESS',
    );
    // A stale claim (e.g. after a crash) is taken over.
    await prisma.applicationPreparation.update({
      where: { applicationId: appId },
      data: { busySince: new Date(Date.now() - 10 * 60 * 1000) },
    });
    await user.post(`${base}/preparation/resume-suggestions`).expect(200);

    await user.post(`${base}/archive`).expect(200);
    expect((await user.post(`${base}/preparation/cover-letter`, {}).expect(409)).body.code).toBe(
      'APPLICATION_ARCHIVED',
    );
    await user.get(`${base}/preparation`).expect(200); // still readable
  });

  it('keeps the application and its preparation on v1 when the resume gets v2', async () => {
    const { base, resume } = await setup(app, user);
    await user.post(`${base}/preparation/resume-suggestions`).expect(200);
    const v2 = await user.post(`/resumes/${resume.resumeId}/versions`, {}).expect(201);
    await user
      .patch(`/resumes/${resume.resumeId}/versions/${v2.body.id}/extracted-data`, CONTENT)
      .expect(200);
    await user.post(`/resumes/${resume.resumeId}/versions/${v2.body.id}/activate`).expect(200);
    expect((await user.get(base).expect(200)).body.resumeUsed).toMatchObject({
      resumeVersionId: resume.versionId,
      newerVersionExists: true,
    });
    expect((await user.get(`${base}/preparation`).expect(200)).body.resume.resumeVersionId).toBe(
      resume.versionId,
    );
    expect(
      (await user.get(`${base}/preparation/tailored-resume`).expect(200)).body
        .sourceResumeVersionId,
    ).toBe(resume.versionId);
  });

  it("User B can't read or use User A's preparation, suggestions, cover letter, questions or documents", async () => {
    const { base } = await setup(app, user);
    const s = (await user.post(`${base}/preparation/resume-suggestions`).expect(200)).body
      .suggestions[0];
    await user.post(`${base}/preparation/cover-letter`, {}).expect(200);
    const q = (
      await user.post(`${base}/questions`, { question: 'When can you start?' }).expect(201)
    ).body;
    const b = await signUp(app, 'User B');
    for (const call of [
      () => b.post(`${base}/preparation`),
      () => b.get(`${base}/preparation`),
      () => b.post(`${base}/preparation/approve`),
      () => b.post(`${base}/preparation/resume-suggestions`),
      () => b.get(`${base}/preparation/resume-suggestions`),
      () => b.patch(`${base}/preparation/resume-suggestions/${s.id}`, { action: 'ACCEPT' }),
      () => b.get(`${base}/preparation/tailored-resume`),
      () => b.post(`${base}/preparation/cover-letter`, {}),
      () => b.get(`${base}/preparation/cover-letter`),
      () => b.patch(`${base}/preparation/cover-letter`, { text: 'hijacked' }),
      () => b.post(`${base}/preparation/cover-letter/approve`),
      () => b.get(`${base}/questions`),
      () => b.post(`${base}/questions`, { question: 'x?x' }),
      () => b.post(`${base}/questions/${q.id}/generate`),
      () => b.patch(`${base}/questions/${q.id}`, { userAnswer: 'x' }),
      () => b.post(`${base}/questions/${q.id}/approve`),
      () => b.delete(`${base}/questions/${q.id}`),
    ]) {
      const res = await call();
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(
        /Angular Resume|Dear Hiring Team|When can you start/,
      );
    }
    expect(
      (await user.get(`${base}/preparation/cover-letter`).expect(200)).body.latest.status,
    ).toBe('GENERATED');
  });
});

describe('Application preparation (e2e, AI provider)', () => {
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

  it('uses only the signed-in user’s data, validates AI output, and records usage', async () => {
    // Another user's distinctive data must never reach this user's prompts.
    const other = await signUp(app, 'Other');
    await createReviewedResume(other, app.get(ParsingDispatcher), 'Other Resume', {
      ...REACT_CONTENT,
      experiences: [{ ...REACT_CONTENT.experiences[0]!, company: 'Zebra Quantum Corp' }],
    });
    const { base, appId, resume } = await setup(app, user);

    provider.respondTo(RESUME_TAILORING_TASK, {
      suggestions: [
        {
          section: 'EXPERIENCE',
          originalText: 'Reviewed pull requests',
          suggestedText: 'Reviewed pull requests for the Angular dashboard codebase',
          reason: 'Ties code review to the Angular work the job asks for',
          jobRequirement: 'Angular',
          confidence: 0.8,
        },
        {
          section: 'EXPERIENCE',
          originalText: 'Reviewed pull requests',
          suggestedText: 'Reviewed pull requests and set up Docker pipelines',
          reason: 'x',
          jobRequirement: 'Docker',
          confidence: 0.4,
        },
      ],
    });
    const res = (await user.post(`${base}/preparation/resume-suggestions`).expect(200)).body;
    const rewrite = res.suggestions.find((s: { source: string }) => s.source === 'AI');
    expect(rewrite).toMatchObject({
      kind: 'REWRITE',
      originalText: 'Reviewed pull requests',
      suggestedText: 'Reviewed pull requests for the Angular dashboard codebase',
      confidence: 0.8,
    });
    expect(res.suggestions.filter((s: { source: string }) => s.source === 'AI')).toHaveLength(1);
    expect(res.note).toMatch(/1 AI suggestion was discarded/);

    const input = provider.requests.find((r) => r.task === RESUME_TAILORING_TASK)!.input;
    expect(input).toContain('Developed dashboards for industrial IoT applications using Angular');
    expect(input).not.toContain('Zebra Quantum Corp');

    await user
      .patch(`${base}/preparation/resume-suggestions/${rewrite.id}`, {
        action: 'EDIT',
        text: 'Reviewed pull requests for our Angular dashboards',
      })
      .expect(200);
    const draft = (await user.get(`${base}/preparation/tailored-resume`).expect(200)).body;
    expect(draft.content.experiences[0].responsibilities).toContain(
      'Reviewed pull requests for our Angular dashboards',
    );
    expect(
      (await user.get(`/resumes/${resume.resumeId}/versions/${resume.versionId}`).expect(200)).body
        .content.experiences[0].responsibilities,
    ).toContain('Reviewed pull requests');

    provider.respondTo(COVER_LETTER_TASK, {
      coverLetter: `Dear Hiring Team,\n\nI am applying for the Frontend Developer role at ABC Technologies. At Acme I developed dashboards for industrial IoT applications using Angular, working with TypeScript and RxJS every day, and I would bring that experience to your team.\n\nRegards,\nThanga Sri`,
      notClaimed: ['Docker'],
    });
    const letter = (await user.post(`${base}/preparation/cover-letter`, {}).expect(200)).body
      .latest;
    expect(letter).toMatchObject({ source: 'AI', note: null, notClaimed: ['Docker'] });

    provider.respondTo(ANSWER_TASK, {
      answer: 'I build Angular dashboards at Acme with TypeScript and RxJS.',
      insufficientInformation: false,
      missingInformation: [],
      assumptions: [],
    });
    const q = (
      await user
        .post(`${base}/questions`, {
          question: 'Describe your Angular experience (max 300 characters)',
        })
        .expect(201)
    ).body;
    expect((await user.post(`${base}/questions/${q.id}/generate`).expect(200)).body).toMatchObject({
      answerSource: 'AI',
      suggestedAnswer: 'I build Angular dashboards at Acme with TypeScript and RxJS.',
    });

    const usage = await prisma.aiUsage.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(usage.map((u) => [u.operation, u.status, u.applicationId])).toEqual([
      [RESUME_TAILORING_TASK, 'SUCCEEDED', appId],
      [COVER_LETTER_TASK, 'SUCCEEDED', appId],
      [ANSWER_TASK, 'SUCCEEDED', appId],
    ]);
  });

  it('falls back to a draft from verified data when the AI output is unsupported', async () => {
    const { base } = await setup(app, user);
    provider.respondTo(COVER_LETTER_TASK, {
      coverLetter: `Dear Hiring Team,\n\nI have 8 years of Docker and Kubernetes experience at Acme, where I developed dashboards for industrial IoT applications using Angular for many clients.\n\nRegards,\nThanga Sri`,
      notClaimed: [],
    });
    const letter = (await user.post(`${base}/preparation/cover-letter`, {}).expect(200)).body
      .latest;
    expect(letter).toMatchObject({
      source: 'TEMPLATE',
      note: expect.stringMatching(/did not pass validation against your data/),
    });
    expect(letter.text).not.toMatch(/Docker|Kubernetes|8 years/);
    expect(await prisma.aiUsage.count({ where: { status: 'INVALID' } })).toBe(1);
  });
});
