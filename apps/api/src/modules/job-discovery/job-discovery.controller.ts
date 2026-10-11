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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  JobAlertItem,
  JobRecommendationItem,
  JobSearchRunItem,
  JobSourceItem,
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
import {
  CreateJobAlertDto,
  ListRecommendationsQueryDto,
  UpdateJobAlertDto,
} from './dto/job-alert.dto.js';
import { JobAlertsService } from './job-alerts.service.js';
import { RecommendationsService } from './recommendations.service.js';

/** Malformed ids are reported like missing ones (404). */
const id = (name: string) =>
  Param(name, new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));

@ApiTags('job-alerts')
@ApiBearerAuth()
@Controller()
export class JobDiscoveryController {
  constructor(
    private readonly alerts: JobAlertsService,
    private readonly recommendations: RecommendationsService,
  ) {}

  /** Configured job sources (development sources are flagged). */
  @Get('job-sources')
  sources(): Promise<JobSourceItem[]> {
    return this.alerts.listSources();
  }

  @Post('job-alerts')
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CreateJobAlertDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobAlertItem> {
    return this.alerts.create(u.userId, dto, ctx);
  }

  @Get('job-alerts')
  list(@CurrentUser() u: AuthenticatedUser): Promise<JobAlertItem[]> {
    return this.alerts.list(u.userId);
  }

  @Get('job-alerts/:alertId')
  get(@CurrentUser() u: AuthenticatedUser, @id('alertId') alertId: string): Promise<JobAlertItem> {
    return this.alerts.get(u.userId, alertId);
  }

  @Patch('job-alerts/:alertId')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @id('alertId') alertId: string,
    @Body() dto: UpdateJobAlertDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobAlertItem> {
    return this.alerts.update(u.userId, alertId, dto, ctx);
  }

  @Delete('job-alerts/:alertId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @id('alertId') alertId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    return this.alerts.remove(u.userId, alertId, ctx);
  }

  /** Run Now: queues a search with the same pipeline as scheduled runs. */
  @Post('job-alerts/:alertId/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @AnalysisRateLimit()
  run(
    @CurrentUser() u: AuthenticatedUser,
    @id('alertId') alertId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobSearchRunItem> {
    return this.alerts.run(u.userId, alertId, ctx);
  }

  @Get('job-alerts/:alertId/runs')
  runs(
    @CurrentUser() u: AuthenticatedUser,
    @id('alertId') alertId: string,
  ): Promise<JobSearchRunItem[]> {
    return this.alerts.runs(u.userId, alertId);
  }

  @Get('recommendations')
  listRecommendations(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: ListRecommendationsQueryDto,
  ): Promise<JobRecommendationItem[]> {
    return this.recommendations.list(u.userId, query);
  }

  @Get('recommendations/:recommendationId')
  getRecommendation(
    @CurrentUser() u: AuthenticatedUser,
    @id('recommendationId') recommendationId: string,
  ): Promise<JobRecommendationItem> {
    return this.recommendations.get(u.userId, recommendationId);
  }

  @Post('recommendations/:recommendationId/save')
  @HttpCode(HttpStatus.OK)
  save(
    @CurrentUser() u: AuthenticatedUser,
    @id('recommendationId') recommendationId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobRecommendationItem> {
    return this.recommendations.save(u.userId, recommendationId, ctx);
  }

  @Post('recommendations/:recommendationId/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(
    @CurrentUser() u: AuthenticatedUser,
    @id('recommendationId') recommendationId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobRecommendationItem> {
    return this.recommendations.dismiss(u.userId, recommendationId, ctx);
  }
}
