/**
 * Generates career insights outside the request. Callers only see this abstraction, so it can
 * be replaced by a queue-backed implementation (ADR-0005) without touching them.
 */
export abstract class CareerInsightsDispatcher {
  abstract dispatch(runId: string): void;
  /** Resolves when all currently scheduled work has finished (tests, shutdown). */
  abstract drain(): Promise<void>;
}
