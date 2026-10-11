import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  ApplicationPreparationDetail,
  ApplicationQuestionItem,
  CoverLetterResponse,
  ResumeSuggestionItem,
  ResumeSuggestionsResponse,
  TailoredResumeDraft,
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
import { ApplicationPreparationService } from './application-preparation.service.js';
import {
  CreateQuestionDto,
  GenerateCoverLetterDto,
  SuggestionDecisionDto,
  UpdateCoverLetterDto,
  UpdateQuestionDto,
} from './dto/preparation.dto.js';

/** Malformed ids are reported like missing ones (404). */
const id = (name: string) =>
  Param(name, new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));
const AppId = () => id('applicationId');

/**
 * AI application preparation. Generation endpoints share the stricter `analysis` rate limit
 * (AI-backed work). Nothing here submits anything anywhere.
 */
@ApiTags('application preparation')
@ApiBearerAuth()
@Controller('applications/:applicationId')
export class ApplicationPreparationController {
  constructor(private readonly prep: ApplicationPreparationService) {}

  @Post('preparation')
  @HttpCode(HttpStatus.OK)
  start(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationPreparationDetail> {
    return this.prep.start(u.userId, appId, ctx);
  }

  @Get('preparation')
  get(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
  ): Promise<ApplicationPreparationDetail> {
    return this.prep.get(u.userId, appId);
  }

  @Post('preparation/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationPreparationDetail> {
    return this.prep.approve(u.userId, appId, ctx);
  }

  @Post('preparation/resume-suggestions')
  @HttpCode(HttpStatus.OK)
  @AnalysisRateLimit()
  generateSuggestions(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeSuggestionsResponse> {
    return this.prep.generateSuggestions(u.userId, appId, ctx);
  }

  @Get('preparation/resume-suggestions')
  listSuggestions(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
  ): Promise<ResumeSuggestionsResponse> {
    return this.prep.listSuggestions(u.userId, appId);
  }

  @Patch('preparation/resume-suggestions/:suggestionId')
  decideSuggestion(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('suggestionId') suggestionId: string,
    @Body() dto: SuggestionDecisionDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeSuggestionItem> {
    return this.prep.decideSuggestion(u.userId, appId, suggestionId, dto, ctx);
  }

  @Get('preparation/tailored-resume')
  tailoredResume(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
  ): Promise<TailoredResumeDraft> {
    return this.prep.tailoredDraft(u.userId, appId);
  }

  @Post('preparation/cover-letter')
  @HttpCode(HttpStatus.OK)
  @AnalysisRateLimit()
  generateCoverLetter(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @Body() dto: GenerateCoverLetterDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<CoverLetterResponse> {
    return this.prep.generateCoverLetter(u.userId, appId, dto.mode, ctx);
  }

  @Get('preparation/cover-letter')
  getCoverLetter(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
  ): Promise<CoverLetterResponse> {
    return this.prep.getCoverLetter(u.userId, appId);
  }

  @Patch('preparation/cover-letter')
  updateCoverLetter(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @Body() dto: UpdateCoverLetterDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<CoverLetterResponse> {
    return this.prep.updateCoverLetter(u.userId, appId, dto.text, ctx);
  }

  @Post('preparation/cover-letter/approve')
  @HttpCode(HttpStatus.OK)
  approveCoverLetter(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<CoverLetterResponse> {
    return this.prep.approveCoverLetter(u.userId, appId, ctx);
  }

  @Get('questions')
  listQuestions(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
  ): Promise<ApplicationQuestionItem[]> {
    return this.prep.listQuestions(u.userId, appId);
  }

  @Post('questions')
  addQuestion(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @Body() dto: CreateQuestionDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationQuestionItem> {
    return this.prep.addQuestion(u.userId, appId, dto, ctx);
  }

  @Post('questions/:questionId/generate')
  @HttpCode(HttpStatus.OK)
  @AnalysisRateLimit()
  generateAnswer(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('questionId') questionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationQuestionItem> {
    return this.prep.generateAnswer(u.userId, appId, questionId, ctx);
  }

  @Patch('questions/:questionId')
  updateQuestion(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationQuestionItem> {
    return this.prep.updateQuestion(u.userId, appId, questionId, dto, ctx);
  }

  @Post('questions/:questionId/approve')
  @HttpCode(HttpStatus.OK)
  approveAnswer(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('questionId') questionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationQuestionItem> {
    return this.prep.approveAnswer(u.userId, appId, questionId, ctx);
  }

  @Delete('questions/:questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteQuestion(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('questionId') questionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    return this.prep.deleteQuestion(u.userId, appId, questionId, ctx);
  }
}
