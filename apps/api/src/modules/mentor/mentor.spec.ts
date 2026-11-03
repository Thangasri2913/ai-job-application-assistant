import { Logger } from '@nestjs/common';
import {
  MENTOR_COMPOSE_TASK,
  MENTOR_TOOL_PLAN,
  selectionExplanation,
} from '@job-assist/career-mentor-agent';
import type { LearningPreferences } from '@job-assist/shared';
import { ANALYSIS_RATE_LIMIT_KEY } from '../../common/decorators/analysis-rate-limit.decorator.js';
import { AiService } from '../ai/ai.service.js';
import { MockAiProvider } from '../ai/providers/mock-ai.provider.js';
import { UnconfiguredAiProvider } from '../ai/providers/unconfigured-ai.provider.js';
import { LearningService } from '../learning/learning.service.js';
import { MentorController } from './mentor.controller.js';
import { mentorAskSchema } from './mentor.dto.js';
import { MentorAiBudget } from './mentor-ai-budget.service.js';
import { MentorService } from './mentor.service.js';
import { MentorTools } from './mentor-tools.js';

const learning = new LearningService();
const prefs: LearningPreferences = {
  targetRole: null,
  interestCategories: [],
  interestSkillIds: [],
  weeklyGoalMinutes: null,
  dismissedSteps: [],
  updatedAt: null,
};
const emptySnapshot = {
  revision: { topics: [], dueCount: 0, scheduledCount: 0, resolvedCount: 0, method: '' },
  dueActivities: [{ courseId: 'c', lessonId: 'l', activityId: 'a' }],
  nextSteps: {
    steps: [
      {
        key: 'start:javascript-essentials',
        rank: 1,
        kind: 'START_HERE',
        title: 'Start with JavaScript essentials',
        reason: 'A beginner course with no prerequisites.',
        href: '/learn/courses/javascript-essentials',
        evidence: ['General suggestion'],
        confidence: 'LOW',
      },
    ],
    dismissedCount: 0,
    basedOn: {
      targetRole: null,
      interests: 0,
      hasResume: false,
      analysedJobs: 0,
      practiceAnswers: 0,
      diagnostics: 0,
    },
  },
  analytics: {
    courses: { started: 0, completed: 0 },
    lessonsCompleted: 0,
    recentActivity: [],
    lastActiveAt: null,
    practice: {
      attempts: 0,
      questionsAnswered: 0,
      firstTry: { correct: 0, total: 0 },
      firstTryAccuracy: null,
      note: 'Answer at least 5 different practice questions to see an accuracy figure.',
    },
    revision: { due: 0, scheduled: 0 },
    skills: { measured: 0, tooFewQuestions: 0, unknown: 0 },
    plan: null,
    interview: { attempts: 0, questions: 0 },
    projects: { started: 0, completed: 0 },
    week: { goalMinutes: null, estimatedMinutes: 0 },
  },
};

/** MentorTools over the real catalogue, with user-specific services stubbed. */
function makeTools() {
  const adaptive = {
    getPreferences: vi.fn(() => Promise.resolve(prefs)),
    snapshot: vi.fn(() => Promise.resolve(emptySnapshot)),
    assessRoleSkills: vi.fn(),
    defaultResumeVersionId: vi.fn(() => Promise.resolve(null)),
  };
  const progress = {
    courseStates: vi.fn(() => Promise.resolve(new Map([['sql-fundamentals', { enrolled: true }]]))),
    latestSkillEvidence: vi.fn(() =>
      Promise.resolve(new Map([['sql', { correct: 4, total: 5, extra: 'x' }]])),
    ),
  };
  const jobReadiness = {
    jobs: vi.fn(() => Promise.resolve({ jobs: [] })),
    readiness: vi.fn(),
  };
  const tools = new MentorTools(
    learning,
    progress as never,
    adaptive as never,
    {} as never,
    {} as never,
    {} as never,
    jobReadiness as never,
  );
  return { tools, adaptive, progress, jobReadiness };
}

const usage = () => ({ record: vi.fn(() => Promise.resolve()) });

describe('MentorTools (the agent’s approved tools)', () => {
  it('provides the published catalogue with each skill’s best course, and no user data', () => {
    const { tools } = makeTools();
    const c = tools.catalogue();
    expect(c.courses.every((course) => course.status === 'PUBLISHED')).toBe(true);
    expect(c.bestCourseBySkill.sql).toBe('sql-fundamentals');
    expect(c.skills.find((s) => s.id === 'javascript')?.alsoKnownAs).toContain('JS');
    expect(c.roleCoreSkills.DATA_ANALYST).toContain('sql');
    expect(tools.catalogue()).toBe(c); // computed once
  });

  it('returns only counts and ids from the learning snapshot', async () => {
    const { tools, progress } = makeTools();
    const s = await tools.learningSnapshot('user-1');
    expect(progress.courseStates).toHaveBeenCalledWith('user-1');
    expect(s.enrolledCourseIds).toEqual(['sql-fundamentals']);
    expect(s.skillEvidence).toEqual([{ skillId: 'sql', correct: 4, total: 5 }]);
    expect(s).not.toHaveProperty('dueActivities');
  });
});

const GOOD_DRAFT = { picks: ['R1'] };

/** A real MentorAiBudget over a fake ai_usage count. */
function makeBudget(options: { used?: number; limit?: number } = {}) {
  const count = vi.fn(() => Promise.resolve(options.used ?? 0));
  const config = {
    get: (key: string) =>
      ({ MENTOR_AI_USER_LIMIT: options.limit ?? 20, MENTOR_AI_USER_WINDOW_SECONDS: 3600 })[key],
  };
  const budget = new MentorAiBudget({ aiUsage: { count } } as never, config as never);
  return { budget, count };
}

function makeService(provider = new MockAiProvider(), budgetOptions = {}) {
  const { tools, adaptive } = makeTools();
  const u = usage();
  const { budget, count } = makeBudget(budgetOptions);
  const service = new MentorService(tools, new AiService(provider), u as never, budget);
  return { service, u, count, adaptive, provider };
}

describe('MentorService (host of @job-assist/career-mentor-agent)', () => {
  it('answers by rules when AI is disabled, using the authenticated user id and the real catalogue', async () => {
    const { service, u, count, adaptive } = makeService(new UnconfiguredAiProvider() as never);
    const res = await service.ask('user-1', { intent: 'GENERAL_PROGRESS', message: 'user-2' });
    expect(res).toMatchObject({
      source: 'RULES',
      fallbackReason: 'AI_DISABLED',
      explanation: null,
    });
    expect(res.recommendations[0]).toMatchObject({ type: 'COURSE', id: 'javascript-essentials' });
    expect(res.toolsUsed).toEqual(MENTOR_TOOL_PLAN.GENERAL_PROGRESS);
    expect(adaptive.getPreferences).toHaveBeenCalledWith('user-1');
    expect(u.record).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled(); // no allowance is checked or spent without AI
  });

  it('uses the existing AiService when enabled and records usage without content', async () => {
    const { service, u, provider } = makeService(
      new MockAiProvider().respondTo(MENTOR_COMPOSE_TASK, GOOD_DRAFT),
    );
    const res = await service.ask('user-1', { intent: 'GENERAL_PROGRESS' });
    expect(res).toMatchObject({
      source: 'AI',
      fallbackReason: null,
      explanation: selectionExplanation('GENERAL_PROGRESS', 1, 1),
    });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(u.record).toHaveBeenCalledWith({
      userId: 'user-1',
      operation: MENTOR_COMPOSE_TASK,
      provider: 'mock',
      model: null,
      status: 'SUCCEEDED',
      attempts: 1,
    });
  });

  it('falls back to rules on provider failure, records FAILED and logs counts only', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, u } = makeService();
    const res = await service.ask('user-1', {
      intent: 'GENERAL_PROGRESS',
      message: 'SECRET-QUESTION',
    });
    expect(res).toMatchObject({ source: 'RULES', fallbackReason: 'AI_UNAVAILABLE' });
    expect(u.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET-QUESTION');
    warn.mockRestore();
  });

  it('rejects any model-written text (the model may only pick suggestions)', async () => {
    const { service } = makeService(
      new MockAiProvider().respondTo(MENTOR_COMPOSE_TASK, {
        ...GOOD_DRAFT,
        explanation: 'Great job finishing the SQL course!',
      }),
    );
    const res = await service.ask('user-1', { intent: 'GENERAL_PROGRESS' });
    expect(res).toMatchObject({ source: 'RULES', fallbackReason: 'AI_INVALID', explanation: null });
    expect(JSON.stringify(res)).not.toContain('Great job');
  });

  it('maps agent errors to HTTP errors', async () => {
    const { service } = makeService(new UnconfiguredAiProvider() as never);
    await expect(
      service.ask('user-1', { intent: 'JOB_FIT', jobId: '0190f3c2-0000-7000-8000-000000000009' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(service.ask('user-1', { intent: 'NOPE' } as never)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('Per-user mentor AI allowance', () => {
  it('answers by rules without calling the model once the allowance is used up', async () => {
    const { service, provider, u, count } = makeService(
      new MockAiProvider().respondTo(MENTOR_COMPOSE_TASK, GOOD_DRAFT),
      { used: 20, limit: 20 },
    );
    const res = await service.ask('user-1', { intent: 'GENERAL_PROGRESS' });
    expect(res).toMatchObject({ source: 'RULES', fallbackReason: 'AI_LIMIT_REACHED' });
    expect(res.recommendations.length).toBeGreaterThan(0); // the rules answer is still complete
    expect(provider.requests).toHaveLength(0);
    expect(u.record).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        operation: MENTOR_COMPOSE_TASK,
        createdAt: { gte: expect.any(Date) },
      },
    });
  });

  it('allows AI below the limit', async () => {
    const { service } = makeService(
      new MockAiProvider().respondTo(MENTOR_COMPOSE_TASK, GOOD_DRAFT),
      { used: 19, limit: 20 },
    );
    expect((await service.ask('user-1', { intent: 'GENERAL_PROGRESS' })).source).toBe('AI');
  });

  it('a limit of 0 turns mentor AI off for everyone without a database query', async () => {
    const { budget, count } = makeBudget({ limit: 0 });
    expect(await budget.reserve('user-1')).toBeNull();
    expect(count).not.toHaveBeenCalled();
  });

  it('lets one AI answer per user run at a time, so concurrent requests cannot pass the count together', async () => {
    const provider = new MockAiProvider().respondTo(MENTOR_COMPOSE_TASK, GOOD_DRAFT, {
      delayMs: 30,
    });
    const { service } = makeService(provider, { used: 19, limit: 20 });
    const answers = await Promise.all(
      [1, 2, 3].map(() => service.ask('user-1', { intent: 'GENERAL_PROGRESS' })),
    );
    expect(answers.map((a) => a.fallbackReason).sort()).toEqual([
      'AI_LIMIT_REACHED',
      'AI_LIMIT_REACHED',
      null,
    ]);
    expect(provider.requests).toHaveLength(1);
  });

  it('keeps users apart: one user’s request in progress or used-up allowance does not affect another', async () => {
    const { budget, count } = makeBudget({ limit: 5 });
    const first = await budget.reserve('user-1');
    expect(first).not.toBeNull();
    expect(await budget.reserve('user-1')).toBeNull(); // same user, still in progress
    expect(await budget.reserve('user-2')).not.toBeNull(); // another user is unaffected
    count.mockResolvedValueOnce(5);
    expect(await budget.reserve('user-3')).toBeNull(); // user-3 has used theirs
    expect(await budget.reserve('user-4')).not.toBeNull();
    first!();
    first!(); // releasing twice is harmless
    expect(await budget.reserve('user-1')).not.toBeNull();
  });

  it('holds the slot until usage is recorded, then releases it — also when the request fails', async () => {
    const { service, u } = makeService(
      new MockAiProvider().respondTo(MENTOR_COMPOSE_TASK, GOOD_DRAFT),
    );
    const order: string[] = [];
    u.record.mockImplementation(() => {
      order.push('recorded');
      return Promise.resolve();
    });
    await service.ask('user-1', { intent: 'GENERAL_PROGRESS' });
    order.push('returned');
    expect(order).toEqual(['recorded', 'returned']);
    // A failing request (404) still releases the slot.
    await expect(
      service.ask('user-1', { intent: 'JOB_FIT', jobId: '0190f3c2-0000-7000-8000-000000000009' }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await service.ask('user-1', { intent: 'GENERAL_PROGRESS' })).source).toBe('AI');
  });

  it('fails closed (rules answer) when the allowance cannot be checked', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { budget, count } = makeBudget();
    count.mockRejectedValueOnce(new Error('db down'));
    expect(await budget.reserve('user-1')).toBeNull();
    expect(await budget.reserve('user-1')).not.toBeNull(); // the failed check did not leak a slot
    warn.mockRestore();
  });
});

describe('MentorController', () => {
  it('is rate limited with the analysis bucket and validates with the agent’s schema', () => {
    expect(Reflect.getMetadata(ANALYSIS_RATE_LIMIT_KEY, MentorController.prototype.ask)).toBe(true);
    expect(mentorAskSchema.safeParse({ intent: 'GENERAL_PROGRESS', userId: 'x' }).success).toBe(
      false,
    );
  });
});
