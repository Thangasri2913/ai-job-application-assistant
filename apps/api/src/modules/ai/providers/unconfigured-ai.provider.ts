import type { AiProvider } from '../ai-provider.js';
import { AiNotConfiguredError } from '../ai.errors.js';

/** Active when AI_PROVIDER=none. Fails loudly instead of returning fabricated output. */
export class UnconfiguredAiProvider implements AiProvider {
  readonly name = 'none';

  generateStructured(): Promise<unknown> {
    return Promise.reject(new AiNotConfiguredError());
  }
}
