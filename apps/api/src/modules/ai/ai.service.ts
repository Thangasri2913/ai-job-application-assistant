import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AI_PROVIDER, type AiProvider } from './ai-provider.js';
import { AiAbortedError, AiOutputValidationError } from './ai.errors.js';

export interface StructuredTask<T> {
  task: string;
  system: string;
  input: string;
  schema: z.ZodType<T>;
  /** Cancels the provider request when aborted (see AiProvider). */
  signal?: AbortSignal;
}

/**
 * The only entry point feature code uses for AI. Guarantees that whatever is returned
 * has been validated against the task's schema — invalid output throws and must not be persisted.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  get modelName(): string | null {
    return this.provider.model ?? null;
  }

  /** False when no provider is configured (AI_PROVIDER=none). */
  get enabled(): boolean {
    return this.provider.name !== 'none';
  }

  async generateStructured<T>({
    task,
    system,
    input,
    schema,
    signal,
  }: StructuredTask<T>): Promise<T> {
    if (signal?.aborted) throw new AiAbortedError();
    const raw = await this.provider.generateStructured({
      task,
      system,
      input,
      // The model must produce the schema's *input* shape; transforms run during validation.
      outputSchema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }),
      ...(signal ? { signal } : {}),
    });
    // A provider that finished after cancellation: its output is no longer wanted.
    if (signal?.aborted) throw new AiAbortedError();

    const result = schema.safeParse(raw);
    if (!result.success) {
      // Log shape problems only — never the raw output, which may contain user data.
      this.logger.warn(
        {
          task,
          provider: this.provider.name,
          issues: result.error.issues.map((i) => ({ path: i.path, code: i.code })),
        },
        'AI output rejected by schema validation',
      );
      throw new AiOutputValidationError(task, result.error.issues);
    }
    return result.data;
  }
}
