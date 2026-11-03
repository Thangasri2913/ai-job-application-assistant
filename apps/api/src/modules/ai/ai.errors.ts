import type { z } from 'zod';

export class AiNotConfiguredError extends Error {
  constructor() {
    super('No AI provider is configured (AI_PROVIDER=none).');
    this.name = 'AiNotConfiguredError';
  }
}

/** The model returned data that does not match the expected schema. Never persist such output. */
export class AiOutputValidationError extends Error {
  constructor(
    readonly task: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(`AI output for task "${task}" failed schema validation (${issues.length} issue(s)).`);
    this.name = 'AiOutputValidationError';
  }
}

/** The caller cancelled the request (e.g. a deadline passed). Not retryable; nothing to persist. */
export class AiAbortedError extends Error {
  constructor() {
    super('The AI request was cancelled.');
    this.name = 'AiAbortedError';
  }
}

/** The provider call itself failed (network, rate limit, refusal, truncated output). */
export class AiProviderError extends Error {
  constructor(
    message: string,
    /** True when retrying later may succeed (rate limits, overload, network). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
