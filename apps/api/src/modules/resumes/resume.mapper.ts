import type {
  ResumeContent,
  ResumeDetail,
  ResumeSummary,
  ResumeVersionDetail,
  ResumeVersionSummary,
} from '@job-assist/shared';
import type {
  DefaultResume,
  Prisma,
  Resume,
  ResumeFile,
  ResumeVersion,
} from '../../generated/prisma/client.js';
import { contentFromVersion, type VersionWithContent } from './resume-content.repository.js';
import { resumeContentSchema } from './resume-content.schema.js';

/** Extraction output is plain JSON data; this narrows it to Prisma's JSON input type. */
export function toJson(value: object): Prisma.InputJsonObject {
  return value;
}

/** Reads stored extraction JSON defensively; anything malformed is treated as absent. */
export function readContent(value: unknown): ResumeContent | null {
  if (value === null || value === undefined) return null;
  const result = resumeContentSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function toVersionSummary(v: ResumeVersion): ResumeVersionSummary {
  return {
    id: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    source: v.source,
    parseStatus: v.parseStatus,
    hasFile: v.fileId !== null,
    notes: v.notes,
    parentVersionId: v.parentVersionId,
    hasAiExtraction: (v.aiExtraction as { status?: unknown } | null)?.status === 'VALID',
    contentConfirmedAt: v.contentConfirmedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    activatedAt: v.activatedAt?.toISOString() ?? null,
  };
}

export type VersionWithFileAndContent = VersionWithContent & { file: ResumeFile | null };

export function toVersionDetail(v: VersionWithFileAndContent): ResumeVersionDetail {
  return {
    ...toVersionSummary(v),
    file: v.file
      ? {
          originalFilename: v.file.originalFilename,
          mimeType: v.file.mimeType,
          sizeBytes: v.file.sizeBytes,
        }
      : null,
    parseError: v.parseError,
    parsedAt: v.parsedAt?.toISOString() ?? null,
    content: contentFromVersion(v),
  };
}

export type ResumeWithRelations = Resume & {
  currentVersion: ResumeVersion | null;
  versions: ResumeVersion[];
  defaultFor: DefaultResume | null;
  _count: { versions: number };
};

export function toResumeSummary(r: ResumeWithRelations): ResumeSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    tags: r.tags,
    status: r.status,
    isDefault: r.defaultFor !== null,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    versionCount: r._count.versions,
    currentVersion: r.currentVersion ? toVersionSummary(r.currentVersion) : null,
    latestVersion: r.versions[0] ? toVersionSummary(r.versions[0]) : null,
  };
}

export function toResumeDetail(r: ResumeWithRelations): ResumeDetail {
  return { ...toResumeSummary(r), versions: r.versions.map(toVersionSummary) };
}
