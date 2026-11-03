import { Injectable, Logger } from '@nestjs/common';
import { MENTOR_COMPOSE_TASK } from '@job-assist/career-mentor-agent';
import { AppConfigService } from '../../config/config.module.js';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * Per-user allowance for AI-composed mentor answers, separate from the IP-based rate limits.
 *
 * - Usage is counted from existing `ai_usage` rows (operation `mentor.compose`; ids and outcome
 *   only, no prompts or content), so the count survives restarts and is shared by every API
 *   instance using the same database. No new table or migration.
 * - Each instance allows one AI composition per user at a time (an in-memory set, checked and
 *   claimed synchronously before any await), so concurrent requests from one user cannot pass
 *   the count together. Across several instances, each could admit one concurrent request, so
 *   the limit can be exceeded by at most (instances − 1) in a race. The deployment runs one
 *   instance (render.yaml).
 * - The slot is held until the caller has recorded usage, so the next count includes it.
 * - Denial never blocks the mentor: the caller answers by rules instead.
 */
@Injectable()
export class MentorAiBudget {
  private readonly logger = new Logger(MentorAiBudget.name);
  private readonly inFlight = new Set<string>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.limit = config.get('MENTOR_AI_USER_LIMIT', { infer: true });
    this.windowMs = config.get('MENTOR_AI_USER_WINDOW_SECONDS', { infer: true }) * 1000;
  }

  /**
   * Claims one AI composition for the user. Returns a release function (call it after usage is
   * recorded), or null when the allowance is used up or another AI answer for this user is in
   * progress on this instance.
   */
  async reserve(userId: string): Promise<(() => void) | null> {
    if (this.limit === 0 || this.inFlight.has(userId)) return null;
    this.inFlight.add(userId); // claimed before the first await
    let used: number;
    try {
      used = await this.prisma.aiUsage.count({
        where: {
          userId,
          operation: MENTOR_COMPOSE_TASK,
          createdAt: { gte: new Date(Date.now() - this.windowMs) },
        },
      });
    } catch (error) {
      // Fail closed: without a count the allowance cannot be checked, so answer by rules.
      this.inFlight.delete(userId);
      this.logger.warn({ err: error }, 'Could not check the mentor AI allowance');
      return null;
    }
    if (used >= this.limit) {
      this.inFlight.delete(userId);
      return null;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight.delete(userId);
    };
  }
}
