import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  InterviewFocusAreas,
  InterviewQuestionItem,
  InterviewReport,
  InterviewSessionDetail,
  InterviewSessionSummary,
} from '@job-assist/shared';
import { AnalysisRateLimit } from '../../common/decorators/analysis-rate-limit.decorator.js';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type RequestContext,
  ReqContext,
} from '../../common/decorators/request-context.decorator.js';
import { CreateInterviewDto, SubmitAnswerDto } from './dto/interview.dto.js';
import { InterviewsService } from './interviews.service.js';

/** Malformed ids are reported like missing ones (404). */
const id = (name: string) =>
  Param(name, new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));

@ApiTags('interviews')
@ApiBearerAuth()
@Controller()
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get('applications/:applicationId/interview-focus')
  focus(
    @CurrentUser() u: AuthenticatedUser,
    @id('applicationId') appId: string,
  ): Promise<InterviewFocusAreas> {
    return this.interviews.focus(u.userId, appId);
  }

  @Post('applications/:applicationId/interviews')
  create(
    @CurrentUser() u: AuthenticatedUser,
    @id('applicationId') appId: string,
    @Body() dto: CreateInterviewDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    return this.interviews.create(u.userId, appId, dto, ctx);
  }

  @Get('applications/:applicationId/interviews')
  listForApplication(
    @CurrentUser() u: AuthenticatedUser,
    @id('applicationId') appId: string,
  ): Promise<InterviewSessionSummary[]> {
    return this.interviews.list(u.userId, appId);
  }

  /** Interview history across all applications. */
  @Get('interviews')
  list(@CurrentUser() u: AuthenticatedUser): Promise<InterviewSessionSummary[]> {
    return this.interviews.list(u.userId);
  }

  @Get('interviews/:sessionId')
  get(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
  ): Promise<InterviewSessionDetail> {
    return this.interviews.get(u.userId, sessionId);
  }

  @Post('interviews/:sessionId/questions/generate')
  @HttpCode(HttpStatus.OK)
  @AnalysisRateLimit()
  generate(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    return this.interviews.generateQuestions(u.userId, sessionId, ctx);
  }

  @Get('interviews/:sessionId/questions')
  async questions(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
  ): Promise<InterviewQuestionItem[]> {
    return (await this.interviews.get(u.userId, sessionId)).questions;
  }

  @Post('interviews/:sessionId/start')
  @HttpCode(HttpStatus.OK)
  start(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    return this.interviews.start(u.userId, sessionId, ctx);
  }

  @Post('interviews/:sessionId/questions/:questionId/answer')
  @HttpCode(HttpStatus.OK)
  answer(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
    @id('questionId') questionId: string,
    @Body() dto: SubmitAnswerDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    return this.interviews.answer(u.userId, sessionId, questionId, dto.answer, ctx);
  }

  @Post('interviews/:sessionId/questions/:questionId/evaluate')
  @HttpCode(HttpStatus.OK)
  @AnalysisRateLimit()
  evaluate(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
    @id('questionId') questionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    return this.interviews.evaluate(u.userId, sessionId, questionId, ctx);
  }

  @Post('interviews/:sessionId/complete')
  @HttpCode(HttpStatus.OK)
  @AnalysisRateLimit()
  complete(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<InterviewReport> {
    return this.interviews.complete(u.userId, sessionId, ctx);
  }

  @Post('interviews/:sessionId/abandon')
  @HttpCode(HttpStatus.OK)
  abandon(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    return this.interviews.abandon(u.userId, sessionId, ctx);
  }

  @Get('interviews/:sessionId/report')
  report(
    @CurrentUser() u: AuthenticatedUser,
    @id('sessionId') sessionId: string,
  ): Promise<InterviewReport> {
    return this.interviews.report(u.userId, sessionId);
  }
}
