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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  JobAnalysisResult,
  JobDetail,
  JobMatchesResponse,
  JobRecommendationResponse,
  JobSummary,
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
import { JobAnalysisService } from './analysis/job-analysis.service.js';
import { CreateJobDto, ListJobsQueryDto, SelectResumeDto, UpdateJobDto } from './dto/job.dto.js';
import { JobsService } from './jobs.service.js';

/** A malformed id is reported like a missing one (404), never as a validation detail. */
const JobId = () =>
  Param('jobId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly analysis: JobAnalysisService,
  ) {}

  @Post()
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CreateJobDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobDetail> {
    return this.jobs.create(u.userId, dto, ctx);
  }

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: ListJobsQueryDto,
  ): Promise<JobSummary[]> {
    return this.jobs.list(u.userId, query);
  }

  @Get(':jobId')
  get(@CurrentUser() u: AuthenticatedUser, @JobId() id: string): Promise<JobDetail> {
    return this.jobs.get(u.userId, id);
  }

  @Patch(':jobId')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
    @Body() dto: UpdateJobDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobDetail> {
    return this.jobs.update(u.userId, id, dto, ctx);
  }

  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    return this.jobs.remove(u.userId, id, ctx);
  }

  @Post(':jobId/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobDetail> {
    return this.jobs.archive(u.userId, id, ctx);
  }

  @Post(':jobId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobDetail> {
    return this.jobs.restore(u.userId, id, ctx);
  }

  /** Starts analysis + matching in the background → 202; poll GET /jobs/:id for its status. */
  @Post(':jobId/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @AnalysisRateLimit()
  analyze(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.analysis.start(u.userId, id, ctx);
  }

  @Get(':jobId/analysis')
  getAnalysis(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
  ): Promise<JobAnalysisResult> {
    return this.analysis.getAnalysis(u.userId, id);
  }

  @Get(':jobId/matches')
  getMatches(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
  ): Promise<JobMatchesResponse> {
    return this.analysis.getMatches(u.userId, id);
  }

  @Get(':jobId/recommendation')
  getRecommendation(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
  ): Promise<JobRecommendationResponse> {
    return this.analysis.getRecommendation(u.userId, id);
  }

  @Put(':jobId/selected-resume')
  selectResume(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
    @Body() dto: SelectResumeDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobDetail> {
    return this.jobs.selectResume(u.userId, id, dto.resumeVersionId, ctx);
  }

  @Delete(':jobId/selected-resume')
  @HttpCode(HttpStatus.OK)
  clearSelection(
    @CurrentUser() u: AuthenticatedUser,
    @JobId() id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<JobDetail> {
    return this.jobs.clearSelection(u.userId, id, ctx);
  }
}
