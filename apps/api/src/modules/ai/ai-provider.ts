/**
 * Provider-agnostic contract for LLM calls. Feature code never talks to a vendor SDK
 * directly — it goes through AiService, which validates every structured output.
 * See docs/AI_ARCHITECTURE.md.
 */
export interface StructuredGenerationRequest {
  /** Stable identifier of the calling capability, e.g. `job.analyze`. Used for logging/usage metering. */
  task: string;
  /** Instructions, including the no-fabrication rules for the task. */
  system: string;
  /** The user-provided source material (resume text, job description…). */
  input: string;
  /** JSON Schema the provider must constrain its output to (structured outputs / tool schema). */
  outputSchema: Record<string, unknown>;
  /**
   * Optional cancellation. When it aborts, providers should cancel the underlying request
   * (and any retries) and reject with AiAbortedError.
   */
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly name: string;
  /** Model identifier, when the provider has one (recorded in usage, never sent to clients). */
  readonly model?: string;
  /** Returns the raw parsed JSON produced by the model. Not yet trusted — AiService validates it. */
  generateStructured(request: StructuredGenerationRequest): Promise<unknown>;
}

/** DI token for the active provider. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
