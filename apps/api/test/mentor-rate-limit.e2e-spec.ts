import type { NestExpressApplication } from '@nestjs/platform-express';

/** Own app instance with a tiny analysis limit (config is read when the app module loads). */
describe('Career Mentor rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.JOB_ANALYSIS_RATE_LIMIT_MAX = '2';
    const { createTestApp, resetDatabase } = await import('./create-test-app.js');
    const created = await createTestApp();
    app = created.app;
    await resetDatabase(created.prisma);
  });

  afterAll(async () => {
    await app.close();
    process.env.JOB_ANALYSIS_RATE_LIMIT_MAX = '1000';
  });

  it('limits mentor questions with the analysis bucket', async () => {
    const { signUp } = await import('./support/api-client.js');
    const user = await signUp(app);
    await user.post('/mentor/ask', { intent: 'GENERAL_PROGRESS' }).expect(200);
    await user.post('/mentor/ask', { intent: 'GENERAL_PROGRESS' }).expect(200);
    const limited = await user.post('/mentor/ask', { intent: 'GENERAL_PROGRESS' }).expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    await user.get('/learning/preferences').expect(200);
  });
});
