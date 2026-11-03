import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfigService } from '../../config/config.module.js';
import type { AiProvider } from '../ai/ai-provider.js';
import { AiService } from '../ai/ai.service.js';
import { AnthropicAiProvider } from '../ai/providers/anthropic-ai.provider.js';
import { UnconfiguredAiProvider } from '../ai/providers/unconfigured-ai.provider.js';

/**
 * The Career Mentor's own AI connection, selected by MENTOR_AI_PROVIDER and independent of the
 * global AI_PROVIDER. These tokens are provided only inside MentorModule (not exported), so no
 * other feature can inject them; every other feature keeps the shared AiService from AiModule.
 */
export const MENTOR_AI_PROVIDER = Symbol('MENTOR_AI_PROVIDER');
export const MENTOR_AI_SERVICE = Symbol('MENTOR_AI_SERVICE');

export function createMentorAiProvider(config: AppConfigService): AiProvider {
  const logger = new Logger('MentorAiProvider');
  if (config.get('MENTOR_AI_PROVIDER', { infer: true }) !== 'anthropic') {
    logger.log('Career Mentor AI: off (MENTOR_AI_PROVIDER=none); answers are rule-based');
    return new UnconfiguredAiProvider();
  }
  const model = config.get('AI_MODEL', { infer: true });
  const apiKey = config.get('ANTHROPIC_API_KEY', { infer: true });
  // Never log the key itself — only whether one is configured.
  logger.warn(
    {
      model,
      apiKeyConfigured: Boolean(apiKey),
    },
    'Career Mentor AI: ON (MENTOR_AI_PROVIDER=anthropic) — for the mentor only',
  );
  if (!apiKey)
    logger.warn(
      'ANTHROPIC_API_KEY is not set: the SDK will try ANTHROPIC_AUTH_TOKEN or an `ant` profile; without credentials every mentor request falls back to rules',
    );
  return new AnthropicAiProvider({ model, apiKey });
}

export const mentorAiProviders: Provider[] = [
  {
    provide: MENTOR_AI_PROVIDER,
    inject: [ConfigService],
    useFactory: createMentorAiProvider,
  },
  {
    provide: MENTOR_AI_SERVICE,
    inject: [MENTOR_AI_PROVIDER],
    // A separate AiService instance: same validation and cancellation, different provider.
    useFactory: (provider: AiProvider) => new AiService(provider),
  },
];
