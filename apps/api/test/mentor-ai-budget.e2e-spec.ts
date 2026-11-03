import { MENTOR_COMPOSE_TASK } from '@job-assist/career-mentor-agent';
import type { MentorResponse } from '@job-assist/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { MockAiProvider } from '../src/modules/ai/providers/mock-ai.provider.js';
import type { createTestApp as CreateTestApp } from './create-test-app.js';
import type { signUp as SignUp, TestUser } from './support/api-client.js';

const GOOD = { picks: ['R1'] };

/**
 * Per-user mentor AI allowance against the real ai_usage table. Uses its own app instances with
 * a tiny limit (config is read when the app module loads).
 */
describe('Career Mentor per-user AI allowance (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let provider: MockAiProvider;
  let createTestApp: typeof CreateTestApp;
  let signUp: typeof SignUp;

  const ask = async (u: TestUser) =>
    (await u.post('/mentor/ask', { intent: 'GENERAL_PROGRESS' }).expect(200))
      .body as MentorResponse;

  beforeAll(async () => {
    process.env.MENTOR_AI_USER_LIMIT = '2';
    ({ createTestApp } = await import('./create-test-app.js'));
    ({ signUp } = await import('./support/api-client.js'));
    const { resetDatabase } = await import('./create-test-app.js');
    provider = new MockAiProvider().respondTo(MENTOR_COMPOSE_TASK, GOOD);
    ({ app, prisma } = await createTestApp({ mentorAiProvider: provider }));
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.MENTOR_AI_USER_LIMIT;
  });

  it('allows AI up to the limit, then answers by rules; other users are unaffected', async () => {
    const user = await signUp(app, 'Budget user');
    expect((await ask(user)).source).toBe('AI');
    expect((await ask(user)).source).toBe('AI');
    const third = await ask(user);
    expect(third).toMatchObject({ source: 'RULES', fallbackReason: 'AI_LIMIT_REACHED' });
    expect(third.recommendations.length).toBeGreaterThan(0);

    const other = await signUp(app, 'Other budget user');
    expect((await ask(other)).source).toBe('AI');

    // Usage is tracked by ids and outcome only.
    const rows = await prisma.aiUsage.findMany({ where: { userId: user.userId } });
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual([
        'applicationId',
        'attempts',
        'createdAt',
        'id',
        'model',
        'operation',
        'provider',
        'status',
        'userId',
      ]);
  });

  it('does not let concurrent requests pass the limit together', async () => {
    const user = await signUp(app, 'Concurrent user');
    provider.respondTo(MENTOR_COMPOSE_TASK, GOOD, { delayMs: 50 });
    try {
      const answers = await Promise.all([1, 2, 3, 4].map(() => ask(user)));
      expect(answers.filter((a) => a.source === 'AI')).toHaveLength(1);
      expect(answers.filter((a) => a.fallbackReason === 'AI_LIMIT_REACHED')).toHaveLength(3);
    } finally {
      provider.respondTo(MENTOR_COMPOSE_TASK, GOOD);
    }
    expect(await prisma.aiUsage.count({ where: { userId: user.userId } })).toBe(1);
  });

  it('keeps counting across an API restart (usage is read from the database)', async () => {
    const user = await signUp(app, 'Restart user');
    await ask(user);
    await ask(user);
    const restarted = await createTestApp({ mentorAiProvider: provider });
    try {
      // Same user, same database, fresh process state.
      const again = (
        await request(restarted.app.getHttpServer())
          .post('/api/v1/mentor/ask')
          .set('Authorization', `Bearer ${user.token}`)
          .send({ intent: 'GENERAL_PROGRESS' })
          .expect(200)
      ).body as MentorResponse;
      expect(again).toMatchObject({ source: 'RULES', fallbackReason: 'AI_LIMIT_REACHED' });
    } finally {
      await restarted.app.close();
    }
  });

  it('spends nothing and still answers when AI is disabled', async () => {
    const disabled = await createTestApp();
    try {
      const user = await signUp(disabled.app, 'No AI user');
      for (let i = 0; i < 3; i += 1) {
        const res = (await user.post('/mentor/ask', { intent: 'GENERAL_PROGRESS' }).expect(200))
          .body as MentorResponse;
        expect(res).toMatchObject({ source: 'RULES', fallbackReason: 'AI_DISABLED' });
      }
      expect(await prisma.aiUsage.count({ where: { userId: user.userId } })).toBe(0);
    } finally {
      await disabled.app.close();
    }
  });
});
