/** Runs Smart Apply background work (preparation, submission attempts). */
export abstract class SmartApplyDispatcher {
  abstract prepare(smartApplicationId: string, userId: string): void;
  abstract submit(attemptId: string, userId: string): void;
  /** Waits for all queued work (tests, shutdown). */
  abstract drain(): Promise<void>;
}
