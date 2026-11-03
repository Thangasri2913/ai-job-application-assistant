import { Logger } from '@nestjs/common';
import { AnthropicAiProvider } from '../ai/providers/anthropic-ai.provider.js';
import { UnconfiguredAiProvider } from '../ai/providers/unconfigured-ai.provider.js';
import { createMentorAiProvider } from './mentor-ai.provider.js';

const SECRET = 'sk-ant-test-not-a-real-key-123';
const config = (values: Record<string, unknown>) => ({
  get: (key: string) => ({ MENTOR_AI_PROVIDER: 'none', AI_MODEL: 'claude-opus-5', ...values })[key],
});

describe('createMentorAiProvider', () => {
  let logs: unknown[][];
  beforeEach(() => {
    logs = [];
    for (const level of ['log', 'warn'] as const)
      vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logs.push(args);
      });
  });
  afterEach(() => vi.restoreAllMocks());

  it('is off (unconfigured) by default, whatever credentials exist', async () => {
    const provider = createMentorAiProvider(config({ ANTHROPIC_API_KEY: SECRET }) as never);
    expect(provider).toBeInstanceOf(UnconfiguredAiProvider);
    expect(provider.name).toBe('none');
    await expect(provider.generateStructured({} as never)).rejects.toMatchObject({
      name: 'AiNotConfiguredError',
    });
  });

  it('builds an Anthropic provider for the mentor when MENTOR_AI_PROVIDER=anthropic, without logging the key', () => {
    const provider = createMentorAiProvider(
      config({ MENTOR_AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: SECRET }) as never,
    );
    expect(provider).toBeInstanceOf(AnthropicAiProvider);
    expect(provider).toMatchObject({ name: 'anthropic', model: 'claude-opus-5' });
    expect(JSON.stringify(logs)).not.toContain(SECRET);
    expect(JSON.stringify(logs)).toContain('"apiKeyConfigured":true');
  });

  it('starts without a key (credentials are needed only when a request is made) and says so', () => {
    const provider = createMentorAiProvider(config({ MENTOR_AI_PROVIDER: 'anthropic' }) as never);
    expect(provider).toBeInstanceOf(AnthropicAiProvider);
    expect(JSON.stringify(logs)).toContain('ANTHROPIC_API_KEY is not set');
  });
});
