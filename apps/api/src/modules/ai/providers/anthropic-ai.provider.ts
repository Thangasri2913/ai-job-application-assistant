import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, StructuredGenerationRequest } from '../ai-provider.js';
import { AiAbortedError, AiProviderError } from '../ai.errors.js';
import { toStructuredOutputSchema } from './structured-output-schema.js';

export interface AnthropicProviderOptions {
  model: string;
  /** Optional; when unset the SDK resolves credentials from the environment. */
  apiKey?: string;
  maxTokens?: number;
}

/**
 * Claude via the official Anthropic SDK, using structured outputs (`output_config.format`)
 * so the response is constrained to the task's JSON Schema. The SDK already retries
 * 408/409/429/5xx and connection errors (2 retries); failures surface as AiProviderError.
 */
export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';

  get model(): string {
    return this.options.model;
  }

  constructor(
    private readonly options: AnthropicProviderOptions,
    private readonly client: Anthropic = new Anthropic({
      apiKey: options.apiKey,
      timeout: 120_000,
      maxRetries: 2,
    }),
  ) {}

  async generateStructured(request: StructuredGenerationRequest): Promise<unknown> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create(
        {
          model: this.options.model,
          max_tokens: this.options.maxTokens ?? 16_000,
          // If the model declines, Anthropic retries on its recommended fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: request.system,
          messages: [{ role: 'user', content: request.input }],
          // Extraction is a routine task: low effort keeps latency and cost down.
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: toStructuredOutputSchema(request.outputSchema) },
          },
        },
        // The SDK aborts the in-flight HTTP request and skips remaining retries on abort.
        request.signal ? { signal: request.signal } : undefined,
      );
    } catch (error) {
      if (error instanceof Anthropic.APIUserAbortError || request.signal?.aborted)
        throw new AiAbortedError();
      throw toProviderError(error);
    }

    if (response.stop_reason === 'refusal')
      throw new AiProviderError('The AI provider declined this request.', false);
    if (response.stop_reason === 'max_tokens')
      throw new AiProviderError('The AI response was cut off before completion.', false);

    const text = response.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
    )?.text;
    if (!text) throw new AiProviderError('The AI response contained no output.', false);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiProviderError('The AI response was not valid JSON.', false);
    }
  }
}

function toProviderError(error: unknown): AiProviderError {
  if (error instanceof Anthropic.RateLimitError)
    return new AiProviderError('AI provider rate limit reached.', true);
  if (error instanceof Anthropic.AuthenticationError)
    return new AiProviderError('AI provider credentials are invalid.', false);
  if (error instanceof Anthropic.BadRequestError)
    return new AiProviderError('AI provider rejected the request.', false);
  if (error instanceof Anthropic.APIConnectionError)
    return new AiProviderError('Could not reach the AI provider.', true);
  if (error instanceof Anthropic.APIError) {
    const status: number = typeof error.status === 'number' ? error.status : 0;
    return new AiProviderError(`AI provider error (${status}).`, status >= 500);
  }
  return new AiProviderError('Unexpected AI provider failure.', false);
}
