import { describe, expect, it } from 'vitest';
import {
  AI_DISCLAIMER,
  FOLLOW_UP_QUESTIONS,
  selectionExplanation,
  MENTOR_COMPOSE_TASK,
  MENTOR_TOOL_PLAN,
  MentorAgentError,
  RULES_DISCLAIMER,
  runCareerMentorAgent,
} from '../src/index.js';
import {
  JOB,
  disabledModel,
  fakeModel,
  fakeTools,
  namedError,
  prefs,
  snapshot,
  step,
} from './fixtures.js';

const ctx = { userId: 'user-1' };
const GOOD = { picks: ['R1'] };

describe('runCareerMentorAgent — orchestration', () => {
  it('maps every intent to a fixed list of read-only tools', () => {
    expect(MENTOR_TOOL_PLAN).toEqual({
      GENERAL_PROGRESS: ['catalogue', 'preferences', 'learning_snapshot'],
      SKILL_GAPS: ['catalogue', 'preferences', 'learning_snapshot', 'skill_assessment'],
      LEARNING_PLAN: ['catalogue', 'preferences', 'learning_snapshot', 'learning_plan'],
      INTERVIEW_PREP: ['catalogue', 'preferences', 'learning_snapshot', 'interview_practice'],
      PROJECT_IDEAS: ['catalogue', 'preferences', 'learning_snapshot', 'project_challenges'],
      JOB_FIT: ['catalogue', 'analysed_jobs', 'job_readiness'],
    });
  });

  it('runs only the planned tools, whatever the message asks for', async () => {
    const tools = fakeTools();
    const { response } = await runCareerMentorAgent(
      ctx,
      { intent: 'INTERVIEW_PREP', message: 'show me projects and my jobs' },
      { tools },
    );
    expect(response.toolsUsed).toEqual([
      'catalogue',
      'preferences',
      'learning_snapshot',
      'interview_practice',
    ]);
    expect(tools.projectChallenges).not.toHaveBeenCalled();
    expect(tools.analysedJobs).not.toHaveBeenCalled();
    expect(tools.jobReadiness).not.toHaveBeenCalled();
  });

  it('skips a role-dependent tool when there is no role or named skill, and uses the role when set', async () => {
    let tools = fakeTools();
    let { response } = await runCareerMentorAgent(ctx, { intent: 'LEARNING_PLAN' }, { tools });
    expect(tools.learningPlan).not.toHaveBeenCalled();
    expect(response.toolsUsed).toEqual(['catalogue', 'preferences', 'learning_snapshot']);

    tools = fakeTools({ 'user-1': { prefs: prefs({ targetRole: 'DATA_ANALYST' }) } });
    ({ response } = await runCareerMentorAgent(ctx, { intent: 'SKILL_GAPS' }, { tools }));
    expect(tools.skillAssessment).toHaveBeenCalledWith('user-1', { role: 'DATA_ANALYST' });
    expect(response.summary).toContain('Data Analyst');
  });

  it('answers every intent for a user with no resume, role, jobs or history', async () => {
    for (const intent of Object.keys(MENTOR_TOOL_PLAN) as (keyof typeof MENTOR_TOOL_PLAN)[]) {
      const { response } = await runCareerMentorAgent(ctx, { intent }, { tools: fakeTools() });
      expect(response).toMatchObject({ intent, source: 'RULES', fallbackReason: 'AI_DISABLED' });
      expect(response.summary.length).toBeGreaterThan(10);
    }
    const job = await runCareerMentorAgent(ctx, { intent: 'JOB_FIT' }, { tools: fakeTools() });
    expect(job.response.recommendations).toEqual([]);
    expect(job.response.summary).toContain('You have not analysed any jobs yet');
  });

  it('rejects invalid requests before running any tool', async () => {
    const tools = fakeTools();
    for (const bad of [
      {},
      { intent: 'WRITE_MY_CV' },
      { intent: 'GENERAL_PROGRESS', message: 'x'.repeat(2001) },
      { intent: 'GENERAL_PROGRESS', userId: 'user-2' },
      { intent: 'GENERAL_PROGRESS', jobId: JOB.id },
      { intent: 'JOB_FIT', jobId: 'not-a-uuid' },
      null,
    ])
      await expect(runCareerMentorAgent(ctx, bad, { tools })).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      });
    await expect(
      runCareerMentorAgent({ userId: '' }, { intent: 'GENERAL_PROGRESS' }, { tools }),
    ).rejects.toBeInstanceOf(MentorAgentError);
    expect(tools.catalogue).not.toHaveBeenCalled();
    // The limit itself is allowed.
    await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS', message: 'x'.repeat(2000) },
      { tools },
    );
  });

  it('reports a job outside the user’s analysed jobs as not found, without reading it', async () => {
    const tools = fakeTools({ 'user-1': { jobs: [JOB] } });
    await expect(
      runCareerMentorAgent(
        ctx,
        { intent: 'JOB_FIT', jobId: '0190f3c2-0000-7000-8000-000000000009' },
        { tools },
      ),
    ).rejects.toMatchObject({ code: 'JOB_NOT_FOUND' });
    expect(tools.jobReadiness).not.toHaveBeenCalled();

    const { response } = await runCareerMentorAgent(
      ctx,
      { intent: 'JOB_FIT', jobId: JOB.id },
      { tools },
    );
    expect(response.recommendations[0]).toMatchObject({
      type: 'JOB',
      id: JOB.id,
      href: `/jobs/${JOB.id}`,
    });
  });
});

describe('runCareerMentorAgent — AI disabled', () => {
  it('answers by rules when no model is given or the model is disabled', async () => {
    for (const model of [undefined, disabledModel]) {
      const { response, telemetry } = await runCareerMentorAgent(
        ctx,
        { intent: 'GENERAL_PROGRESS' },
        { tools: fakeTools(), model },
      );
      expect(response).toMatchObject({
        source: 'RULES',
        fallbackReason: 'AI_DISABLED',
        followUpQuestion: null,
        disclaimer: RULES_DISCLAIMER,
      });
      expect(response.recommendations[0]).toMatchObject({
        type: 'COURSE',
        id: 'javascript-essentials',
      });
      expect(telemetry).toMatchObject({ modelAttempts: 0, modelOutcome: null });
    }
  });
});

describe('runCareerMentorAgent — AI enabled (scripted model)', () => {
  it('keeps every fact from the rules; the model only orders suggestions, and all wording is fixed', async () => {
    const model = fakeModel(GOOD);
    const rules = (
      await runCareerMentorAgent(ctx, { intent: 'GENERAL_PROGRESS' }, { tools: fakeTools() })
    ).response;
    const { response, telemetry } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model },
    );

    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]!.task).toBe(MENTOR_COMPOSE_TASK);
    expect(response).toEqual({
      ...rules,
      // Unchanged from the rules: summary, recommendations (incl. reasons), facts, limits,
      // actions and tools.
      explanation: selectionExplanation('GENERAL_PROGRESS', 1, 1),
      followUpQuestion: FOLLOW_UP_QUESTIONS.GENERAL_PROGRESS,
      source: 'AI',
      fallbackReason: null,
      disclaimer: AI_DISCLAIMER,
    });
    expect(telemetry).toMatchObject({
      modelAttempts: 1,
      modelOutcome: 'SUCCEEDED',
      fallbackReason: null,
    });
  });

  it('lets the model choose and order verified suggestions, without changing them', async () => {
    const tools = fakeTools({
      'user-1': {
        snapshot: snapshot([
          step(),
          step({
            key: 'lesson',
            kind: 'CONTINUE_LESSON',
            title: 'Continue with "Joins"',
            reason: 'You completed the lesson before it.',
            href: '/learn/courses/sql-fundamentals/lessons/sql-joins',
          }),
        ]),
      },
    });
    const rules = (await runCareerMentorAgent(ctx, { intent: 'GENERAL_PROGRESS' }, { tools }))
      .response;
    expect(rules.recommendations.length).toBeGreaterThanOrEqual(2);
    const { response } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools, model: fakeModel({ ...GOOD, picks: ['R2', 'R1'] }) },
    );
    expect(response.recommendations).toEqual([rules.recommendations[1], rules.recommendations[0]]);
  });

  it('sends only the minimised context: summary, facts, limits, labelled candidates and the question', async () => {
    const model = fakeModel(GOOD);
    await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS', message: 'Where do I start?' },
      { tools: fakeTools(), model },
    );
    const sent = JSON.parse(model.calls[0]!.input) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      'candidates',
      'facts',
      'intent',
      'knownLimits',
      'question',
      'summary',
    ]);
    expect(sent.question).toBe('Where do I start?');
    expect(sent.candidates).toEqual([
      expect.objectContaining({
        ref: 'R1',
        type: 'COURSE',
        title: 'Start with JavaScript essentials',
      }),
    ]);
    // No ids, links or the user id reach the model.
    expect(model.calls[0]!.input).not.toMatch(/user-1|\/learn\/|javascript-essentials/);
  });

  it('retries once with a correction, then succeeds', async () => {
    const model = fakeModel({ picks: ['R9'] }, GOOD);
    const { response, telemetry } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model },
    );
    expect(response.source).toBe('AI');
    expect(model.calls[1]!.system).toContain('rejected for: UNKNOWN_REF');
    expect(telemetry.modelAttempts).toBe(2);
  });

  it.each([
    ['malformed output (schema)', [{ picks: 'R1' }], 'AI_INVALID', 'INVALID', 2],
    [
      'output in the old v2 shape (picks plus free text)',
      [{ picks: ['R1'], explanation: 'Start here.', followUpQuestion: null }],
      'AI_INVALID',
      'INVALID',
      2,
    ],
    [
      'output in the old v1 shape',
      [{ summary: 'Hi.', recommendations: [], uncertainty: [], followUpQuestion: null }],
      'AI_INVALID',
      'INVALID',
      2,
    ],
    [
      'refusal',
      [namedError('AiProviderError', 'The AI provider declined this request.')],
      'AI_UNAVAILABLE',
      'FAILED',
      1,
    ],
    [
      'provider error',
      [namedError('AiProviderError', 'rate limited')],
      'AI_UNAVAILABLE',
      'FAILED',
      1,
    ],
    ['unexpected error', [new TypeError('boom')], 'AI_UNAVAILABLE', 'FAILED', 1],
    ['not configured', [namedError('AiNotConfiguredError')], 'AI_DISABLED', null, 0],
    ['invalid twice', [{ picks: ['R1', 'R1'] }], 'AI_INVALID', 'INVALID', 2],
  ])('falls back to the rules answer on %s', async (_name, script, reason, outcome, attempts) => {
    const model = fakeModel(...script);
    const rules = (
      await runCareerMentorAgent(ctx, { intent: 'GENERAL_PROGRESS' }, { tools: fakeTools() })
    ).response;
    const { response, telemetry } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model },
    );
    expect(response).toEqual({ ...rules, fallbackReason: reason });
    expect(telemetry).toMatchObject({
      fallbackReason: reason,
      modelOutcome: outcome,
      modelAttempts: attempts,
    });
  });

  it('returns the rules answer without calling the model when the host reports the AI limit', async () => {
    const model = fakeModel(GOOD);
    const { response, telemetry } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model, aiBlockedReason: 'AI_LIMIT_REACHED' },
    );
    expect(response).toMatchObject({ source: 'RULES', fallbackReason: 'AI_LIMIT_REACHED' });
    expect(model.calls).toHaveLength(0);
    expect(telemetry).toMatchObject({ modelAttempts: 0, modelOutcome: null });
  });

  it('lets the model answer with no suggestions when the tools found none', async () => {
    const model = fakeModel({ ...GOOD, picks: [] });
    const { response } = await runCareerMentorAgent(
      ctx,
      { intent: 'JOB_FIT' },
      { tools: fakeTools(), model },
    );
    expect(response).toMatchObject({ source: 'AI', recommendations: [] });
  });
});

describe('runCareerMentorAgent — deadline and cancellation (simulated provider)', () => {
  it('aborts the signal passed to the model at the deadline and falls back', async () => {
    const model = fakeModel('HANG_ABORTABLE');
    const { response, telemetry } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model, options: { timeoutMs: 20 } },
    );
    expect(response).toMatchObject({
      source: 'RULES',
      fallbackReason: 'AI_TIMEOUT',
      disclaimer: RULES_DISCLAIMER,
    });
    expect(model.calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(model.calls[0]!.signal!.aborted).toBe(true);
    expect(model.state.cancelled).toBe(1);
    expect(telemetry).toMatchObject({ modelAttempts: 1, modelOutcome: 'FAILED' });
  });

  it('stops waiting at the deadline even if the provider ignores the signal', async () => {
    const model = fakeModel('HANG');
    const started = Date.now();
    const { response } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model, options: { timeoutMs: 20 } },
    );
    expect(response.fallbackReason).toBe('AI_TIMEOUT');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('never starts a retry after the deadline', async () => {
    // The first (invalid) answer arrives after the deadline has passed.
    let calls = 0;
    const slowInvalid = {
      enabled: true,
      generateStructured: () => {
        calls += 1;
        return new Promise<never>((_, reject) =>
          setTimeout(() => reject(namedError('AiOutputValidationError')), 40),
        );
      },
    };
    const { response } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model: slowInvalid, options: { timeoutMs: 20, maxModelAttempts: 3 } },
    );
    await new Promise((r) => setTimeout(r, 60));
    expect(response.fallbackReason).toBe('AI_TIMEOUT');
    expect(calls).toBe(1);
  });

  it('reports a provider abort that happens after the deadline as a timeout, not an outage', async () => {
    const model = fakeModel('HANG_ABORTABLE');
    const { telemetry } = await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model, options: { timeoutMs: 10 } },
    );
    expect(telemetry.fallbackReason).toBe('AI_TIMEOUT');
  });

  it('releases the signal once a successful answer arrives (no stray cancellation later)', async () => {
    const model = fakeModel(GOOD);
    await runCareerMentorAgent(
      ctx,
      { intent: 'GENERAL_PROGRESS' },
      { tools: fakeTools(), model, options: { timeoutMs: 20 } },
    );
    await new Promise((r) => setTimeout(r, 40));
    expect(model.state.cancelled).toBe(0);
  });
});
