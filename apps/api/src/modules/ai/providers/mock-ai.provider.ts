import type { AiProvider, StructuredGenerationRequest } from '../ai-provider.js';

/**
 * Deterministic provider for tests and local development of AI-backed features.
 * Returns only responses explicitly registered per task — it never invents content.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly requests: StructuredGenerationRequest[] = [];
  private readonly responses = new Map<string, unknown>();

  respondTo(task: string, output: unknown): this {
    this.responses.set(task, output);
    return this;
  }

  generateStructured(request: StructuredGenerationRequest): Promise<unknown> {
    this.requests.push(request);
    if (!this.responses.has(request.task)) {
      return Promise.reject(
        new Error(`MockAiProvider has no response registered for task "${request.task}"`),
      );
    }
    return Promise.resolve(structuredClone(this.responses.get(request.task)));
  }
}
