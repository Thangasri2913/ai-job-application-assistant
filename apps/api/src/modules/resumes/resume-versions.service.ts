import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ParseStatusResponse,
  ResumeContent,
  ResumeExtractedData,
  ResumeVersionDetail,
  ResumeVersionSummary,
} from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { type StoredObject, StorageService } from '../storage/storage.service.js';
import type { CreateVersionDto, UploadVersionDto } from './dto/resume.dto.js';
import { ParsingDispatcher } from './parsing/parsing-dispatcher.js';
import { CONTENT_INCLUDE, contentFromVersion, writeContent } from './resume-content.repository.js';
import {
  readContent,
  toJson,
  toVersionDetail,
  toVersionSummary,
  type VersionWithFileAndContent,
} from './resume.mapper.js';
import { resumeNotFound, ResumesService, type UploadedFile } from './resumes.service.js';

const versionNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Version not found.');

const notEditable = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.VERSION_NOT_EDITABLE,
    'Only draft versions can be changed. Create a new version to make edits.',
  );

const VERSION_INCLUDE = { ...CONTENT_INCLUDE, file: true } as const;

/**
 * Resume versions. A version's content can change only while it is a DRAFT; once
 * ACTIVE (or superseded → ARCHIVED) it is frozen, so a version referenced by a
 * future application or match always means exactly the same content.
 */
@Injectable()
export class ResumeVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dispatcher: ParsingDispatcher,
    private readonly resumes: ResumesService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, resumeId: string): Promise<ResumeVersionSummary[]> {
    const resume = await this.resumes.loadOwned(userId, resumeId);
    return resume.versions.map(toVersionSummary);
  }

  async get(userId: string, resumeId: string, versionId: string): Promise<ResumeVersionDetail> {
    return toVersionDetail(await this.loadOwned(userId, resumeId, versionId));
  }

  /** New DRAFT copying the content (and original-file reference) of a base version. */
  async createDraft(
    userId: string,
    resumeId: string,
    dto: CreateVersionDto,
    ctx: RequestContext,
  ): Promise<ResumeVersionDetail> {
    const resume = await this.resumes.loadOwned(userId, resumeId);
    this.assertNotArchived(resume.status);
    const baseId = dto.baseVersionId ?? resume.currentVersionId ?? resume.versions[0]?.id;
    const base = baseId
      ? await this.prisma.resumeVersion.findFirst({
          where: { id: baseId, resumeId },
          include: VERSION_INCLUDE,
        })
      : null;
    if (!base) throw versionNotFound();
    const content = contentFromVersion(base) ?? readContent(base.parsedData);

    const version = await this.createVersion(
      resumeId,
      {
        status: 'DRAFT',
        source: 'MANUAL_EDIT',
        parentVersionId: base.id,
        notes: dto.notes ?? null,
        // Same resume: the original upload is shared, never modified.
        fileId: base.fileId,
        // The extraction belongs to the shared file, so it travels with the draft (provenance).
        extractedText: base.extractedText,
        parsedData: base.parsedData === null ? undefined : toJson(base.parsedData as object),
        aiExtraction: base.aiExtraction === null ? undefined : toJson(base.aiExtraction as object),
        parserVersion: base.parserVersion,
        parsedAt: base.parsedAt,
        parseError: base.parseError,
        parseStatus:
          base.parseStatus === 'PENDING' || base.parseStatus === 'PROCESSING'
            ? 'NOT_APPLICABLE'
            : base.parseStatus,
      },
      content,
    );
    await this.audit.record({
      action: AuditAction.RESUME_VERSION_CREATED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionId: version.id, source: 'MANUAL_EDIT', baseVersionId: base.id },
    });
    return toVersionDetail(version);
  }

  /** New DRAFT from a newly uploaded file; parsing runs in the background. */
  async uploadVersion(
    userId: string,
    resumeId: string,
    file: UploadedFile | undefined,
    dto: UploadVersionDto,
    ctx: RequestContext,
  ): Promise<ResumeVersionDetail> {
    if (!file)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.FILE_REQUIRED,
        'Choose a PDF or DOCX file to upload.',
      );
    const resume = await this.resumes.loadOwned(userId, resumeId);
    this.assertNotArchived(resume.status);

    const validated = await this.resumes.validateUpload(userId, file, ctx);
    const stored = await this.resumes.storeFile(userId, resumeId, file, validated);

    let version: VersionWithFileAndContent;
    try {
      const resumeFile = await this.prisma.resumeFile.create({ data: stored });
      version = await this.createVersion(
        resumeId,
        {
          status: 'DRAFT',
          source: 'UPLOAD',
          parentVersionId: resume.currentVersionId,
          notes: dto.notes ?? null,
          fileId: resumeFile.id,
          parseStatus: 'PENDING',
        },
        null,
      );
    } catch (error) {
      await this.prisma.resumeFile
        .deleteMany({ where: { storageKey: stored.storageKey } })
        .catch(() => undefined);
      await this.storage.delete([stored.storageKey]).catch(() => undefined);
      throw error;
    }

    this.dispatcher.dispatch(version.id);
    await this.audit.record({
      action: AuditAction.RESUME_UPLOADED,
      userId,
      requestId: ctx.requestId,
      metadata: {
        resumeId,
        versionId: version.id,
        mimeType: validated.mimeType,
        sizeBytes: file.buffer.length,
      },
    });
    await this.audit.record({
      action: AuditAction.RESUME_VERSION_CREATED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionId: version.id, source: 'UPLOAD' },
    });
    await this.audit.record({
      action: AuditAction.RESUME_PARSE_STARTED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionId: version.id },
    });
    return toVersionDetail(version);
  }

  async parseStatus(
    userId: string,
    resumeId: string,
    versionId: string,
  ): Promise<ParseStatusResponse> {
    const v = await this.loadOwned(userId, resumeId, versionId);
    return {
      versionId: v.id,
      versionNumber: v.versionNumber,
      parseStatus: v.parseStatus,
      parseError: v.parseError,
      parsedAt: v.parsedAt?.toISOString() ?? null,
    };
  }

  /** Re-runs parsing on a draft's original upload (e.g. after a failure). */
  async reparse(
    userId: string,
    resumeId: string,
    versionId: string,
    ctx: RequestContext,
  ): Promise<ParseStatusResponse> {
    const v = await this.loadOwned(userId, resumeId, versionId);
    if (v.status !== 'DRAFT') throw notEditable();
    if (!v.fileId || v.source !== 'UPLOAD') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.VERSION_NOT_READY,
        'This version has no uploaded file to parse.',
      );
    }
    if (v.parseStatus === 'PENDING' || v.parseStatus === 'PROCESSING')
      return this.parseStatus(userId, resumeId, versionId);

    await this.prisma.resumeVersion.update({
      where: { id: v.id },
      data: { parseStatus: 'PENDING', parseError: null },
    });
    this.dispatcher.dispatch(v.id);
    await this.audit.record({
      action: AuditAction.RESUME_PARSE_STARTED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionId, reparse: true },
    });
    return this.parseStatus(userId, resumeId, versionId);
  }

  async extractedData(
    userId: string,
    resumeId: string,
    versionId: string,
  ): Promise<ResumeExtractedData> {
    const v = await this.loadOwned(userId, resumeId, versionId);
    const ai = (v.aiExtraction ?? null) as {
      status?: string;
      content?: unknown;
      reason?: string;
    } | null;
    const aiStatus =
      ai?.status === 'VALID' || ai?.status === 'INVALID' || ai?.status === 'FAILED'
        ? ai.status
        : 'DISABLED';
    return {
      versionId: v.id,
      versionNumber: v.versionNumber,
      versionStatus: v.status,
      parseStatus: v.parseStatus,
      parseError: v.parseError,
      parserVersion: v.parserVersion,
      extractedText: v.extractedText,
      parsed: readContent(v.parsedData),
      ai: aiStatus === 'VALID' ? readContent(ai?.content) : null,
      aiStatus,
      aiNote: ai?.reason ?? null,
      confirmed: contentFromVersion(v),
      editable: v.status === 'DRAFT',
    };
  }

  /** Saves the content the user reviewed/edited. Allowed only on drafts. */
  async confirmContent(
    userId: string,
    resumeId: string,
    versionId: string,
    content: ResumeContent,
    ctx: RequestContext,
  ): Promise<ResumeExtractedData> {
    const v = await this.loadOwned(userId, resumeId, versionId);
    if (v.status !== 'DRAFT') throw notEditable();
    if (v.parseStatus === 'PENDING' || v.parseStatus === 'PROCESSING') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.VERSION_NOT_READY,
        'Wait for processing to finish before saving.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await writeContent(tx, v.id, content, { confirmed: true });
      // Extraction reviewed by the user → parsing is complete.
      if (v.parseStatus === 'NEEDS_REVIEW')
        await tx.resumeVersion.update({ where: { id: v.id }, data: { parseStatus: 'COMPLETED' } });
    });
    await this.audit.record({
      action: AuditAction.RESUME_VERSION_CONTENT_UPDATED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionId },
    });
    return this.extractedData(userId, resumeId, versionId);
  }

  /** Makes a reviewed draft the resume's current version; the previous one is retained as ARCHIVED. */
  async activate(
    userId: string,
    resumeId: string,
    versionId: string,
    ctx: RequestContext,
  ): Promise<ResumeVersionDetail> {
    const v = await this.loadOwned(userId, resumeId, versionId);
    if (v.status !== 'DRAFT') throw notEditable();
    if (!v.hasContent || v.contentConfirmedAt === null) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.VERSION_NOT_READY,
        'Review and save this version’s information before making it current.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.resumeVersion.updateMany({
        where: { resumeId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED' },
      }),
      this.prisma.resumeVersion.update({
        where: { id: v.id },
        data: { status: 'ACTIVE', activatedAt: new Date() },
      }),
      this.prisma.resume.update({ where: { id: resumeId }, data: { currentVersionId: v.id } }),
    ]);
    await this.audit.record({
      action: AuditAction.RESUME_VERSION_ACTIVATED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionId },
    });
    return this.get(userId, resumeId, versionId);
  }

  /** Streams the original uploaded file of a version the user owns. */
  async download(
    userId: string,
    resumeId: string,
    versionId: string,
    ctx: RequestContext,
  ): Promise<{ object: StoredObject; filename: string; mimeType: string }> {
    const v = await this.loadOwned(userId, resumeId, versionId);
    if (!v.file)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'This version has no original file.',
      );
    const object = await this.storage.get(v.file.storageKey);
    await this.audit.record({
      action: AuditAction.RESUME_FILE_DOWNLOADED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionId },
    });
    return { object, filename: v.file.originalFilename, mimeType: v.file.mimeType };
  }

  // ── Resume-level operations on the "working version" ──
  // The working version is the newest DRAFT if there is one, otherwise the current version
  // (or the newest version). These back /resumes/:id/parse, /parsing-status, /structured-data.

  async workingVersionId(userId: string, resumeId: string): Promise<string> {
    const resume = await this.resumes.loadOwned(userId, resumeId);
    const draft = resume.versions.find((v) => v.status === 'DRAFT');
    const id = draft?.id ?? resume.currentVersionId ?? resume.versions[0]?.id;
    if (!id) throw resumeNotFound();
    return id;
  }

  async resumeParseStatus(userId: string, resumeId: string): Promise<ParseStatusResponse> {
    return this.parseStatus(userId, resumeId, await this.workingVersionId(userId, resumeId));
  }

  async resumeReparse(
    userId: string,
    resumeId: string,
    ctx: RequestContext,
  ): Promise<ParseStatusResponse> {
    return this.reparse(userId, resumeId, await this.workingVersionId(userId, resumeId), ctx);
  }

  async resumeStructuredData(userId: string, resumeId: string): Promise<ResumeExtractedData> {
    return this.extractedData(userId, resumeId, await this.workingVersionId(userId, resumeId));
  }

  /**
   * Saves structured data for a resume without ever overwriting a frozen version:
   * edits go to the open draft, or a new draft is created from the current version.
   */
  async updateResumeStructuredData(
    userId: string,
    resumeId: string,
    content: ResumeContent,
    ctx: RequestContext,
  ): Promise<ResumeExtractedData> {
    let versionId = await this.workingVersionId(userId, resumeId);
    const working = await this.loadOwned(userId, resumeId, versionId);
    if (working.status !== 'DRAFT') {
      versionId = (await this.createDraft(userId, resumeId, { baseVersionId: working.id }, ctx)).id;
    }
    return this.confirmContent(userId, resumeId, versionId, content, ctx);
  }

  // ── Helpers ──

  private async loadOwned(
    userId: string,
    resumeId: string,
    versionId: string,
  ): Promise<VersionWithFileAndContent> {
    const version = await this.prisma.resumeVersion.findFirst({
      where: { id: versionId, resumeId, resume: { userId } },
      include: VERSION_INCLUDE,
    });
    if (!version) {
      // Distinguish only for the owner; a foreign resume id is indistinguishable from a missing one.
      await this.resumes.loadOwned(userId, resumeId);
      throw versionNotFound();
    }
    return version;
  }

  private assertNotArchived(status: string): void {
    if (status === 'ARCHIVED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.RESUME_ARCHIVED,
        'Restore this resume before adding versions.',
      );
    }
  }

  /** Allocates the next version number (retrying if a concurrent request took it) and copies content. */
  private async createVersion(
    resumeId: string,
    data: Omit<Prisma.ResumeVersionUncheckedCreateInput, 'resumeId' | 'versionNumber'>,
    content: ResumeContent | null,
  ): Promise<VersionWithFileAndContent> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const last = await this.prisma.resumeVersion.aggregate({
        where: { resumeId },
        _max: { versionNumber: true },
      });
      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const created = await tx.resumeVersion.create({
            data: { ...data, resumeId, versionNumber: (last._max.versionNumber ?? 0) + 1 },
          });
          if (content) await writeContent(tx, created.id, content, { confirmed: false });
          await tx.resume.update({ where: { id: resumeId }, data: { updatedAt: new Date() } });
          return created.id;
        });
        return await this.prisma.resumeVersion.findUniqueOrThrow({
          where: { id },
          include: VERSION_INCLUDE,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
          throw error;
      }
    }
    throw resumeNotFound();
  }
}
