import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { EmployerQuestionsReader } from '../src/modules/smart-apply/employer-questions.js';
import type { InProcessSmartApplyWorker } from '../src/modules/smart-apply/in-process-smart-apply-worker.js';
import { SmartApplyDispatcher } from '../src/modules/smart-apply/smart-apply-dispatcher.js';
import {
  SMART_APPLY_OPTIONS,
  SmartApplyService,
} from '../src/modules/smart-apply/smart-apply.service.js';
import {
  type ReconcileResult,
  SUBMISSION_PROVIDERS,
  SubmissionProvider,
  type SubmissionRequest,
  type SubmissionResult,
  type SubmissionTarget,
} from '../src/modules/smart-apply/submission/submission-provider.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { ANGULAR_CONTENT, ANGULAR_JOB, createReviewedResume } from './support/job-fixtures.js';

// The employer's Greenhouse application form, as the public Job Board API returns it with
// ?questions=true. Served by an injected fetch: no live call is ever made.
const FORM = {
  questions: [
    { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text' }] },
    {
      label: 'Will you now or in the future require visa sponsorship?',
      required: true,
      fields: [
        {
          name: 'question_1',
          type: 'multi_value_single_select',
          values: [
            { label: 'Yes', value: 1 },
            { label: 'No', value: 0 },
          ],
        },
      ],
    },
    {
      label: 'How did you hear about this job?',
      required: true,
      fields: [{ name: 'question_2', type: 'input_text' }],
    },
    {
      label: 'What is your gender?',
      required: false,
      fields: [{ name: 'question_3', type: 'input_text' }],
    },
  ],
};
const formFetch = (url: string) =>
  Promise.resolve(
    url.startsWith('https://boards-api.greenhouse.io/v1/boards/acme/jobs/')
      ? { ok: true, status: 200, json: () => Promise.resolve(FORM) }
      : { ok: false, status: 404, json: () => Promise.resolve({}) },
  );

/** A mocked, explicitly authorised integration (tests only — no real provider exists). */
class FakeAts extends SubmissionProvider {
  readonly key = 'fake-ats';
  readonly name = 'Fake ATS';
  readonly capabilities = {
    operation: 'SUBMIT_APPLICATION' as const,
    authorization: 'Test double',
    consent: 'Test double',
    restrictions: [],
    requiredFields: ['contact' as const, 'answers' as const],
    confirmation: '201 with an application id',
    retry: { maxAttempts: 3, retryableHttpStatuses: [503] },
  };
  submits: SubmissionRequest[] = [];
  reconciles: string[] = [];
  results: SubmissionResult[] = [];
  reconcileResults: ReconcileResult[] = [];
  supports(target: SubmissionTarget): boolean {
    return target.jobUrl?.startsWith('https://jobs.ats.example/') ?? false;
  }
  submit(req: SubmissionRequest): Promise<SubmissionResult> {
    this.submits.push(req);
    return Promise.resolve(this.results.shift() ?? { kind: 'CONFIRMED', reference: 'ATS-1' });
  }
  reconcile(key: string): Promise<ReconcileResult> {
    this.reconciles.push(key);
    return Promise.resolve(this.reconcileResults.shift() ?? { kind: 'UNKNOWN' });
  }
}

async function createJob(user: TestUser, jobUrl: string, title = ANGULAR_JOB.title) {
  const res = await user.post('/jobs', { ...ANGULAR_JOB, title, jobUrl }).expect(201);
  return res.body.id as string;
}

describe('Smart Apply: preparation, answers and handoff (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let parsing: ParsingDispatcher;
  let worker: InProcessSmartApplyWorker;
  let user: TestUser;
  let versionId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      overrides: [[EmployerQuestionsReader, new EmployerQuestionsReader(formFetch, true)]],
    }));
    parsing = app.get(ParsingDispatcher);
    worker = app.get<InProcessSmartApplyWorker>(SmartApplyDispatcher);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Thanga Sri');
    ({ versionId } = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT));
  });

  afterEach(() => worker.drain());
  afterAll(() => app.close());

  async function prepare(jobId: string, as: TestUser = user) {
    const res = await as.post('/smart-apply/applications', { jobId, resumeVersionId: versionId });
    expect(res.status).toBe(202);
    await worker.drain();
    return (await as.get(`/smart-apply/applications/${res.body.id}`).expect(200)).body;
  }

  /** A job discovered on the employer's Greenhouse board (provenance as discovery records it). */
  async function greenhouseJob(id: number) {
    const jobId = await createJob(
      user,
      `https://boards.greenhouse.io/acme/jobs/${id}`,
      `Frontend Developer ${id}`,
    );
    await prisma.job.update({ where: { id: jobId }, data: { origin: 'DISCOVERED' } });
    const source = await prisma.jobSource.upsert({
      where: { key: 'greenhouse' },
      create: {
        key: 'greenhouse',
        name: 'Greenhouse',
        kind: 'API',
        isDevelopment: false,
        isEnabled: true,
      },
      update: {},
    });
    await prisma.discoveredJob.create({
      data: {
        userId: user.userId,
        sourceId: source.id,
        externalId: `acme:${id}`,
        jobId,
        sourceUrl: `https://boards.greenhouse.io/acme/jobs/${id}`,
        dedupKey: `acme|frontend developer|${id}`,
        title: ANGULAR_JOB.title,
        companyName: ANGULAR_JOB.companyName,
        outcome: 'RECOMMENDED',
      },
    });
    return jobId;
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/smart-apply/applications').expect(401);
    await request(app.getHttpServer()).get('/api/v1/smart-apply/questions').expect(401);
  });

  it('prepares, hands off to the official site and records a user-reported submission', async () => {
    const jobId = await createJob(user, 'https://careers.example.com/jobs/42');
    const prepared = await prepare(jobId);
    expect(prepared).toMatchObject({
      state: 'READY_FOR_REVIEW',
      trackerStatus: 'PREPARING',
      officialApplicationUrl: 'https://careers.example.com/jobs/42',
      applicationUrlKind: 'USER_PROVIDED',
      outstandingQuestions: 0,
      resume: { resumeVersionId: versionId },
      submissionMethod: null,
      confirmation: null,
    });
    expect(prepared.coverLetter?.text).toMatch(/Dear Hiring Team/);
    expect(prepared.eligibility).toMatchObject({
      autoSubmitEligible: false,
      method: 'USER_HANDOFF',
      summary: expect.stringMatching(/No authorised submission integration exists/),
    });
    expect(prepared.history.map((h: { toState: string }) => h.toState)).toEqual([
      'DISCOVERED',
      'PREPARING',
      'READY_FOR_REVIEW',
    ]);

    // Idempotent: preparing the same job again returns the same application.
    const again = await user.post('/smart-apply/applications', {
      jobId,
      resumeVersionId: versionId,
    });
    expect(again.body.id).toBe(prepared.id);

    // No integration: submission is refused, approval hands off instead.
    await user.post(`/smart-apply/applications/${prepared.id}/submit`).expect(409);
    const approved = (
      await user.post(`/smart-apply/applications/${prepared.id}/approve`).expect(200)
    ).body;
    expect(approved).toMatchObject({
      state: 'AWAITING_USER_SUBMISSION',
      submissionMethod: 'USER_HANDOFF',
    });
    expect(approved.approvedAt).not.toBeNull();

    // Clicking a button never counts as submitted: an explicit confirmation is required.
    await user.post(`/smart-apply/applications/${prepared.id}/manual-submission`, {}).expect(400);
    await user
      .post(`/smart-apply/applications/${prepared.id}/manual-submission`, {
        confirm: true,
        submittedOn: '2999-01-01',
      })
      .expect(400);
    const submitted = (
      await user
        .post(`/smart-apply/applications/${prepared.id}/manual-submission`, { confirm: true })
        .expect(200)
    ).body;
    expect(submitted).toMatchObject({
      state: 'SUBMITTED',
      confirmation: 'USER_REPORTED',
      submissionMethod: 'USER_HANDOFF',
      trackerStatus: 'APPLIED',
      confirmationReference: null,
    });
    expect(submitted.history.at(-1).reason).toMatch(/not verified by the app/);
    const app1 = await prisma.application.findUniqueOrThrow({
      where: { id: prepared.applicationId },
    });
    expect(app1.status).toBe('APPLIED');

    await user
      .post(`/smart-apply/applications/${prepared.id}/manual-submission`, { confirm: true })
      .expect(409);
    await user.post(`/smart-apply/applications/${prepared.id}/cancel`).expect(409);
    expect(
      (await user.get(`/smart-apply/applications/${prepared.id}/submission`).expect(200)).body,
    ).toMatchObject({
      state: 'SUBMITTED',
      confirmation: 'USER_REPORTED',
      attempts: [],
    });
  });

  it('asks for the employer’s required answers, validates them and resumes when complete', async () => {
    const jobId = await greenhouseJob(77);
    const prepared = await prepare(jobId);
    expect(prepared).toMatchObject({
      state: 'NEEDS_USER_INPUT',
      applicationUrlKind: 'EMPLOYER_POSTING',
      outstandingQuestions: 2,
    });
    const byLabel = (label: RegExp) =>
      prepared.questions.find((q: { question: string }) => label.test(q.question));
    const sponsorship = byLabel(/sponsorship/);
    const heard = byLabel(/hear about/);
    const gender = byLabel(/gender/);
    expect(prepared.questions).toHaveLength(3); // contact fields are skipped
    expect(sponsorship).toMatchObject({
      required: true,
      sensitivity: 'SENSITIVE',
      options: ['Yes', 'No'],
      answer: null,
      confirmed: false,
    });
    expect(sponsorship.reason).toMatch(/legal statement/);
    expect(gender).toMatchObject({ required: false, sensitivity: 'DEMOGRAPHIC' });

    const inbox = (await user.get('/smart-apply/questions').expect(200)).body;
    expect(inbox.map((q: { id: string }) => q.id).sort()).toEqual(
      [sponsorship.id, heard.id].sort(),
    );
    expect(
      await prisma.notification.count({
        where: { userId: user.userId, type: 'SMART_APPLY_INPUT_NEEDED' },
      }),
    ).toBe(1);

    const answerUrl = (q: { id: string }) =>
      `/smart-apply/applications/${prepared.id}/questions/${q.id}/answer`;
    await user.put(answerUrl(sponsorship), { answer: 'Maybe', confirm: true }).expect(400);
    await user
      .put(answerUrl(sponsorship), { answer: 'No', confirm: false, saveForReuse: true })
      .expect(400);
    await user
      .put(answerUrl(gender), { answer: 'Prefer not to say', confirm: true, saveForReuse: true })
      .expect(400);
    // An unconfirmed answer is a draft: still outstanding.
    const draft = (
      await user.put(answerUrl(sponsorship), { answer: 'No', confirm: false }).expect(200)
    ).body;
    expect(draft).toMatchObject({ answer: 'No', confirmed: false });
    await user.post(`/smart-apply/applications/${prepared.id}/approve`).expect(409);

    await user
      .put(answerUrl(sponsorship), { answer: 'No', confirm: true, saveForReuse: true })
      .expect(200);
    await user
      .put(answerUrl(heard), { answer: 'Company website', confirm: true, saveForReuse: true })
      .expect(200);
    let detail = (await user.get(`/smart-apply/applications/${prepared.id}`).expect(200)).body;
    expect(detail).toMatchObject({ state: 'READY_FOR_REVIEW', outstandingQuestions: 0 });
    expect((await user.get('/smart-apply/questions').expect(200)).body).toEqual([]);

    // Changing an answer after approval revokes the approval.
    await user.post(`/smart-apply/applications/${prepared.id}/approve`).expect(200);
    await user.put(answerUrl(heard), { answer: 'A friend', confirm: true }).expect(200);
    detail = (await user.get(`/smart-apply/applications/${prepared.id}`).expect(200)).body;
    expect(detail).toMatchObject({ state: 'READY_FOR_REVIEW', approvedAt: null });

    // Saved answers: no demographic data, no answer text in the audit log.
    const saved = (await user.get('/smart-apply/saved-answers').expect(200)).body;
    expect(saved.map((s: { sensitivity: string }) => s.sensitivity).sort()).toEqual([
      'SENSITIVE',
      'STANDARD',
    ]);
    const audits = await prisma.auditLog.findMany({
      where: { userId: user.userId, action: { startsWith: 'smart_apply.' } },
    });
    expect(JSON.stringify(audits)).not.toMatch(/Company website|A friend/);

    // The materials for review.
    const materials = (
      await user.get(`/smart-apply/applications/${prepared.id}/materials`).expect(200)
    ).body;
    expect(materials.resume).toMatchObject({
      resumeVersionId: versionId,
      resumeName: 'Angular Resume',
    });
    expect(materials.answers).toHaveLength(3);
  });

  it('reuses confirmed answers: standard ones as confirmed, sensitive ones only pre-filled', async () => {
    const first = await prepare(await greenhouseJob(77));
    const answerUrl = (id: string, q: { id: string }) =>
      `/smart-apply/applications/${id}/questions/${q.id}/answer`;
    const q = (d: { questions: { id: string; question: string }[] }, r: RegExp) =>
      d.questions.find((x) => r.test(x.question))!;
    await user
      .put(answerUrl(first.id, q(first, /sponsorship/)), {
        answer: 'No',
        confirm: true,
        saveForReuse: true,
      })
      .expect(200);
    await user
      .put(answerUrl(first.id, q(first, /hear about/)), {
        answer: 'Company website',
        confirm: true,
        saveForReuse: true,
      })
      .expect(200);

    const second = await prepare(await greenhouseJob(78));
    expect(q(second, /hear about/)).toMatchObject({
      answer: 'Company website',
      confirmed: true,
      prefilledFrom: 'SAVED_ANSWER',
    });
    expect(q(second, /sponsorship/)).toMatchObject({
      answer: 'No',
      confirmed: false,
      prefilledFrom: 'SAVED_ANSWER',
    });
    expect(q(second, /gender/)).toMatchObject({ answer: null, prefilledFrom: null });
    expect(second).toMatchObject({ state: 'NEEDS_USER_INPUT', outstandingQuestions: 1 });

    // Deleting a saved answer stops its reuse.
    const saved = (await user.get('/smart-apply/saved-answers').expect(200)).body;
    for (const s of saved) await user.delete(`/smart-apply/saved-answers/${s.id}`).expect(204);
    expect((await user.get('/smart-apply/saved-answers').expect(200)).body).toEqual([]);
  });

  it('pre-fills from the profile only what the user stated, unconfirmed', async () => {
    const jobId = await createJob(user, 'https://careers.example.com/jobs/7');
    const prepared = await prepare(jobId);
    await user
      .post(`/applications/${prepared.applicationId}/questions`, {
        question: 'What is your notice period?',
      })
      .expect(201);
    await user
      .post(`/applications/${prepared.applicationId}/questions`, {
        question: 'What is your favourite framework?',
      })
      .expect(201);
    const profile = (await user.get('/profile').expect(200)).body.details;
    await user
      .put('/profile', { ...withoutReadOnly(profile), noticePeriod: '30 days' })
      .expect(200);
    await user.post(`/smart-apply/applications/${prepared.id}/resume`).expect(202);
    await worker.drain();
    const detail = (await user.get(`/smart-apply/applications/${prepared.id}`).expect(200)).body;
    const notice = detail.questions.find((x: { question: string }) => /notice/.test(x.question));
    const other = detail.questions.find((x: { question: string }) => /framework/.test(x.question));
    expect(notice).toMatchObject({ answer: '30 days', prefilledFrom: 'PROFILE', confirmed: false });
    expect(other).toMatchObject({ answer: null, prefilledFrom: null }); // never guessed
    expect(detail.state).toBe('NEEDS_USER_INPUT');
  });

  it('enforces the daily application limit and allows cancelling and preparing again', async () => {
    await user.put('/smart-apply/settings', { dailyApplicationLimit: 1 }).expect(200);
    const first = await prepare(
      await createJob(user, 'https://careers.example.com/jobs/1', 'Frontend Developer A'),
    );
    const secondJob = await createJob(
      user,
      'https://careers.example.com/jobs/2',
      'Frontend Developer B',
    );
    const limited = await user.post('/smart-apply/applications', {
      jobId: secondJob,
      resumeVersionId: versionId,
    });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('DAILY_LIMIT_REACHED');

    const cancelled = (await user.post(`/smart-apply/applications/${first.id}/cancel`).expect(200))
      .body;
    expect(cancelled).toMatchObject({ state: 'CANCELLED', trackerStatus: 'SAVED' });
    // Re-preparing a cancelled application reopens it (it is not a new application).
    const reopened = await user.post('/smart-apply/applications', {
      jobId: first.job.id,
      resumeVersionId: versionId,
    });
    expect(reopened.status).toBe(202);
    expect(reopened.body).toMatchObject({ id: first.id, state: 'PREPARING' });
  });

  it('prepares once under concurrent requests', async () => {
    const jobId = await createJob(user, 'https://careers.example.com/jobs/9');
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        user.post('/smart-apply/applications', { jobId, resumeVersionId: versionId }),
      ),
    );
    const ok = results.filter((r) => r.status === 202);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of results) expect([202, 409]).toContain(r.status);
    expect(new Set(ok.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.smartApplication.count({ where: { userId: user.userId } })).toBe(1);
    expect(await prisma.application.count({ where: { userId: user.userId } })).toBe(1);
  });

  it('validates input', async () => {
    await user.put('/smart-apply/settings', { dailySubmissionLimit: 99 }).expect(400);
    await user.put('/smart-apply/settings', { mode: 'FULL_AUTO' }).expect(400);
    await user.get('/smart-apply/applications?state=BOGUS').expect(400);
    await user.get('/smart-apply/applications?page=0').expect(400);
    await user.post('/smart-apply/applications', { jobId: 'not-a-uuid' }).expect(400);
    await user.get('/smart-apply/applications/not-a-uuid').expect(404);
    const prepared = await prepare(await createJob(user, 'https://careers.example.com/jobs/3'));
    await user
      .post(`/smart-apply/applications/${prepared.id}/submit`)
      .set('Idempotency-Key', 'bad key!')
      .expect(400);
    const list = (
      await user
        .get(
          '/smart-apply/applications?state=READY_FOR_REVIEW,NEEDS_USER_INPUT&sort=createdAt&order=asc&pageSize=5',
        )
        .expect(200)
    ).body;
    expect(list).toMatchObject({ total: 1, page: 1, pageSize: 5, items: [{ id: prepared.id }] });
  });

  it("never exposes another user's applications, questions or saved answers", async () => {
    const prepared = await prepare(await greenhouseJob(77));
    const q = prepared.questions[0];
    await user.put(`/smart-apply/applications/${prepared.id}/questions/${q.id}/answer`, {
      answer: 'No',
      confirm: true,
      saveForReuse: true,
    });
    const [savedAnswer] = (await user.get('/smart-apply/saved-answers').expect(200)).body;
    const other = await signUp(app, 'Other User');
    const base = `/smart-apply/applications/${prepared.id}`;
    for (const path of [base, `${base}/materials`, `${base}/eligibility`, `${base}/submission`]) {
      await other.get(path).expect(404);
    }
    await other
      .put(`${base}/questions/${q.id}/answer`, { answer: 'Yes', confirm: true })
      .expect(404);
    for (const action of ['approve', 'handoff', 'submit', 'cancel', 'resume'])
      await other.post(`${base}/${action}`).expect(404);
    await other.post(`${base}/manual-submission`, { confirm: true }).expect(404);
    await other.delete(`/smart-apply/saved-answers/${savedAnswer.id}`).expect(404);
    // Preparing someone else's job is refused like a missing job.
    await other.post('/smart-apply/applications', { jobId: prepared.job.id }).expect(404);
    expect((await other.get('/smart-apply/applications').expect(200)).body.items).toEqual([]);
    expect((await other.get('/smart-apply/questions').expect(200)).body).toEqual([]);
    expect((await other.get('/smart-apply/saved-answers').expect(200)).body).toEqual([]);
  });
});

describe('Smart Apply: authorised submission through a mocked integration (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let parsing: ParsingDispatcher;
  let worker: InProcessSmartApplyWorker;
  let service: SmartApplyService;
  let user: TestUser;
  let versionId: string;
  const ats = new FakeAts();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      overrides: [
        [SUBMISSION_PROVIDERS, [ats]],
        [SMART_APPLY_OPTIONS, { autoSubmitEnabled: true, maxAttempts: 3, retryBaseMs: 1000 }],
        [EmployerQuestionsReader, new EmployerQuestionsReader(formFetch, true)],
      ],
    }));
    parsing = app.get(ParsingDispatcher);
    worker = app.get<InProcessSmartApplyWorker>(SmartApplyDispatcher);
    service = app.get(SmartApplyService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    ats.submits = [];
    ats.reconciles = [];
    ats.results = [];
    ats.reconcileResults = [];
    user = await signUp(app, 'Thanga Sri');
    ({ versionId } = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT));
  });

  afterEach(() => worker.drain());
  afterAll(() => app.close());

  const consent = () =>
    user.put('/smart-apply/settings', { mode: 'HYBRID', autoSubmitConsent: true }).expect(200);

  /** Prepares and approves an application for a job the fake ATS supports. */
  async function approvedApplication(n = 1) {
    const job = await user
      .post('/jobs', {
        ...ANGULAR_JOB,
        title: `Frontend Developer ${n}`,
        jobUrl: `https://jobs.ats.example/${n}`,
      })
      .expect(201);
    const res = await user
      .post('/smart-apply/applications', { jobId: job.body.id, resumeVersionId: versionId })
      .expect(202);
    await worker.drain();
    const approved = (
      await user.post(`/smart-apply/applications/${res.body.id}/approve`).expect(200)
    ).body;
    return approved;
  }

  it('hands off without consent or in prepare-only mode, and never submits', async () => {
    const handedOff = await approvedApplication(1);
    expect(handedOff).toMatchObject({
      state: 'AWAITING_USER_SUBMISSION',
      submissionMethod: 'USER_HANDOFF',
    });
    expect(
      handedOff.eligibility.checks
        .filter((c: { satisfied: boolean }) => !c.satisfied)
        .map((c: { code: string }) => c.code),
    ).toEqual(['MODE', 'CONSENT']);

    await user.put('/smart-apply/settings', { mode: 'HYBRID' }).expect(200);
    const noConsent = await approvedApplication(2);
    expect(noConsent.state).toBe('AWAITING_USER_SUBMISSION');
    expect(ats.submits).toHaveLength(0);

    const settings = (await consent()).body;
    expect(settings).toMatchObject({ autoSubmitAvailable: true, providers: [{ key: 'fake-ats' }] });
    expect(settings.autoSubmitConsentAt).not.toBeNull();
  });

  it('submits once under concurrent requests and records the provider’s confirmation', async () => {
    await consent();
    const app1 = await approvedApplication();
    expect(app1).toMatchObject({
      state: 'READY_FOR_REVIEW',
      submissionMethod: 'PROVIDER_INTEGRATION',
    });
    expect(app1.eligibility.autoSubmitEligible).toBe(true);
    ats.results = [{ kind: 'CONFIRMED', reference: 'ATS-123', httpStatus: 201 }];

    const responses = await Promise.all(
      ['key-aaaaaaaa', 'key-bbbbbbbb', 'key-cccccccc', 'key-dddddddd'].map((k) =>
        user.post(`/smart-apply/applications/${app1.id}/submit`).set('Idempotency-Key', k),
      ),
    );
    expect(responses.filter((r) => r.status === 202)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(3);
    await worker.drain();
    expect(ats.submits).toHaveLength(1);

    const done = (await user.get(`/smart-apply/applications/${app1.id}`).expect(200)).body;
    expect(done).toMatchObject({
      state: 'SUBMITTED',
      confirmation: 'PROVIDER_CONFIRMED',
      confirmationReference: 'ATS-123',
      trackerStatus: 'APPLIED',
      attempts: [{ attemptNumber: 1, outcome: 'CONFIRMED', providerReference: 'ATS-123' }],
    });
    // Replaying the winning request is harmless.
    const keys = ['key-aaaaaaaa', 'key-bbbbbbbb', 'key-cccccccc', 'key-dddddddd'];
    const key = keys[responses.findIndex((r) => r.status === 202)]!;
    await user
      .post(`/smart-apply/applications/${app1.id}/submit`)
      .set('Idempotency-Key', key)
      .expect(202);
    expect(ats.submits).toHaveLength(1);
    expect(ats.submits[0]!.answers).toEqual([]);
    expect(ats.submits[0]!.applicant.fullName).toBeTruthy();
  });

  it('retries a failure the provider says was not accepted, with backoff and the same key', async () => {
    await consent();
    const a = await approvedApplication();
    ats.results = [
      {
        kind: 'REJECTED',
        retryable: true,
        message: 'Service unavailable, try later.',
        httpStatus: 503,
      },
      { kind: 'CONFIRMED', reference: 'ATS-9' },
    ];
    await user.post(`/smart-apply/applications/${a.id}/submit`).expect(202);
    await worker.drain();
    let detail = (await user.get(`/smart-apply/applications/${a.id}`).expect(200)).body;
    expect(detail.state).toBe('SUBMITTING');
    expect(detail.attempts[0]).toMatchObject({
      outcome: 'RETRYABLE_FAILURE',
      message: 'Service unavailable, try later.',
    });
    const due = new Date(detail.attempts[0].nextAttemptAt);
    // Not before the backoff…
    await worker.tick(new Date(due.getTime() - 500));
    await worker.drain();
    expect(ats.submits).toHaveLength(1);
    // …then once.
    await worker.tick(new Date(due.getTime() + 1));
    await worker.drain();
    detail = (await user.get(`/smart-apply/applications/${a.id}`).expect(200)).body;
    expect(detail).toMatchObject({ state: 'SUBMITTED', confirmation: 'PROVIDER_CONFIRMED' });
    expect(ats.submits.map((s) => s.idempotencyKey)).toEqual([
      `smart-apply:${a.id}`,
      `smart-apply:${a.id}`,
    ]);
  });

  it('fails after a permanent rejection and lets the user submit on the official site', async () => {
    await consent();
    const a = await approvedApplication();
    ats.results = [{ kind: 'REJECTED', retryable: false, message: 'The job is closed.' }];
    await user.post(`/smart-apply/applications/${a.id}/submit`).expect(202);
    await worker.drain();
    const failed = (await user.get(`/smart-apply/applications/${a.id}`).expect(200)).body;
    expect(failed).toMatchObject({
      state: 'FAILED',
      failureReason: 'The job is closed.',
      confirmation: null,
      trackerStatus: 'PREPARING',
    });
    const handoff = (await user.post(`/smart-apply/applications/${a.id}/handoff`).expect(200)).body;
    expect(handoff).toMatchObject({
      state: 'AWAITING_USER_SUBMISSION',
      submissionMethod: 'USER_HANDOFF',
    });
  });

  it('never resends an ambiguous submission: it reconciles first', async () => {
    await consent();
    const a = await approvedApplication();
    ats.results = [{ kind: 'AMBIGUOUS', message: 'Connection lost after sending.' }];
    ats.reconcileResults = [{ kind: 'UNKNOWN' }, { kind: 'CONFIRMED', reference: 'ATS-77' }];
    await user.post(`/smart-apply/applications/${a.id}/submit`).expect(202);
    await worker.drain();
    let detail = (await user.get(`/smart-apply/applications/${a.id}`).expect(200)).body;
    expect(detail).toMatchObject({ state: 'SUBMITTING', uncertain: true, confirmation: null });
    expect(
      await prisma.notification.count({
        where: { userId: user.userId, type: 'SMART_APPLY_SUBMISSION_UPDATE' },
      }),
    ).toBe(1);
    // A second submit request is refused while it is being checked.
    await user
      .post(`/smart-apply/applications/${a.id}/submit`)
      .set('Idempotency-Key', 'another-key-1')
      .expect(409);

    const later = new Date(Date.now() + 60 * 60 * 1000);
    await worker.tick(later); // UNKNOWN: still uncertain
    detail = (await user.get(`/smart-apply/applications/${a.id}`).expect(200)).body;
    expect(detail.uncertain).toBe(true);
    await worker.tick(new Date(later.getTime() + 7 * 60 * 60 * 1000)); // CONFIRMED
    await worker.drain();
    detail = (await user.get(`/smart-apply/applications/${a.id}`).expect(200)).body;
    expect(detail).toMatchObject({
      state: 'SUBMITTED',
      confirmation: 'PROVIDER_CONFIRMED',
      confirmationReference: 'ATS-77',
      uncertain: false,
    });
    expect(ats.submits).toHaveLength(1);
    expect(ats.reconciles).toEqual([`smart-apply:${a.id}`, `smart-apply:${a.id}`]);
  });

  it('lets the user report an uncertain submission themselves (labelled as user-reported)', async () => {
    await consent();
    const a = await approvedApplication();
    ats.results = [{ kind: 'AMBIGUOUS', message: 'Timed out.' }];
    await user.post(`/smart-apply/applications/${a.id}/submit`).expect(202);
    await worker.drain();
    const reported = (
      await user
        .post(`/smart-apply/applications/${a.id}/manual-submission`, { confirm: true })
        .expect(200)
    ).body;
    expect(reported).toMatchObject({
      state: 'SUBMITTED',
      confirmation: 'USER_REPORTED',
      uncertain: false,
    });
  });

  it('enforces the daily automatic-submission limit and withdrawn consent', async () => {
    await user
      .put('/smart-apply/settings', {
        mode: 'HYBRID',
        autoSubmitConsent: true,
        dailySubmissionLimit: 1,
      })
      .expect(200);
    const first = await approvedApplication(1);
    const second = await approvedApplication(2);
    await user.post(`/smart-apply/applications/${first.id}/submit`).expect(202);
    await worker.drain();
    const limited = await user.post(`/smart-apply/applications/${second.id}/submit`);
    expect(limited.status).toBe(409); // eligibility: DAILY_LIMIT unsatisfied
    expect(limited.body.code).toBe('AUTO_SUBMIT_NOT_ALLOWED');

    await user
      .put('/smart-apply/settings', { autoSubmitConsent: false, dailySubmissionLimit: 5 })
      .expect(200);
    const refused = await user.post(`/smart-apply/applications/${second.id}/submit`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/consent/i);
    expect(ats.submits).toHaveLength(1);
  });

  it('after a restart, treats an in-flight attempt as ambiguous instead of resending it', async () => {
    await consent();
    const a = await approvedApplication();
    // Simulate a crash mid-submission: the attempt was recorded but its outcome never stored.
    await prisma.smartApplication.update({
      where: { id: a.id },
      data: { state: 'SUBMITTING', idempotencyKey: `smart-apply:${a.id}` },
    });
    await prisma.submissionAttempt.create({
      data: {
        smartApplicationId: a.id,
        userId: user.userId,
        attemptNumber: 1,
        idempotencyKey: `smart-apply:${a.id}`,
        providerKey: 'fake-ats',
      },
    });
    await service.recoverAfterRestart();
    await worker.drain();
    const detail = (await user.get(`/smart-apply/applications/${a.id}`).expect(200)).body;
    expect(detail).toMatchObject({ state: 'SUBMITTING', uncertain: true });
    expect(detail.attempts[0].outcome).toBe('AMBIGUOUS');
    expect(ats.submits).toHaveLength(0);
  });
});

function withoutReadOnly(details: Record<string, unknown>) {
  const { email: _email, updatedAt: _updatedAt, ...rest } = details;
  return rest;
}
