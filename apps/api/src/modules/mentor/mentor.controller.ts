import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MentorAskRequest, MentorResponse } from '@job-assist/shared';
import { AnalysisRateLimit } from '../../common/decorators/analysis-rate-limit.decorator.js';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { mentorAskSchema } from './mentor.dto.js';
import { MentorService } from './mentor.service.js';

/**
 * Career Mentor. Requires authentication (global guard), validates and size-limits the body,
 * and uses the analysis rate-limit bucket. Read-only: proposed actions are returned for the
 * user to confirm through existing endpoints.
 */
@ApiTags('mentor')
@ApiBearerAuth()
@Controller('mentor')
export class MentorController {
  constructor(private readonly mentor: MentorService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @AnalysisRateLimit()
  ask(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(mentorAskSchema)) body: MentorAskRequest,
  ): Promise<MentorResponse> {
    return this.mentor.ask(user.userId, body);
  }
}
