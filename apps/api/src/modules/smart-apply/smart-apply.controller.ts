import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type {
  ProfileAnswerItem,
  SmartApplicationDetail,
  SmartApplicationListResponse,
  SmartApplicationMaterials,
  SmartApplySettingsItem,
  SmartApplyQuestion,
  SubmissionEligibility,
} from '@job-assist/shared';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type RequestContext,
  ReqContext,
} from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  AnswerQuestionDto,
  ListSmartApplicationsQueryDto,
  ManualSubmissionDto,
  PrepareSmartApplicationDto,
  UpdateSmartApplySettingsDto,
} from './dto/smart-apply.dto.js';
import { SmartApplyService } from './smart-apply.service.js';

/** Malformed ids are reported like missing ones (404). */
const id = (name: string) =>
  Param(name, new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));

/**
 * Smart Apply (ADR-0020). The user is always the authenticated principal; ids in the path
 * are checked for ownership (another user's ids behave like missing ones).
 */
@ApiTags('smart-apply')
@ApiBearerAuth()
@Controller('smart-apply')
export class SmartApplyController {
  constructor(private readonly smartApply: SmartApplyService) {}

  @Get('settings')
  settings(@CurrentUser() u: AuthenticatedUser): Promise<SmartApplySettingsItem> {
    return this.smartApply.getSettings(u.userId);
  }

  @Put('settings')
  updateSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: UpdateSmartApplySettingsDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<SmartApplySettingsItem> {
    return this.smartApply.updateSettings(u.userId, dto, ctx);
  }

  @Get('applications')
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: ListSmartApplicationsQueryDto,
  ): Promise<SmartApplicationListResponse> {
    return this.smartApply.list(u.userId, query);
  }

  /** Prepare an application for a job (idempotent per job). Preparation runs in the background. */
  @Post('applications')
  @HttpCode(HttpStatus.ACCEPTED)
  prepare(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: PrepareSmartApplicationDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    return this.smartApply.prepare(u.userId, dto, ctx);
  }

  @Get('applications/:id')
  get(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
  ): Promise<SmartApplicationDetail> {
    return this.smartApply.get(u.userId, smartId);
  }

  @Get('applications/:id/materials')
  materials(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
  ): Promise<SmartApplicationMaterials> {
    return this.smartApply.materials(u.userId, smartId);
  }

  @Get('applications/:id/eligibility')
  eligibility(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
  ): Promise<SubmissionEligibility> {
    return this.smartApply.eligibility(u.userId, smartId);
  }

  @Put('applications/:id/questions/:questionId/answer')
  answer(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
    @id('questionId') questionId: string,
    @Body() dto: AnswerQuestionDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<SmartApplyQuestion> {
    return this.smartApply.answer(u.userId, smartId, questionId, dto, ctx);
  }

  @Post('applications/:id/resume')
  @HttpCode(HttpStatus.ACCEPTED)
  resume(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    return this.smartApply.resume(u.userId, smartId, ctx);
  }

  @Post('applications/:id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    return this.smartApply.approve(u.userId, smartId, ctx);
  }

  @Post('applications/:id/handoff')
  @HttpCode(HttpStatus.OK)
  handoff(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
  ): Promise<SmartApplicationDetail> {
    return this.smartApply.handoff(u.userId, smartId);
  }

  /** Submit through an authorised integration. Send an Idempotency-Key to make retries safe. */
  @Post('applications/:id/submit')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  submit(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @ReqContext() ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    if (idempotencyKey !== undefined && !/^[A-Za-z0-9_.:-]{8,100}$/.test(idempotencyKey)) {
      throw AppException.validation([
        { field: 'Idempotency-Key', messages: ['Use 8–100 letters, digits or . _ : -'] },
      ]);
    }
    return this.smartApply.requestSubmission(u.userId, smartId, idempotencyKey, ctx);
  }

  @Get('applications/:id/submission')
  submission(@CurrentUser() u: AuthenticatedUser, @id('id') smartId: string) {
    return this.smartApply.submission(u.userId, smartId);
  }

  /** You submitted it yourself on the official site (recorded as user-reported). */
  @Post('applications/:id/manual-submission')
  @HttpCode(HttpStatus.OK)
  manual(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
    @Body() dto: ManualSubmissionDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    return this.smartApply.reportManualSubmission(u.userId, smartId, dto, ctx);
  }

  @Post('applications/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() u: AuthenticatedUser,
    @id('id') smartId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    return this.smartApply.cancel(u.userId, smartId, ctx);
  }

  /** Required questions waiting for answers, across all active applications. */
  @Get('questions')
  inbox(@CurrentUser() u: AuthenticatedUser): Promise<SmartApplyQuestion[]> {
    return this.smartApply.inbox(u.userId);
  }

  @Get('saved-answers')
  savedAnswers(@CurrentUser() u: AuthenticatedUser): Promise<ProfileAnswerItem[]> {
    return this.smartApply.savedAnswers(u.userId);
  }

  @Delete('saved-answers/:answerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSavedAnswer(
    @CurrentUser() u: AuthenticatedUser,
    @id('answerId') answerId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    return this.smartApply.deleteSavedAnswer(u.userId, answerId, ctx);
  }
}
