import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  CareerProfile,
  ResumeContent,
  ResumeDetail,
  ResumeSort,
  ResumeSummary,
} from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AppConfigService } from '../../config/config.module.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma, ResumeFile } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { ProfileService } from '../profile/profile.service.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  CreateResumeFromProfileDto,
  DuplicateResumeDto,
  ListResumesQueryDto,
  UpdateResumeDto,
  UploadResumeDto,
} from './dto/resume.dto.js';
import { ParsingDispatcher } from './parsing/parsing-dispatcher.js';
import { validateResumeFile, type ValidatedResumeFile } from './parsing/resume-file-validator.js';
import { CONTENT_INCLUDE, contentFromVersion, writeContent } from './resume-content.repository.js';
import { resumeContentSchema } from './resume-content.schema.js';
import {
  type ResumeWithRelations,
  toJson,
  toResumeDetail,
  toResumeSummary,
} from './resume.mapper.js';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
}

/** A resume's current, confirmed content, as used for job matching. */
export interface MatchCandidate {
  resumeId: string;
  resumeName: string;
  isDefault: boolean;
  versionId: string;
  versionNumber: number;
  activatedAt: Date | null;
  content: ResumeContent;
}

export const resumeNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resume not found.');

const RELATIONS = {
  currentVersion: true,
  defaultFor: true,
  _count: { select: { versions: true } },
} as const;

/** Random, server-generated object key; never derived from the client filename. */
export function storageKeyFor(userId: string, resumeId: string, extension: string): string {
  return `users/${userId}/resumes/${resumeId}/${randomUUID()}.${extension}`;
}

/** Builds resume content strictly from the user's own profile facts. */
export function contentFromProfile(profile: CareerProfile): ResumeContent {
  const d = profile.details;
  return resumeContentSchema.parse({
    contact: {
      fullName: d.fullName,
      email: d.email,
      phone: d.phone,
      location: d.location,
      linkedinUrl: d.linkedinUrl,
      githubUrl: d.githubUrl,
      portfolioUrl: d.portfolioUrl,
    },
    headline: d.headline,
    summary: d.summary,
    skills: profile.skills.map((s) => ({ name: s.name, category: s.category })),
    experiences: profile.experiences.map((e) => ({
      company: e.company,
      jobTitle: e.jobTitle,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      isCurrent: e.isCurrent,
      responsibilities: e.responsibilities,
      achievements: e.achievements,
      technologies: e.technologies,
    })),
    educations: profile.educations.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      startDate: e.startDate,
      endDate: e.endDate,
      grade: e.grade,
    })),
    projects: profile.projects.map((p) => ({
      name: p.name,
      description: p.description,
      technologies: p.technologies,
      highlights: [...p.responsibilities, ...p.achievements],
      url: p.url,
    })),
    certifications: profile.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      date: c.issueDate,
    })),
    achievements: profile.achievements.map((a) =>
      a.description ? `${a.title}: ${a.description}` : a.title,
    ),
    languages: profile.languages.map((l) =>
      l.proficiency ? `${l.name} (${l.proficiency})` : l.name,
    ),
    // The user's own stated figure — not a computed estimate.
    estimatedYearsOfExperience: d.yearsOfExperience,
  });
}

/**
 * Resume identities: create, list, rename/tag, duplicate, archive/restore, delete, default.
 * Every query is scoped by userId; another user's resume id behaves like a missing one (404).
 */
@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dispatcher: ParsingDispatcher,
    private readonly profile: ProfileService,
    private readonly audit: AuditService,
    config: AppConfigService,
  ) {
    this.maxUploadBytes = config.get('RESUME_MAX_UPLOAD_BYTES', { infer: true });
  }

  // ── Queries ──

  async list(userId: string, query: ListResumesQueryDto): Promise<ResumeSummary[]> {
    const rows = await this.prisma.resume.findMany({
      where: { userId, ...(query.status === 'ALL' ? {} : { status: query.status }) },
      include: { ...RELATIONS, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      orderBy: [{ updatedAt: 'desc' }],
    });
    // Per-user resume counts are small; filter and sort case-insensitively in memory.
    const tag = query.tag?.trim().toLowerCase();
    const category = query.category?.trim().toLowerCase();
    const q = query.q?.trim().toLowerCase();
    const byOrder: Record<ResumeSort, (a: ResumeSummary, b: ResumeSummary) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    };
    return rows
      .map(toResumeSummary)
      .filter((r) => !tag || r.tags.some((t) => t.toLowerCase() === tag))
      .filter((r) => !category || r.category?.toLowerCase() === category)
      .filter(
        (r) =>
          !q ||
          [r.name, r.description, r.category, ...r.tags].some((v) => v?.toLowerCase().includes(q)),
      )
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || byOrder[query.sort](a, b));
  }

  async get(userId: string, resumeId: string): Promise<ResumeDetail> {
    return toResumeDetail(await this.loadOwned(userId, resumeId));
  }

  /**
   * The current, user-confirmed version of every ACTIVE resume, for job matching. Resumes
   * that can't be compared yet (no reviewed version, or no structured content) are listed
   * in `excluded` with a reason instead of being silently skipped.
   */
  async listMatchCandidates(userId: string): Promise<{
    candidates: MatchCandidate[];
    excluded: { resumeId: string; resumeName: string; reason: string }[];
  }> {
    const rows = await this.prisma.resume.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { defaultFor: true, currentVersion: { include: CONTENT_INCLUDE } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    const candidates: MatchCandidate[] = [];
    const excluded: { resumeId: string; resumeName: string; reason: string }[] = [];
    for (const r of rows) {
      const version = r.currentVersion;
      const content = version ? contentFromVersion(version) : null;
      if (!version) {
        excluded.push({
          resumeId: r.id,
          resumeName: r.name,
          reason: 'No reviewed version yet. Review the uploaded resume to include it.',
        });
      } else if (!content) {
        excluded.push({
          resumeId: r.id,
          resumeName: r.name,
          reason: 'The current version has no structured content to compare.',
        });
      } else {
        candidates.push({
          resumeId: r.id,
          resumeName: r.name,
          isDefault: r.defaultFor !== null,
          versionId: version.id,
          versionNumber: version.versionNumber,
          activatedAt: version.activatedAt,
          content,
        });
      }
    }
    return { candidates, excluded };
  }

  /**
   * The user's resume version that may be chosen for a job: the current version of one of
   * their ACTIVE resumes. Another user's (or a missing) version is reported as not found.
   */
  async findSelectableVersion(
    userId: string,
    versionId: string,
  ): Promise<
    { resumeId: string; resumeName: string; versionNumber: number } | 'NOT_FOUND' | 'NOT_SELECTABLE'
  > {
    const version = await this.prisma.resumeVersion.findFirst({
      where: { id: versionId, resume: { userId } },
      include: { resume: true },
    });
    if (!version) return 'NOT_FOUND';
    if (version.resume.status !== 'ACTIVE' || version.resume.currentVersionId !== version.id) {
      return 'NOT_SELECTABLE';
    }
    return {
      resumeId: version.resumeId,
      resumeName: version.resume.name,
      versionNumber: version.versionNumber,
    };
  }

  /** A version's confirmed content, if it belongs to the user (otherwise null). Read-only. */
  async getVersionContent(
    userId: string,
    versionId: string,
  ): Promise<{
    resumeId: string;
    resumeName: string;
    versionNumber: number;
    content: ResumeContent | null;
  } | null> {
    const version = await this.prisma.resumeVersion.findFirst({
      where: { id: versionId, resume: { userId } },
      include: { ...CONTENT_INCLUDE, resume: { select: { name: true } } },
    });
    if (!version) return null;
    return {
      resumeId: version.resumeId,
      resumeName: version.resume.name,
      versionNumber: version.versionNumber,
      content: contentFromVersion(version),
    };
  }

  /** Loads a resume with relations, or 404 if it doesn't exist or isn't the user's. */
  async loadOwned(userId: string, resumeId: string): Promise<ResumeWithRelations> {
    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, userId },
      include: { ...RELATIONS, versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!resume) throw resumeNotFound();
    return resume;
  }

  // ── Creation ──

  async upload(
    userId: string,
    file: UploadedFile | undefined,
    dto: UploadResumeDto,
    ctx: RequestContext,
  ): Promise<ResumeDetail> {
    if (!file)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.FILE_REQUIRED,
        'Choose a PDF or DOCX file to upload.',
      );

    const validated = await this.validateUpload(userId, file, ctx);
    const resumeId = randomUUID();
    const stored = await this.storeFile(userId, resumeId, file, validated);

    let versionId: string;
    try {
      versionId = await this.prisma.$transaction(async (tx) => {
        await tx.resume.create({
          data: {
            id: resumeId,
            userId,
            name: dto.name ?? validated.safeFilename.replace(/\.(pdf|docx)$/, ''),
            description: dto.description ?? null,
            category: dto.category ?? null,
            tags: dto.tags ?? [],
          },
        });
        const resumeFile = await tx.resumeFile.create({ data: stored });
        const version = await tx.resumeVersion.create({
          data: {
            resumeId,
            versionNumber: 1,
            status: 'DRAFT',
            source: 'UPLOAD',
            fileId: resumeFile.id,
            parseStatus: 'PENDING',
          },
        });
        return version.id;
      });
    } catch (error) {
      await this.storage.delete([stored.storageKey]).catch(() => undefined);
      throw error;
    }

    this.dispatcher.dispatch(versionId);
    await this.audit.record({
      action: AuditAction.RESUME_UPLOADED,
      userId,
      requestId: ctx.requestId,
      metadata: {
        resumeId,
        versionId,
        mimeType: validated.mimeType,
        sizeBytes: file.buffer.length,
      },
    });
    await this.audit.record({
      action: AuditAction.RESUME_PARSE_STARTED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionId },
    });
    return this.get(userId, resumeId);
  }

  async createFromProfile(
    userId: string,
    dto: CreateResumeFromProfileDto,
    ctx: RequestContext,
  ): Promise<ResumeDetail> {
    const content = contentFromProfile(await this.profile.getProfile(userId));
    const resumeId = await this.prisma.$transaction(async (tx) => {
      const resume = await tx.resume.create({
        data: {
          userId,
          name: dto.name,
          description: dto.description ?? null,
          category: dto.category ?? null,
          tags: dto.tags ?? [],
        },
      });
      const version = await tx.resumeVersion.create({
        data: {
          resumeId: resume.id,
          versionNumber: 1,
          status: 'ACTIVE',
          source: 'PROFILE',
          parseStatus: 'NOT_APPLICABLE',
          activatedAt: new Date(),
          notes: 'Created from your career profile.',
        },
      });
      await writeContent(tx, version.id, content, { confirmed: true });
      await tx.resume.update({ where: { id: resume.id }, data: { currentVersionId: version.id } });
      return resume.id;
    });

    await this.audit.record({
      action: AuditAction.RESUME_CREATED_FROM_PROFILE,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId },
    });
    return this.get(userId, resumeId);
  }

  // ── Updates ──

  async update(
    userId: string,
    resumeId: string,
    dto: UpdateResumeDto,
    ctx: RequestContext,
  ): Promise<ResumeDetail> {
    await this.loadOwned(userId, resumeId);
    await this.prisma.resume.update({
      where: { id: resumeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
    });
    await this.audit.record({
      action: AuditAction.RESUME_UPDATED,
      userId,
      requestId: ctx.requestId,
      metadata: {
        resumeId,
        fields: Object.keys(dto).filter((k) => dto[k as keyof UpdateResumeDto] !== undefined),
      },
    });
    return this.get(userId, resumeId);
  }

  async archive(userId: string, resumeId: string, ctx: RequestContext): Promise<ResumeDetail> {
    const resume = await this.loadOwned(userId, resumeId);
    if (resume.status !== 'ARCHIVED') {
      await this.prisma.$transaction([
        // An archived resume can't stay the default.
        this.prisma.defaultResume.deleteMany({ where: { userId, resumeId } }),
        this.prisma.resume.update({
          where: { id: resumeId },
          data: { status: 'ARCHIVED', archivedAt: new Date() },
        }),
      ]);
      await this.audit.record({
        action: AuditAction.RESUME_ARCHIVED,
        userId,
        requestId: ctx.requestId,
        metadata: { resumeId },
      });
    }
    return this.get(userId, resumeId);
  }

  async restore(userId: string, resumeId: string, ctx: RequestContext): Promise<ResumeDetail> {
    const resume = await this.loadOwned(userId, resumeId);
    if (resume.status !== 'ACTIVE') {
      await this.prisma.resume.update({
        where: { id: resumeId },
        data: { status: 'ACTIVE', archivedAt: null },
      });
      await this.audit.record({
        action: AuditAction.RESUME_RESTORED,
        userId,
        requestId: ctx.requestId,
        metadata: { resumeId },
      });
    }
    return this.get(userId, resumeId);
  }

  async setDefault(userId: string, resumeId: string, ctx: RequestContext): Promise<ResumeDetail> {
    const resume = await this.loadOwned(userId, resumeId);
    if (resume.status === 'ARCHIVED') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.RESUME_ARCHIVED,
        'Restore this resume before making it the default.',
      );
    }
    // One row per user (PK user_id): upsert atomically replaces the previous default.
    await this.prisma.defaultResume.upsert({
      where: { userId },
      create: { userId, resumeId },
      update: { resumeId },
    });
    await this.audit.record({
      action: AuditAction.RESUME_SET_AS_DEFAULT,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId },
    });
    return this.get(userId, resumeId);
  }

  async clearDefault(userId: string, resumeId: string, ctx: RequestContext): Promise<ResumeDetail> {
    await this.loadOwned(userId, resumeId);
    const { count } = await this.prisma.defaultResume.deleteMany({ where: { userId, resumeId } });
    if (count > 0) {
      await this.audit.record({
        action: AuditAction.RESUME_DEFAULT_CLEARED,
        userId,
        requestId: ctx.requestId,
        metadata: { resumeId },
      });
    }
    return this.get(userId, resumeId);
  }

  async duplicate(
    userId: string,
    resumeId: string,
    dto: DuplicateResumeDto,
    ctx: RequestContext,
  ): Promise<ResumeDetail> {
    const source = await this.loadOwned(userId, resumeId);
    const baseId = source.currentVersionId ?? source.versions[0]?.id;
    if (!baseId) throw resumeNotFound();
    const base = await this.prisma.resumeVersion.findUniqueOrThrow({
      where: { id: baseId },
      include: { ...CONTENT_INCLUDE, file: true },
    });

    const newResumeId = randomUUID();
    // The copy owns an independent file so deleting one resume never affects the other.
    const fileCopy = base.file ? await this.copyFile(userId, newResumeId, base.file) : null;

    const baseIsFinal = base.status !== 'DRAFT';
    const content = contentFromVersion(base);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.resume.create({
          data: {
            id: newResumeId,
            userId,
            name: dto.name ?? `Copy of ${source.name}`.slice(0, 120),
            description: source.description,
            category: source.category,
            tags: source.tags,
          },
        });
        const file = fileCopy ? await tx.resumeFile.create({ data: fileCopy }) : null;
        const version = await tx.resumeVersion.create({
          data: {
            resumeId: newResumeId,
            versionNumber: 1,
            status: baseIsFinal ? 'ACTIVE' : 'DRAFT',
            source: 'DUPLICATE',
            notes: `Duplicated from "${source.name}" v${base.versionNumber}.`,
            fileId: file?.id ?? null,
            parseStatus:
              base.parseStatus === 'PENDING' || base.parseStatus === 'PROCESSING'
                ? 'NOT_APPLICABLE'
                : base.parseStatus,
            parseError: base.parseError,
            parserVersion: base.parserVersion,
            parsedAt: base.parsedAt,
            extractedText: base.extractedText,
            parsedData: base.parsedData === null ? undefined : toJson(base.parsedData as object),
            aiExtraction:
              base.aiExtraction === null ? undefined : toJson(base.aiExtraction as object),
            activatedAt: baseIsFinal ? new Date() : null,
          },
        });
        if (content) {
          await writeContent(tx, version.id, content, { confirmed: false });
          if (base.contentConfirmedAt) {
            await tx.resumeVersion.update({
              where: { id: version.id },
              data: { contentConfirmedAt: base.contentConfirmedAt },
            });
          }
        }
        if (baseIsFinal)
          await tx.resume.update({
            where: { id: newResumeId },
            data: { currentVersionId: version.id },
          });
      });
    } catch (error) {
      if (fileCopy) await this.storage.delete([fileCopy.storageKey]).catch(() => undefined);
      throw error;
    }

    await this.audit.record({
      action: AuditAction.RESUME_DUPLICATED,
      userId,
      requestId: ctx.requestId,
      metadata: { sourceResumeId: resumeId, sourceVersionId: base.id, resumeId: newResumeId },
    });
    return this.get(userId, newResumeId);
  }

  /**
   * Permanently deletes a resume, all its versions and its files.
   * Future: once applications reference resume versions, deletion of a referenced
   * resume will be refused (archive instead) so application history stays intact.
   */
  async remove(userId: string, resumeId: string, ctx: RequestContext): Promise<void> {
    const resume = await this.loadOwned(userId, resumeId);
    // A version used for an application must stay retrievable: such resumes are archive-only.
    const applications = await this.prisma.application.count({
      where: { userId, resumeVersion: { resumeId } },
    });
    if (applications > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.RESUME_IN_USE,
        `This resume was used for ${applications} application${applications === 1 ? '' : 's'}. Archive it instead of deleting it.`,
      );
    }
    const fileIds = [
      ...new Set(resume.versions.map((v) => v.fileId).filter((id): id is string => id !== null)),
    ];

    const wasDefault = resume.defaultFor !== null;

    const { orphanedFiles, newDefaultId } = await this.prisma.$transaction(async (tx) => {
      await tx.resume.update({ where: { id: resumeId }, data: { currentVersionId: null } });
      await tx.resume.delete({ where: { id: resumeId } });
      // Deleting the default hands the role to the most recently updated active resume, if any.
      let promotedId: string | null = null;
      if (wasDefault) {
        const next = await tx.resume.findFirst({
          where: { userId, status: 'ACTIVE' },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (next) {
          await tx.defaultResume.create({ data: { userId, resumeId: next.id } });
          promotedId = next.id;
        }
      }
      // Files are only deleted when no remaining version references them.
      const orphans = await tx.resumeFile.findMany({
        where: { id: { in: fileIds }, userId, versions: { none: {} } },
      });
      await tx.resumeFile.deleteMany({ where: { id: { in: orphans.map((f) => f.id) } } });
      return { orphanedFiles: orphans, newDefaultId: promotedId };
    });
    try {
      await this.storage.delete(orphanedFiles.map((f) => f.storageKey));
    } catch (error) {
      // Rows are gone, so the files are unreachable; log for cleanup rather than failing the request.
      this.logger.error(
        { err: error, resumeId, fileCount: orphanedFiles.length },
        'Failed to delete resume files from storage',
      );
    }
    await this.audit.record({
      action: AuditAction.RESUME_DELETED,
      userId,
      requestId: ctx.requestId,
      metadata: { resumeId, versionCount: resume.versions.length },
    });
    if (newDefaultId) {
      await this.audit.record({
        action: AuditAction.RESUME_SET_AS_DEFAULT,
        userId,
        requestId: ctx.requestId,
        metadata: { resumeId: newDefaultId, reason: 'previous_default_deleted' },
      });
    }
  }

  // ── Helpers ──

  /** Validates an upload by content; records rejected uploads for security auditing. */
  async validateUpload(
    userId: string,
    file: UploadedFile,
    ctx: RequestContext,
  ): Promise<ValidatedResumeFile> {
    try {
      return await validateResumeFile(file.buffer, file.originalname, this.maxUploadBytes);
    } catch (error) {
      await this.audit.record({
        action: AuditAction.RESUME_UPLOAD_REJECTED,
        userId,
        requestId: ctx.requestId,
        metadata: {
          reason: error instanceof AppException ? error.code : 'unknown',
          sizeBytes: file.buffer.length,
        },
      });
      throw error;
    }
  }

  /** Puts the bytes in object storage and returns the ResumeFile row data (not yet saved). */
  async storeFile(
    userId: string,
    resumeId: string,
    file: UploadedFile,
    validated: ValidatedResumeFile,
  ): Promise<Prisma.ResumeFileUncheckedCreateInput & { storageKey: string }> {
    const storageKey = storageKeyFor(userId, resumeId, validated.kind);
    await this.storage.put(storageKey, file.buffer, validated.mimeType);
    return {
      userId,
      storageKey,
      originalFilename: validated.safeFilename,
      mimeType: validated.mimeType,
      sizeBytes: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  private async copyFile(userId: string, resumeId: string, file: ResumeFile) {
    const storageKey = storageKeyFor(
      userId,
      resumeId,
      file.mimeType === 'application/pdf' ? 'pdf' : 'docx',
    );
    await this.storage.copy(file.storageKey, storageKey);
    return {
      userId,
      storageKey,
      originalFilename: file.originalFilename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    };
  }
}
