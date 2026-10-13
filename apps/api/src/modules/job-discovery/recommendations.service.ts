import { HttpStatus, Injectable } from '@nestjs/common';
import type { JobRecommendationItem, RecommendationOverview } from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { SampleDataPolicy } from './sample-data-policy.js';
import { JobSourceRegistry } from './sources/job-source-registry.js';
import type { ListRecommendationsQueryDto } from './dto/job-alert.dto.js';
import {
  RECOMMENDATION_INCLUDE,
  type RecommendationRow,
  toRecommendationItem,
} from './job-alert.mapper.js';

const recommendationNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Recommendation not found.');

const LIST_LIMIT = 200;

/**
 * The user's job recommendations. Every query is scoped by userId; recommendations point
 * at the user's own jobs, so nothing another user discovered is ever visible.
 */
@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly applications: ApplicationsService,
    private readonly policy: SampleDataPolicy,
    private readonly sources: JobSourceRegistry,
  ) {}

  /** Excludes development sample data where it isn't allowed (production). */
  private get jobFilter(): Prisma.JobRecommendationWhereInput {
    return this.policy.allowSampleData ? {} : { job: { isSampleData: false } };
  }

  private toItem = (row: RecommendationRow): JobRecommendationItem =>
    toRecommendationItem(row, (key) => this.sources.attributionFor(key));

  async list(userId: string, query: ListRecommendationsQueryDto): Promise<JobRecommendationItem[]> {
    await this.syncApplied(userId);
    const status: Prisma.JobRecommendationWhereInput['status'] =
      query.status === 'ALL'
        ? undefined
        : query.status === 'ACTIVE'
          ? { not: 'DISMISSED' }
          : query.status;
    const contains = (value: string | undefined) =>
      value?.trim() ? { contains: value.trim(), mode: 'insensitive' as const } : undefined;
    const rows = await this.prisma.jobRecommendation.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
        ...(query.alertId ? { alertId: query.alertId } : {}),
        ...(query.minScore !== undefined ? { matchScore: { gte: query.minScore } } : {}),
        ...(query.source || query.workMode
          ? {
              discoveredJob: {
                ...(query.source ? { source: { key: query.source } } : {}),
                ...(query.workMode ? { workMode: query.workMode } : {}),
              },
            }
          : {}),
        AND: [
          this.jobFilter,
          {
            job: {
              title: contains(query.title),
              companyName: contains(query.company),
              location: contains(query.location),
            },
          },
        ],
      },
      include: RECOMMENDATION_INCLUDE,
      orderBy: [{ rank: 'desc' }, { matchScore: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: LIST_LIMIT,
    });
    return rows.map(this.toItem);
  }

  /** Opening a recommendation marks a NEW one as viewed. */
  async get(userId: string, id: string): Promise<JobRecommendationItem> {
    const row = await this.loadOwned(userId, id);
    if (row.status !== 'NEW') return this.toItem(row);
    return this.toItem(
      await this.prisma.jobRecommendation.update({
        where: { id },
        data: { status: 'VIEWED', viewedAt: new Date() },
        include: RECOMMENDATION_INCLUDE,
      }),
    );
  }

  /** Saves the recommendation and adds its job to the user's Jobs list. */
  async save(userId: string, id: string, ctx: RequestContext): Promise<JobRecommendationItem> {
    const row = await this.loadOwned(userId, id);
    await this.jobs.addToLibrary(userId, row.jobId);
    if (row.status === 'SAVED' || row.status === 'APPLIED') return this.toItem(row);
    const updated = await this.prisma.jobRecommendation.update({
      where: { id },
      data: { status: 'SAVED', savedAt: new Date(), viewedAt: row.viewedAt ?? new Date() },
      include: RECOMMENDATION_INCLUDE,
    });
    await this.audit.record({
      action: AuditAction.JOB_RECOMMENDATION_SAVED,
      userId,
      requestId: ctx.requestId,
      metadata: { recommendationId: id, jobId: row.jobId },
    });
    return this.toItem(updated);
  }

  /** Hides the recommendation. Later runs never bring it back (one per user and job). */
  async dismiss(userId: string, id: string, ctx: RequestContext): Promise<JobRecommendationItem> {
    const row = await this.loadOwned(userId, id);
    if (row.status === 'DISMISSED') return this.toItem(row);
    if (row.status === 'APPLIED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'You have applied to this job; it can’t be dismissed.',
      );
    }
    const updated = await this.prisma.jobRecommendation.update({
      where: { id },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
      include: RECOMMENDATION_INCLUDE,
    });
    await this.audit.record({
      action: AuditAction.JOB_RECOMMENDATION_DISMISSED,
      userId,
      requestId: ctx.requestId,
      metadata: { recommendationId: id, jobId: row.jobId },
    });
    return this.toItem(updated);
  }

  /** Dashboard counts of NEW recommendations by match level. */
  async overview(userId: string): Promise<RecommendationOverview> {
    await this.syncApplied(userId);
    const rows = await this.prisma.jobRecommendation.findMany({
      where: { userId, status: 'NEW', ...this.jobFilter },
      select: { matchScore: true },
    });
    return {
      new: rows.length,
      strong: rows.filter((r) => r.matchScore >= 70).length,
      moderate: rows.filter((r) => r.matchScore >= 50 && r.matchScore < 70).length,
      low: rows.filter((r) => r.matchScore < 50).length,
    };
  }

  private async loadOwned(userId: string, id: string): Promise<RecommendationRow> {
    await this.syncApplied(userId);
    const row = await this.prisma.jobRecommendation.findFirst({
      where: { id, userId, ...this.jobFilter },
      include: RECOMMENDATION_INCLUDE,
    });
    if (!row) throw recommendationNotFound();
    return row;
  }

  /** Marks recommendations whose job now has a tracked application as APPLIED. */
  private async syncApplied(userId: string): Promise<void> {
    const open = await this.prisma.jobRecommendation.findMany({
      where: { userId, status: { not: 'APPLIED' } },
      select: { id: true, jobId: true },
    });
    const applied = await this.applications.jobIdsWithApplications(
      userId,
      open.map((r) => r.jobId),
    );
    const ids = open.filter((r) => applied.has(r.jobId)).map((r) => r.id);
    if (ids.length === 0) return;
    await this.prisma.jobRecommendation.updateMany({
      where: { id: { in: ids }, userId },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });
  }
}
