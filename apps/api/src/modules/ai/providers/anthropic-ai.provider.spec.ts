import Anthropic from '@anthropic-ai/sdk';
import { AiAbortedError, AiProviderError } from '../ai.errors.js';
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

describe('AnthropicAiProvider cancellation', () => {
  it('passes the abort signal to the SDK request', async () => {
    const { provider, create } = providerReturning({
      content: [{ type: 'text', text: '{"name":"Priya"}' }] as never,
    });
    const controller = new AbortController();
    await provider.generateStructured({ ...request, signal: controller.signal });
    expect(create.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });

  it('maps an SDK abort to AiAbortedError (not a provider outage)', async () => {
    const create = vi.fn().mockRejectedValue(new Anthropic.APIUserAbortError());
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    const provider = new AnthropicAiProvider({ model: 'claude-opus-5' }, client);
    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(AiAbortedError);
  });

  /**
   * Uses the real SDK client with an injected fetch (no network, dummy key): checks that the
   * SDK's own plumbing aborts the in-flight HTTP request and does not retry after the abort.
   * It cannot show what the remote service does with a request it had already received.
   */
  it('with the real SDK client, aborting cancels the in-flight fetch and starts no retry', async () => {
    const fetchCalls: { aborted: () => boolean }[] = [];
    const fakeFetch = (_url: unknown, init?: { signal?: AbortSignal }) => {
      const signal = init?.signal;
      fetchCalls.push({ aborted: () => Boolean(signal?.aborted) });
      return new Promise<Response>((_, reject) => {
        signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    };
    const client = new Anthropic({
      apiKey: 'test-key-not-real',
      baseURL: 'http://127.0.0.1:9',
      maxRetries: 2,
      timeout: 60_000,
      fetch: fakeFetch as never,
    });
    const provider = new AnthropicAiProvider({ model: 'claude-opus-5' }, client);
    const controller = new AbortController();
    const pending = provider.generateStructured({ ...request, signal: controller.signal });
    await vi.waitFor(() => expect(fetchCalls).toHaveLength(1));
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(AiAbortedError);
    expect(fetchCalls[0]!.aborted()).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCalls).toHaveLength(1); // no retry after the abort
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
