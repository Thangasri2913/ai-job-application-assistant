import type { NestExpressApplication } from '@nestjs/platform-express';
import { buildPdf, SAMPLE_RESUME_LINES } from './support/resume-fixtures.js';

/** Uses its own app instance with a tiny upload limit (config is read when the app module loads). */
describe('Upload rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.UPLOAD_RATE_LIMIT_MAX = '2';
    const { createTestApp, resetDatabase } = await import('./create-test-app.js');
    const created = await createTestApp();
    app = created.app;
    await resetDatabase(created.prisma);
  });

  afterAll(async () => {
    await app.close();
    process.env.UPLOAD_RATE_LIMIT_MAX = '1000';
  });

  it('limits uploads per client without affecting other endpoints', async () => {
    const { signUp } = await import('./support/api-client.js');
    const user = await signUp(app);
    const pdf = buildPdf(SAMPLE_RESUME_LINES);
    await user.upload('/resumes', pdf, 'a.pdf').expect(201);
    await user.upload('/resumes', pdf, 'b.pdf').expect(201);
    const limited = await user.upload('/resumes', pdf, 'c.pdf').expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    await user.get('/resumes').expect(200);
  });
});
