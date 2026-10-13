import { HttpStatus, Injectable } from '@nestjs/common';
import type { EmploymentType, JobDetail, JobSort, JobSummary } from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { jobContentHash, normalizeJobDescription } from './analysis/job-analyzer.js';
import type { CreateJobDto, ListJobsQueryDto, UpdateJobDto } from './dto/job.dto.js';
import { JOB_INCLUDE, type JobWithRelations, toJobDetail, toJobSummary } from './job.mapper.js';

export const jobNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Job not found.');

/**
 * Jobs the user added: create, list, edit, archive/restore, delete, choose a resume.
 * Every query is scoped by userId; another user's job id behaves like a missing one (404).
 */
@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resumes: ResumesService,
  ) {}

  async create(userId: string, dto: CreateJobDto, ctx: RequestContext): Promise<JobDetail> {
    const normalizedDescription = normalizeJobDescription(dto.description);
    const contentHash = jobContentHash(dto.title, dto.companyName, normalizedDescription);
    try {
      const job = await this.prisma.job.create({
        data: {
          userId,
          title: dto.title,
          companyName: dto.companyName,
          description: dto.description,
          normalizedDescription,
          contentHash,
          jobUrl: dto.jobUrl ?? null,
          location: dto.location ?? null,
          employmentType: dto.employmentType ?? null,
          source: dto.source ?? null,
        },
        include: JOB_INCLUDE,
      });
      await this.audit.record({
        action: AuditAction.JOB_CREATED,
        userId,
        requestId: ctx.requestId,
        metadata: { jobId: job.id },
      });
      return toJobDetail(job);
    } catch (error) {
      throw await this.duplicateOr(error, userId, contentHash);
    }
  }

  async list(userId: string, query: ListJobsQueryDto): Promise<JobSummary[]> {
    const rows = await this.prisma.job.findMany({
      where: {
        userId,
        ...(query.status === 'ALL' ? {} : { status: query.status }),
        // Discovered jobs join the list once saved (or applied to); until then they live
        // under Recommendations.
        OR: [{ inLibrary: true }, { applications: { some: {} } }],
      },
      include: JOB_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    const q = query.q?.trim().toLowerCase();
    const order: Record<JobSort, (a: JobSummary, b: JobSummary) => number> = {
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      match: (a, b) => (b.bestMatch?.score ?? -1) - (a.bestMatch?.score ?? -1),
    };
    // Per-user job counts are small; filter and sort in memory like the resume library.
    return rows
      .map(toJobSummary)
      .filter(
        (j) =>
          !q ||
          [j.title, j.companyName, j.location, j.source].some((v) => v?.toLowerCase().includes(q)),
      )
      .sort((a, b) => order[query.sort](a, b) || a.id.localeCompare(b.id));
  }

  async get(userId: string, jobId: string): Promise<JobDetail> {
    return toJobDetail(await this.loadOwned(userId, jobId));
  }

  /** The job with relations, or 404 if it doesn't exist or isn't the user's. */
  async loadOwned(userId: string, jobId: string): Promise<JobWithRelations> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
      include: JOB_INCLUDE,
    });
    if (!job) throw jobNotFound();
    return job;
  }

  async update(
    userId: string,
    jobId: string,
    dto: UpdateJobDto,
    ctx: RequestContext,
  ): Promise<JobDetail> {
    const job = await this.loadOwned(userId, jobId);
    const title = dto.title ?? job.title;
    const companyName = dto.companyName ?? job.companyName;
    const description = dto.description ?? job.description;
    const normalizedDescription = normalizeJobDescription(description);
    const contentHash = jobContentHash(title, companyName, normalizedDescription);
    try {
      const updated = await this.prisma.job.update({
        where: { id: jobId },
        data: {
          title,
          companyName,
          description,
          normalizedDescription,
          contentHash,
          ...(dto.jobUrl !== undefined ? { jobUrl: dto.jobUrl } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
          ...(dto.source !== undefined ? { source: dto.source } : {}),
        },
        include: JOB_INCLUDE,
      });
      await this.audit.record({
        action: AuditAction.JOB_UPDATED,
        userId,
        requestId: ctx.requestId,
        metadata: { jobId, descriptionChanged: contentHash !== job.contentHash },
      });
      return toJobDetail(updated);
    } catch (error) {
      throw await this.duplicateOr(error, userId, contentHash);
    }
  }

  async archive(userId: string, jobId: string, ctx: RequestContext): Promise<JobDetail> {
    const job = await this.loadOwned(userId, jobId);
    if (job.status === 'ARCHIVED') return toJobDetail(job);
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
      include: JOB_INCLUDE,
    });
    await this.audit.record({
      action: AuditAction.JOB_ARCHIVED,
      userId,
      requestId: ctx.requestId,
      metadata: { jobId },
    });
    return toJobDetail(updated);
  }

  async restore(userId: string, jobId: string, ctx: RequestContext): Promise<JobDetail> {
    const job = await this.loadOwned(userId, jobId);
    if (job.status === 'ACTIVE') return toJobDetail(job);
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'ACTIVE', archivedAt: null },
      include: JOB_INCLUDE,
    });
    await this.audit.record({
      action: AuditAction.JOB_RESTORED,
      userId,
      requestId: ctx.requestId,
      metadata: { jobId },
    });
    return toJobDetail(updated);
  }

  /** Permanently deletes the job with its analyses, matches and recommendations. Resumes are untouched. */
  async remove(userId: string, jobId: string, ctx: RequestContext): Promise<void> {
    await this.loadOwned(userId, jobId);
    // Applications are history: a job that has any can only be archived.
    const applications = await this.prisma.application.count({ where: { jobId, userId } });
    if (applications > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.JOB_HAS_APPLICATIONS,
        'This job has tracked applications. Archive it instead of deleting it.',
      );
    }
    await this.prisma.job.delete({ where: { id: jobId } });
    await this.audit.record({
      action: AuditAction.JOB_DELETED,
      userId,
      requestId: ctx.requestId,
      metadata: { jobId },
    });
  }

  /** Records the user's own choice of resume for this job (it may differ from the recommendation). */
  async selectResume(
    userId: string,
    jobId: string,
    resumeVersionId: string,
    ctx: RequestContext,
  ): Promise<JobDetail> {
    const job = await this.loadOwned(userId, jobId);
    const version = await this.resumes.findSelectableVersion(userId, resumeVersionId);
    if (version === 'NOT_FOUND') {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resume not found.');
    }
    if (version === 'NOT_SELECTABLE') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.RESUME_NOT_SELECTABLE,
        'Choose the current version of an active resume.',
      );
    }
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { selectedResumeVersionId: resumeVersionId, selectedAt: new Date() },
      include: JOB_INCLUDE,
    });
    await this.audit.record({
      action: AuditAction.JOB_RESUME_SELECTED,
      userId,
      requestId: ctx.requestId,
      metadata: {
        jobId,
        resumeVersionId,
        isRecommended: job.currentAnalysis?.recommendation?.resumeVersionId === resumeVersionId,
      },
    });
    return toJobDetail(updated);
  }

  async clearSelection(userId: string, jobId: string, ctx: RequestContext): Promise<JobDetail> {
    const job = await this.loadOwned(userId, jobId);
    if (!job.selectedResumeVersionId) return toJobDetail(job);
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: { selectedResumeVersionId: null, selectedAt: null },
      include: JOB_INCLUDE,
    });
    await this.audit.record({
      action: AuditAction.JOB_RESUME_SELECTION_CLEARED,
      userId,
      requestId: ctx.requestId,
      metadata: { jobId },
    });
    return toJobDetail(updated);
  }

  // ── Job discovery (ADR-0018) ──

  /**
   * Adds a posting found by a job alert as the user's own job, kept out of the Jobs list
   * until saved. Idempotent: an identical posting returns the existing job.
   */
  async createDiscovered(
    userId: string,
    posting: {
      title: string;
      companyName: string;
      description: string;
      jobUrl: string | null;
      location: string | null;
      employmentType: EmploymentType | null;
      source: string;
      isSampleData: boolean;
    },
  ): Promise<{ id: string; created: boolean }> {
    const normalizedDescription = normalizeJobDescription(posting.description);
    const contentHash = jobContentHash(posting.title, posting.companyName, normalizedDescription);
    try {
      const job = await this.prisma.job.create({
        data: {
          userId,
          ...posting,
          normalizedDescription,
          contentHash,
          origin: 'DISCOVERED',
          inLibrary: false,
        },
        select: { id: true },
      });
      await this.audit.record({
        action: AuditAction.JOB_DISCOVERED,
        userId,
        metadata: { jobId: job.id },
      });
      return { id: job.id, created: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
        throw error;
      const existing = await this.prisma.job.findFirstOrThrow({
        where: { userId, contentHash },
        select: { id: true },
      });
      return { id: existing.id, created: false };
    }
  }

  /** The user's jobs in the shape duplicate detection needs. */
  listForDuplicateCheck(userId: string) {
    return this.prisma.job.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        companyName: true,
        location: true,
        jobUrl: true,
        normalizedDescription: true,
        origin: true,
        inLibrary: true,
        currentAnalysisId: true,
        source: true,
      },
    });
  }

  /**
   * Points a discovered job at the employer's own posting once an employer job board lists
   * it (the first copy may have come from a job search service). Jobs the user added are
   * never changed.
   */
  async useOriginalPosting(
    userId: string,
    jobId: string,
    posting: { jobUrl: string; source: string },
  ): Promise<void> {
    await this.prisma.job.updateMany({
      where: { id: jobId, userId, origin: 'DISCOVERED' },
      data: posting,
    });
  }

  /** Puts a discovered job in the user's Jobs list (saving a recommendation). */
  async addToLibrary(userId: string, jobId: string): Promise<void> {
    const { count } = await this.prisma.job.updateMany({
      where: { id: jobId, userId },
      data: { inLibrary: true },
    });
    if (count === 0) throw jobNotFound();
  }

  /** Maps a unique violation on (user, content) to a 409 that points at the existing job. */
  private async duplicateOr(error: unknown, userId: string, contentHash: string): Promise<unknown> {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
      return error;
    const existing = await this.prisma.job.findFirst({
      where: { userId, contentHash },
      select: { id: true },
    });
    return new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.DUPLICATE_JOB,
      'You already added this job.',
      undefined,
      existing ? { existingJobId: existing.id } : undefined,
    );
  }
}
