import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  BreakdownRow,
  CareerFunnel,
  CareerInsightsResponse,
  CareerIntelligenceReport,
  CareerPattern,
  CareerTotals,
  DataLimitations,
  InterviewTopicRow,
  MatchScorePerformance,
  ResumeVersionPerformance,
  SkillIntelligenceRow,
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
import { CareerInsightsService } from './career-insights.service.js';
import { CareerIntelligenceService } from './career-intelligence.service.js';

/** Private analytics: every endpoint is computed from the signed-in user's own data only. */
@ApiTags('career-intelligence')
@ApiBearerAuth()
@Controller('career-intelligence')
export class CareerIntelligenceController {
  constructor(
    private readonly analytics: CareerIntelligenceService,
    private readonly insights: CareerInsightsService,
  ) {}

  /** The full report the dashboard renders. */
  @Get('overview')
  overview(@CurrentUser() u: AuthenticatedUser): Promise<CareerIntelligenceReport> {
    return this.analytics.report(u.userId);
  }

  @Get('funnel')
  async funnel(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<{ totals: CareerTotals; funnel: CareerFunnel }> {
    const r = await this.analytics.report(u.userId);
    return { totals: r.totals, funnel: r.funnel };
  }

  @Get('resumes')
  async resumes(@CurrentUser() u: AuthenticatedUser): Promise<ResumeVersionPerformance[]> {
    return (await this.analytics.report(u.userId)).resumes;
  }

  @Get('skills')
  async skills(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<{ skills: SkillIntelligenceRow[]; interviewTopics: InterviewTopicRow[] }> {
    const r = await this.analytics.report(u.userId);
    return { skills: r.skills, interviewTopics: r.interviewTopics };
  }

  @Get('roles')
  async roles(@CurrentUser() u: AuthenticatedUser): Promise<BreakdownRow[]> {
    return (await this.analytics.report(u.userId)).breakdowns.role;
  }

  @Get('sources')
  async sources(@CurrentUser() u: AuthenticatedUser): Promise<BreakdownRow[]> {
    return (await this.analytics.report(u.userId)).breakdowns.source;
  }

  @Get('match-scores')
  async matchScores(@CurrentUser() u: AuthenticatedUser): Promise<MatchScorePerformance> {
    return (await this.analytics.report(u.userId)).matchScores;
  }

  @Get('patterns')
  async patterns(
    @CurrentUser() u: AuthenticatedUser,
  ): Promise<{ patterns: CareerPattern[]; limitations: DataLimitations }> {
    const r = await this.analytics.report(u.userId);
    return { patterns: r.patterns, limitations: r.limitations };
  }

  /** Stored insights; starts a background refresh when the data changed since they were generated. */
  @Get('insights')
  list(@CurrentUser() u: AuthenticatedUser): Promise<CareerInsightsResponse> {
    return this.insights.get(u.userId);
  }

  @Post('insights/refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  @AnalysisRateLimit()
  refresh(
    @CurrentUser() u: AuthenticatedUser,
    @ReqContext() ctx: RequestContext,
  ): Promise<CareerInsightsResponse> {
    return this.insights.refresh(u.userId, ctx);
  }
}
