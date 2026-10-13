import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationDetail,
  type ApplicationDocument,
  type ApplicationNote,
  type ApplicationPipeline,
  type ApplicationSort,
  type ApplicationStatus,
  type ApplicationSummary,
  type ApplicationTimelineEvent,
  SUBMITTED_STATUSES,
} from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { fromDbDate, toDbDate } from '../../common/dates.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AppConfigService } from '../../config/config.module.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { jobNotFound } from '../jobs/jobs.service.js';
import { validateResumeFile } from '../resumes/parsing/resume-file-validator.js';
import { ResumesService, type UploadedFile } from '../resumes/resumes.service.js';
import { StorageService, type StoredObject } from '../storage/storage.service.js';
import { allowedNextStatuses, isValidAppliedDate } from './application-status.js';
import {
  APPLICATION_DETAIL_INCLUDE,
  APPLICATION_LIST_INCLUDE,
  buildTimeline,
  previousStatus,
  toApplicationDetail,
  toApplicationSummary,
  toDocument,
  toNote,
} from './application.mapper.js';
import type {
  ChangeStatusDto,
  CreateApplicationDto,
  ListApplicationsQueryDto,
  UpdateApplicationDto,
  UploadDocumentDto,
} from './dto/application.dto.js';

const notFound = (what = 'Application') =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found.`);
/** Statuses in which offer details may be recorded. */
const OFFER_STATUSES: ApplicationStatus[] = ['OFFER', 'ACCEPTED'];

const invalid = (field: string, message: string) =>
  AppException.validation([{ field, messages: [message] }]);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Application tracking. The product records applications the user made or is preparing;
 * it never submits anything. Every query is scoped by userId, and another user's ids
 * behave like missing ones (404).
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resumes: ResumesService,
    private readonly storage: StorageService,
    config: AppConfigService,
  ) {
    this.maxUploadBytes = config.get('RESUME_MAX_UPLOAD_BYTES', { infer: true });
  }

  // ── Create ──

  async create(
    userId: string,
    dto: CreateApplicationDto,
    ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    const status = dto.status ?? 'SAVED';
    if (dto.appliedAt && status !== 'APPLIED') {
      throw invalid('appliedAt', 'Set an application date only for an application that was sent.');
    }
    if (dto.appliedAt && !isValidAppliedDate(dto.appliedAt)) {
      throw invalid('appliedAt', 'The application date can’t be in the future.');
    }

    const application = await this.prisma.$transaction(async (tx) => {
      // Lock the job row: concurrent requests for the same job can't both pass the duplicate check.
      const [job] = await tx.$queryRaw<
        { id: string; status: string; current_analysis_id: string | null }[]
      >`
        SELECT id, status::text AS status, current_analysis_id FROM jobs
        WHERE id = ${dto.jobId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
      if (!job) throw jobNotFound();
      if (job.status === 'ARCHIVED') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.JOB_ARCHIVED,
          'Restore this job before tracking an application for it.',
        );
      }
      const existing = await tx.application.findFirst({
        where: { userId, jobId: job.id, archivedAt: null },
        select: { id: true },
      });
      if (existing) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.APPLICATION_EXISTS,
          'You already have an application for this job.',
          undefined,
          { existingApplicationId: existing.id },
        );
      }

      const version = await this.resumes.findSelectableVersion(userId, dto.resumeVersionId);
      if (version === 'NOT_FOUND') throw notFound('Resume');
      if (version === 'NOT_SELECTABLE') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.RESUME_NOT_SELECTABLE,
          'Choose the current, reviewed version of an active resume.',
        );
      }

      // Snapshot what the AI recommended and how this version scored, for later analytics.
      const [recommendation, match] = job.current_analysis_id
        ? await Promise.all([
            tx.resumeRecommendation.findUnique({
              where: { analysisId: job.current_analysis_id },
              select: { resumeVersionId: true, score: true },
            }),
            tx.matchAnalysis.findFirst({
              where: {
                analysisId: job.current_analysis_id,
                userId,
                resumeVersionId: dto.resumeVersionId,
              },
              select: { id: true, overallScore: true },
            }),
          ])
        : [null, null];

      const created = await tx.application.create({
        data: {
          userId,
          jobId: job.id,
          resumeVersionId: dto.resumeVersionId,
          status,
          appliedAt: status === 'APPLIED' ? toDbDate(dto.appliedAt ?? today()) : null,
          source: dto.source ?? null,
          applicationUrl: dto.applicationUrl ?? null,
          recommendedResumeVersionId: recommendation?.resumeVersionId ?? null,
          recommendedScore: recommendation?.score ?? null,
          matchAnalysisId: match?.id ?? null,
          matchScore: match?.overallScore ?? null,
          statusHistory: { create: { fromStatus: null, toStatus: status } },
          ...(dto.note ? { notes: { create: { body: dto.note } } } : {}),
        },
        select: { id: true },
      });
      // The job remembers the user's choice too.
      await tx.job.update({
        where: { id: job.id },
        data: { selectedResumeVersionId: dto.resumeVersionId, selectedAt: new Date() },
      });
      return {
        id: created.id,
        matchesRecommendation: recommendation?.resumeVersionId === dto.resumeVersionId,
      };
    });

    await this.audit.record({
      action: AuditAction.APPLICATION_CREATED,
      userId,
      requestId: ctx.requestId,
      metadata: {
        applicationId: application.id,
        jobId: dto.jobId,
        resumeVersionId: dto.resumeVersionId,
        status,
        matchesRecommendation: application.matchesRecommendation,
      },
    });
    return this.get(userId, application.id);
  }

  // ── Read ──

  async list(userId: string, query: ListApplicationsQueryDto): Promise<ApplicationSummary[]> {
    const rows = await this.prisma.application.findMany({
      where: {
        userId,
        ...(query.archived === 'ALL'
          ? {}
          : { archivedAt: query.archived === 'ARCHIVED' ? { not: null } : null }),
        ...(query.status ? { status: query.status } : {}),
        ...(query.appliedFrom || query.appliedTo
          ? {
              appliedAt: {
                ...(query.appliedFrom ? { gte: toDbDate(query.appliedFrom)! } : {}),
                ...(query.appliedTo ? { lte: toDbDate(query.appliedTo)! } : {}),
              },
            }
          : {}),
      },
      include: APPLICATION_LIST_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    const q = query.q?.trim().toLowerCase();
    const order: Record<ApplicationSort, (a: ApplicationSummary, b: ApplicationSummary) => number> =
      {
        updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
        created: (a, b) => b.createdAt.localeCompare(a.createdAt),
        applied: (a, b) => (b.appliedAt ?? '').localeCompare(a.appliedAt ?? ''),
        title: (a, b) => a.jobTitle.localeCompare(b.jobTitle, undefined, { sensitivity: 'base' }),
      };
    return rows
      .map(toApplicationSummary)
      .filter(
        (a) =>
          !q ||
          [a.jobTitle, a.companyName, a.resume.resumeName, a.source].some((v) =>
            v?.toLowerCase().includes(q),
          ),
      )
      .sort((a, b) => order[query.sort](a, b) || a.id.localeCompare(b.id));
  }

  private async loadOwned(userId: string, applicationId: string) {
    const row = await this.prisma.application.findFirst({
      where: { id: applicationId, userId },
      include: APPLICATION_DETAIL_INCLUDE,
    });
    if (!row) throw notFound();
    return row;
  }

  async get(userId: string, applicationId: string): Promise<ApplicationDetail> {
    return toApplicationDetail(await this.loadOwned(userId, applicationId));
  }

  async timeline(userId: string, applicationId: string): Promise<ApplicationTimelineEvent[]> {
    const row = await this.loadOwned(userId, applicationId);
    const [notes, documents] = await Promise.all([
      this.listNotes(userId, applicationId),
      this.listDocuments(userId, applicationId),
    ]);
    return buildTimeline(row, notes, documents);
  }

  /** Real counts for the dashboard pipeline (active = not archived). */
  /** Which of these jobs the user has tracked an application for (any status). */
  async jobIdsWithApplications(userId: string, jobIds: string[]): Promise<Set<string>> {
    if (jobIds.length === 0) return new Set();
    const rows = await this.prisma.application.findMany({
      where: { userId, jobId: { in: jobIds } },
      select: { jobId: true },
    });
    return new Set(rows.map((r) => r.jobId));
  }

  async pipeline(userId: string): Promise<ApplicationPipeline> {
    const [groups, archived] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['status'],
        where: { userId, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.application.count({ where: { userId, archivedAt: { not: null } } }),
    ]);
    const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
      ApplicationStatus,
      number
    >;
    for (const g of groups) byStatus[g.status] = g._count._all;
    return { total: groups.reduce((sum, g) => sum + g._count._all, 0), archived, byStatus };
  }

  /** The ids a preparation needs, scoped to the owner (404 otherwise). */
  async getPreparationTarget(userId: string, applicationId: string) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, userId },
      select: { id: true, jobId: true, resumeVersionId: true, archivedAt: true },
    });
    if (!app) throw notFound();
    return app;
  }

  /** Stores a document the app generated (e.g. an approved cover letter) on the application. */
  async addGeneratedDocument(
    userId: string,
    applicationId: string,
    file: {
      buffer: Buffer;
      filename: string;
      name: string;
      type: 'COVER_LETTER' | 'TAILORED_RESUME';
    },
    ctx: RequestContext,
  ): Promise<ApplicationDocument> {
    return this.addDocument(
      userId,
      applicationId,
      { buffer: file.buffer, originalname: file.filename },
      { type: file.type, name: file.name },
      ctx,
    );
  }

  // ── Update ──

  async update(
    userId: string,
    applicationId: string,
    dto: UpdateApplicationDto,
    ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    const app = await this.loadOwned(userId, applicationId);
    this.assertActive(app);
    const data: Prisma.ApplicationUpdateInput = {};
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.applicationUrl !== undefined) data.applicationUrl = dto.applicationUrl;
    if (dto.appliedAt !== undefined) {
      if (!SUBMITTED_STATUSES.includes(app.status)) {
        throw invalid('appliedAt', 'Set the application date once the application has been sent.');
      }
      if (dto.appliedAt === null)
        throw invalid('appliedAt', 'A sent application needs an application date.');
      if (!isValidAppliedDate(dto.appliedAt))
        throw invalid('appliedAt', 'The application date can’t be in the future.');
      data.appliedAt = toDbDate(dto.appliedAt);
    }
    if (dto.rejectionReason !== undefined) {
      if (app.status !== 'REJECTED')
        throw invalid('rejectionReason', 'Add a rejection reason only to a rejected application.');
      data.rejectionReason = dto.rejectionReason;
    }
    if (dto.rejectionCategory !== undefined) {
      if (app.status !== 'REJECTED')
        throw invalid(
          'rejectionCategory',
          'Add a rejection category only to a rejected application.',
        );
      data.rejectionCategory = dto.rejectionCategory;
    }
    if (dto.offerDetails !== undefined) {
      if (!OFFER_STATUSES.includes(app.status) && !app.offerDetails)
        throw invalid('offerDetails', 'Add offer details once an offer has been received.');
      data.offerDetails = dto.offerDetails;
    }
    await this.prisma.application.update({ where: { id: app.id }, data });
    await this.audit.record({
      action: AuditAction.APPLICATION_UPDATED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, fields: Object.keys(data) },
    });
    return this.get(userId, applicationId);
  }

  async changeStatus(
    userId: string,
    applicationId: string,
    dto: ChangeStatusDto,
    ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    const from = await this.prisma.$transaction(async (tx) => {
      // Lock the application so concurrent changes are applied one after the other.
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM applications WHERE id = ${applicationId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
      if (!locked) throw notFound();
      const app = await tx.application.findUniqueOrThrow({
        where: { id: applicationId },
        include: { statusHistory: { orderBy: [{ changedAt: 'asc' }, { id: 'asc' }] } },
      });
      this.assertActive(app);
      const allowed = allowedNextStatuses(
        app.status,
        previousStatus(app.statusHistory, app.status),
      );
      if (!allowed.includes(dto.status)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATUS_TRANSITION,
          dto.status === app.status
            ? `The application is already ${APPLICATION_STATUS_LABELS[app.status]}.`
            : `An application can’t move from ${APPLICATION_STATUS_LABELS[app.status]} to ${APPLICATION_STATUS_LABELS[dto.status]}.`,
        );
      }
      if (dto.rejectionReason && dto.status !== 'REJECTED') {
        throw invalid(
          'rejectionReason',
          'Add a rejection reason only when marking the application as rejected.',
        );
      }
      if (dto.rejectionCategory && dto.status !== 'REJECTED') {
        throw invalid(
          'rejectionCategory',
          'Add a rejection category only when marking the application as rejected.',
        );
      }
      if (dto.offerDetails && !OFFER_STATUSES.includes(dto.status)) {
        throw invalid('offerDetails', 'Add offer details only with an offer.');
      }
      if (dto.occurredOn) {
        if (!isValidAppliedDate(dto.occurredOn))
          throw invalid('occurredOn', 'The date can’t be in the future.');
        const applied = fromDbDate(app.appliedAt);
        if (applied && dto.occurredOn < applied)
          throw invalid('occurredOn', 'The date can’t be before the application date.');
      }
      await tx.applicationStatusHistory.create({
        data: {
          applicationId,
          fromStatus: app.status,
          toStatus: dto.status,
          occurredOn: toDbDate(dto.occurredOn ?? null),
          note: dto.note ?? null,
        },
      });
      await tx.application.update({
        where: { id: applicationId },
        data: {
          status: dto.status,
          // The first time it's sent, record today; never overwrite an existing date.
          ...(dto.status === 'APPLIED' && !app.appliedAt ? { appliedAt: toDbDate(today()) } : {}),
          ...(dto.status === 'REJECTED' && dto.rejectionReason
            ? { rejectionReason: dto.rejectionReason }
            : {}),
          ...(dto.status === 'REJECTED' && dto.rejectionCategory
            ? { rejectionCategory: dto.rejectionCategory }
            : {}),
          ...(dto.offerDetails ? { offerDetails: dto.offerDetails } : {}),
        },
      });
      return app.status;
    });
    await this.audit.record({
      action: AuditAction.APPLICATION_STATUS_CHANGED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, from, to: dto.status },
    });
    return this.get(userId, applicationId);
  }

  // ── Archive / restore / delete ──

  async archive(
    userId: string,
    applicationId: string,
    ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    const app = await this.loadOwned(userId, applicationId);
    if (!app.archivedAt) {
      await this.prisma.application.update({
        where: { id: app.id },
        data: { archivedAt: new Date() },
      });
      await this.audit.record({
        action: AuditAction.APPLICATION_ARCHIVED,
        userId,
        requestId: ctx.requestId,
        metadata: { applicationId },
      });
    }
    return this.get(userId, applicationId);
  }

  async restore(
    userId: string,
    applicationId: string,
    ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    const app = await this.loadOwned(userId, applicationId);
    if (app.archivedAt) {
      const active = await this.prisma.application.findFirst({
        where: { userId, jobId: app.jobId, archivedAt: null },
        select: { id: true },
      });
      if (active) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.APPLICATION_EXISTS,
          'This job already has another active application. Archive that one first.',
          undefined,
          { existingApplicationId: active.id },
        );
      }
      await this.prisma.application.update({ where: { id: app.id }, data: { archivedAt: null } });
      await this.audit.record({
        action: AuditAction.APPLICATION_RESTORED,
        userId,
        requestId: ctx.requestId,
        metadata: { applicationId },
      });
    }
    return this.get(userId, applicationId);
  }

  /** Permanent deletion, only for archived applications (history is not deleted casually). */
  async remove(userId: string, applicationId: string, ctx: RequestContext): Promise<void> {
    const app = await this.loadOwned(userId, applicationId);
    if (!app.archivedAt) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.APPLICATION_NOT_ARCHIVED,
        'Archive the application before deleting it permanently.',
      );
    }
    const documents = await this.prisma.applicationDocument.findMany({
      where: { applicationId },
      select: { storageKey: true },
    });
    await this.prisma.application.delete({ where: { id: applicationId } });
    await this.deleteStoredFiles(
      documents.map((d) => d.storageKey),
      applicationId,
    );
    await this.audit.record({
      action: AuditAction.APPLICATION_DELETED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, documentCount: documents.length },
    });
  }

  // ── Notes ──

  async listNotes(userId: string, applicationId: string): Promise<ApplicationNote[]> {
    await this.assertOwned(userId, applicationId);
    const notes = await this.prisma.applicationNote.findMany({
      where: { applicationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return notes.map(toNote);
  }

  async createNote(
    userId: string,
    applicationId: string,
    body: string,
    ctx: RequestContext,
  ): Promise<ApplicationNote> {
    await this.assertOwned(userId, applicationId);
    const note = await this.prisma.applicationNote.create({ data: { applicationId, body } });
    await this.touch(applicationId);
    await this.audit.record({
      action: AuditAction.APPLICATION_NOTE_CREATED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, noteId: note.id },
    });
    return toNote(note);
  }

  async updateNote(
    userId: string,
    applicationId: string,
    noteId: string,
    body: string,
    ctx: RequestContext,
  ): Promise<ApplicationNote> {
    await this.ownedNote(userId, applicationId, noteId);
    const note = await this.prisma.applicationNote.update({
      where: { id: noteId },
      data: { body },
    });
    await this.audit.record({
      action: AuditAction.APPLICATION_NOTE_UPDATED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, noteId },
    });
    return toNote(note);
  }

  async deleteNote(
    userId: string,
    applicationId: string,
    noteId: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.ownedNote(userId, applicationId, noteId);
    await this.prisma.applicationNote.delete({ where: { id: noteId } });
    await this.audit.record({
      action: AuditAction.APPLICATION_NOTE_DELETED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, noteId },
    });
  }

  private async ownedNote(userId: string, applicationId: string, noteId: string) {
    const note = await this.prisma.applicationNote.findFirst({
      where: { id: noteId, applicationId, application: { userId } },
      select: { id: true },
    });
    if (!note) throw notFound('Note');
  }

  // ── Documents ──

  async listDocuments(userId: string, applicationId: string): Promise<ApplicationDocument[]> {
    await this.assertOwned(userId, applicationId);
    const docs = await this.prisma.applicationDocument.findMany({
      where: { applicationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return docs.map(toDocument);
  }

  async addDocument(
    userId: string,
    applicationId: string,
    file: UploadedFile | undefined,
    dto: UploadDocumentDto,
    ctx: RequestContext,
  ): Promise<ApplicationDocument> {
    await this.assertOwned(userId, applicationId);
    if (!file) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.FILE_REQUIRED,
        'Choose a PDF or DOCX file to upload.',
      );
    }
    let validated;
    try {
      validated = await validateResumeFile(file.buffer, file.originalname, this.maxUploadBytes);
    } catch (error) {
      await this.audit.record({
        action: AuditAction.APPLICATION_DOCUMENT_REJECTED,
        userId,
        requestId: ctx.requestId,
        metadata: {
          applicationId,
          reason: error instanceof AppException ? error.code : 'unknown',
          sizeBytes: file.buffer.length,
        },
      });
      throw error;
    }
    // Server-generated key: nothing from the client ends up in the storage path.
    const storageKey = `users/${userId}/applications/${applicationId}/${randomUUID()}.${validated.kind}`;
    await this.storage.put(storageKey, file.buffer, validated.mimeType);
    try {
      const doc = await this.prisma.applicationDocument.create({
        data: {
          applicationId,
          type: dto.type,
          name: dto.name?.trim() || validated.safeFilename.replace(/\.[^.]+$/, ''),
          storageKey,
          originalFilename: validated.safeFilename,
          mimeType: validated.mimeType,
          sizeBytes: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
        },
      });
      await this.touch(applicationId);
      await this.audit.record({
        action: AuditAction.APPLICATION_DOCUMENT_ADDED,
        userId,
        requestId: ctx.requestId,
        metadata: { applicationId, documentId: doc.id, type: doc.type, sizeBytes: doc.sizeBytes },
      });
      return toDocument(doc);
    } catch (error) {
      await this.deleteStoredFiles([storageKey], applicationId);
      throw error;
    }
  }

  async downloadDocument(
    userId: string,
    applicationId: string,
    documentId: string,
    ctx: RequestContext,
  ): Promise<{ object: StoredObject; filename: string; mimeType: string }> {
    const doc = await this.ownedDocument(userId, applicationId, documentId);
    const object = await this.storage.get(doc.storageKey);
    await this.audit.record({
      action: AuditAction.APPLICATION_DOCUMENT_DOWNLOADED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, documentId },
    });
    return { object, filename: doc.originalFilename, mimeType: doc.mimeType };
  }

  async removeDocument(
    userId: string,
    applicationId: string,
    documentId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const doc = await this.ownedDocument(userId, applicationId, documentId);
    await this.prisma.applicationDocument.delete({ where: { id: doc.id } });
    await this.deleteStoredFiles([doc.storageKey], applicationId);
    await this.audit.record({
      action: AuditAction.APPLICATION_DOCUMENT_REMOVED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, documentId, type: doc.type },
    });
  }

  private async ownedDocument(userId: string, applicationId: string, documentId: string) {
    const doc = await this.prisma.applicationDocument.findFirst({
      where: { id: documentId, applicationId, application: { userId } },
    });
    if (!doc) throw notFound('Document');
    return doc;
  }

  // ── Helpers ──

  private async assertOwned(userId: string, applicationId: string): Promise<void> {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, userId },
      select: { id: true },
    });
    if (!app) throw notFound();
  }

  private assertActive(app: { archivedAt: Date | null }): void {
    if (app.archivedAt) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.APPLICATION_ARCHIVED,
        'Restore this application to change it.',
      );
    }
  }

  /** Notes and documents count as activity on the application. */
  private async touch(applicationId: string): Promise<void> {
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { updatedAt: new Date() },
    });
  }

  private async deleteStoredFiles(keys: string[], applicationId: string): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.storage.delete(keys);
    } catch (error) {
      // Rows are gone, so the files are unreachable; log for cleanup rather than failing.
      this.logger.error(
        { err: error, applicationId, fileCount: keys.length },
        'Failed to delete application files',
      );
    }
  }
}
