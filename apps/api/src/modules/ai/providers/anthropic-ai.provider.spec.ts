import type Anthropic from '@anthropic-ai/sdk';
import { AiProviderError } from '../ai.errors.js';
import { AnthropicAiProvider } from './anthropic-ai.provider.js';
import { toStructuredOutputSchema } from './structured-output-schema.js';

const request = {
  task: 'resume.structure',
  system: 'Extract.',
  input: 'Priya Sharma — Angular',
  outputSchema: {
    type: 'object',
    properties: { name: { type: 'string', minLength: 1 } },
    required: ['name'],
  },
};

function providerReturning(message: Partial<Anthropic.Beta.BetaMessage>) {
  const create = vi.fn().mockResolvedValue({ content: [], stop_reason: 'end_turn', ...message });
  const client = { beta: { messages: { create } } } as unknown as Anthropic;
  return { provider: new AnthropicAiProvider({ model: 'claude-opus-5' }, client), create };
}

describe('AnthropicAiProvider', () => {
  it('requests structured output with the sanitised schema and fallbacks enabled', async () => {
    const { provider, create } = providerReturning({
      content: [{ type: 'text', text: '{"name":"Priya"}' }] as never,
    });
    await expect(provider.generateStructured(request)).resolves.toEqual({ name: 'Priya' });

    const params = create.mock.calls[0]![0];
    expect(params).toMatchObject({
      model: 'claude-opus-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: 'Extract.',
      messages: [{ role: 'user', content: 'Priya Sharma — Angular' }],
      output_config: { format: { type: 'json_schema' } },
    });
    expect(params.output_config.format.schema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    });
  });

  it.each([
    ['refusal', { stop_reason: 'refusal' }],
    ['truncation', { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"na' }] }],
    ['missing text', { content: [] }],
    ['invalid JSON', { content: [{ type: 'text', text: 'not json' }] }],
  ])('turns %s into a non-retryable AiProviderError', async (_label, message) => {
    const { provider } = providerReturning(message as never);
    const error = await provider.generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).retryable).toBe(false);
  });
});

describe('toStructuredOutputSchema', () => {
  it('drops unsupported constraints and closes every object', () => {
    const schema = toStructuredOutputSchema({
      $schema: 'x',
      type: 'object',
      properties: {
        tags: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 40 } },
        nested: { type: 'object', properties: { n: { type: 'number', minimum: 0 } } },
      },
    });
    expect(schema).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['tags', 'nested'],
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
        nested: {
          type: 'object',
          additionalProperties: false,
          required: ['n'],
          properties: { n: { type: 'number' } },
        },
      },
    });
  });
});
