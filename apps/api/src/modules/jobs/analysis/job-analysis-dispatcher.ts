/**
 * Schedules job analysis outside the request. Callers only see this abstraction, so it can
 * be replaced by a BullMQ-backed implementation (ADR-0005) without touching them.
 */
export abstract class JobAnalysisDispatcher {
  abstract dispatch(analysisId: string): void;
  /** Resolves when all currently scheduled work has finished (tests, shutdown). */
  abstract drain(): Promise<void>;
}
