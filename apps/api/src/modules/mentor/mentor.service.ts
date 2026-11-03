import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  MENTOR_COMPOSE_TASK,
  MentorAgentError,
  runCareerMentorAgent,
} from '@job-assist/career-mentor-agent';
import type { MentorAskRequest, MentorResponse } from '@job-assist/shared';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AiUsageService } from '../ai/ai-usage.service.js';
import { AiService } from '../ai/ai.service.js';
import { MENTOR_AI_SERVICE } from './mentor-ai.provider.js';
import { MentorAiBudget } from './mentor-ai-budget.service.js';
import { MentorTools } from './mentor-tools.js';

/**
 * Career Mentor host (docs/AI-CAREER-MENTOR-ARCHITECTURE.md). The answer is produced by
 * @job-assist/career-mentor-agent with the authenticated user's id, JobAssist's read-only
 * tools and the mentor's own AiService instance, selected by MENTOR_AI_PROVIDER independently of
 * the global AI_PROVIDER (rules only when MENTOR_AI_PROVIDER=none). This service maps agent
 * errors to HTTP errors, applies the per-user AI allowance (MentorAiBudget), records AI usage
 * (ids and outcome only) and logs counts only — never the message, prompt, facts or answer.
 * No conversation is saved.
 */
@Injectable()
export class MentorService {
  private readonly logger = new Logger(MentorService.name);

  constructor(
    private readonly tools: MentorTools,
    // The mentor's own AiService (MENTOR_AI_PROVIDER), not the shared one (AI_PROVIDER).
    @Inject(MENTOR_AI_SERVICE) private readonly ai: AiService,
    private readonly usage: AiUsageService,
    private readonly budget: MentorAiBudget,
  ) {}

  async ask(userId: string, request: MentorAskRequest): Promise<MentorResponse> {
    // Only spend the allowance when AI is on; the rules answer is always available.
    const release = this.ai.enabled ? await this.budget.reserve(userId) : null;
    try {
      return await this.answer(userId, request, this.ai.enabled && !release);
    } finally {
      // After usage is recorded, so the next allowance check counts this answer.
      release?.();
    }
  }

  private async answer(
    userId: string,
    request: MentorAskRequest,
    aiLimitReached: boolean,
  ): Promise<MentorResponse> {
    let result: Awaited<ReturnType<typeof runCareerMentorAgent>>;
    try {
      result = await runCareerMentorAgent({ userId }, request, {
        tools: this.tools,
        model: this.ai,
        ...(aiLimitReached ? { aiBlockedReason: 'AI_LIMIT_REACHED' as const } : {}),
      });
    } catch (error) {
      if (error instanceof MentorAgentError)
        throw error.code === 'JOB_NOT_FOUND'
          ? new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, error.message)
          : new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, error.message);
      throw error;
    }

    const { telemetry } = result;
    if (telemetry.modelOutcome)
      await this.usage.record({
        userId,
        operation: MENTOR_COMPOSE_TASK,
        provider: this.ai.providerName,
        model: this.ai.modelName,
        status: telemetry.modelOutcome,
        attempts: telemetry.modelAttempts,
      });
    if (
      telemetry.fallbackReason &&
      telemetry.fallbackReason !== 'AI_DISABLED' &&
      telemetry.fallbackReason !== 'AI_LIMIT_REACHED'
    )
      this.logger.warn(
        {
          intent: request.intent,
          fallbackReason: telemetry.fallbackReason,
          attempts: telemetry.modelAttempts,
          rejectedDraftProblems: telemetry.rejectedDraftProblems,
        },
        'Mentor AI answer not used; rules answer returned',
      );
    if (telemetry.droppedRecommendations)
      this.logger.warn(
        { intent: request.intent, dropped: telemetry.droppedRecommendations },
        'Mentor recommendations dropped by validation',
      );
    return result.response;
  }
}
