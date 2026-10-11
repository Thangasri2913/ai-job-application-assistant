import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../config/config.module.js';
import { AI_PROVIDER, type AiProvider } from './ai-provider.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiService } from './ai.service.js';
import { AnthropicAiProvider } from './providers/anthropic-ai.provider.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';
import { UnconfiguredAiProvider } from './providers/unconfigured-ai.provider.js';

/**
 * Provider selected by AI_PROVIDER: none (default, AI disabled), mock (tests/dev), anthropic.
 * Other vendors are added as further AiProvider implementations.
 */
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): AiProvider => {
        switch (config.get('AI_PROVIDER', { infer: true })) {
          case 'anthropic':
            return new AnthropicAiProvider({
              model: config.get('AI_MODEL', { infer: true }),
              apiKey: config.get('ANTHROPIC_API_KEY', { infer: true }),
            });
          case 'mock':
            return new MockAiProvider();
          case 'none':
            return new UnconfiguredAiProvider();
        }
      },
    },
    AiService,
    AiUsageService,
  ],
  exports: [AiService, AiUsageService],
})
export class AiModule {}
