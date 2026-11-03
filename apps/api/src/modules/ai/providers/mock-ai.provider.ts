import type { AiProvider, StructuredGenerationRequest } from '../ai-provider.js';
import { AiAbortedError } from '../ai.errors.js';

/**
 * Deterministic provider for tests and local development of AI-backed features.
 * Returns only responses explicitly registered per task — it never invents content.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly requests: StructuredGenerationRequest[] = [];
  /** Requests whose abort signal fired while they were pending (simulated cancellation). */
  cancelled = 0;
  private readonly responses = new Map<string, unknown>();
  private readonly delays = new Map<string, number>();

  /** `delayMs` simulates a slow provider; the response is abandoned if the signal aborts first. */
  respondTo(task: string, output: unknown, options: { delayMs?: number } = {}): this {
    this.responses.set(task, output);
    if (options.delayMs) this.delays.set(task, options.delayMs);
    else this.delays.delete(task);
    return this;
  }

  generateStructured(request: StructuredGenerationRequest): Promise<unknown> {
    this.requests.push(request);
    if (request.signal?.aborted) return Promise.reject(new AiAbortedError());
    if (!this.responses.has(request.task)) {
      return Promise.reject(
        new Error(`MockAiProvider has no response registered for task "${request.task}"`),
      );
    }
    const output = structuredClone(this.responses.get(request.task));
    const delay = this.delays.get(request.task);
    if (!delay) return Promise.resolve(output);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        request.signal?.removeEventListener('abort', onAbort);
        resolve(output);
      }, delay);
      const onAbort = () => {
        clearTimeout(timer);
        this.cancelled += 1;
        reject(new AiAbortedError());
      };
      request.signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
