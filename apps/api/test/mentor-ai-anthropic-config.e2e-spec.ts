import type { NestExpressApplication } from '@nestjs/platform-express';
import { AI_PROVIDER } from '../src/modules/ai/ai-provider.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { AnthropicAiProvider } from '../src/modules/ai/providers/anthropic-ai.provider.js';
import { UnconfiguredAiProvider } from '../src/modules/ai/providers/unconfigured-ai.provider.js';
import { MENTOR_AI_PROVIDER, MENTOR_AI_SERVICE } from '../src/modules/mentor/mentor-ai.provider.js';

/**
 * MENTOR_AI_PROVIDER=anthropic wiring, checked without making any request: no mentor question
 * is asked here, so nothing is sent to Anthropic. Uses its own app instance because config is
 * read when the app module loads.
 */
describe('MENTOR_AI_PROVIDER=anthropic wiring (e2e, no provider call)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.MENTOR_AI_PROVIDER = 'anthropic';
    const { createTestApp } = await import('./create-test-app.js');
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    delete process.env.MENTOR_AI_PROVIDER;
  });

  it('enables Anthropic for the mentor only; the global provider stays none', () => {
    expect(process.env.AI_PROVIDER ?? 'none').toBe('none');
    const mentorProvider = app.get(MENTOR_AI_PROVIDER, { strict: false });
    expect(mentorProvider).toBeInstanceOf(AnthropicAiProvider);
    expect(app.get<AiService>(MENTOR_AI_SERVICE, { strict: false })).toMatchObject({
      providerName: 'anthropic',
      enabled: true,
    });
    expect(app.get(AI_PROVIDER, { strict: false })).toBeInstanceOf(UnconfiguredAiProvider);
    expect(app.get(AiService, { strict: false })).toMatchObject({
      providerName: 'none',
      enabled: false,
    });
  });
});
