import {
  type ExcludedResume,
  type JobAnalysisResult,
  type JobDetail,
  type JobRequirementItem,
  type JobSummary,
  type MatchAnalysisItem,
  type MatchEvidence,
  matchLevel,
  type ResumeRecommendationItem,
} from '@job-assist/shared';
import type { Prisma } from '../../generated/prisma/client.js';

export const JOB_INCLUDE = {
  analyses: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      status: true,
      error: true,
      createdAt: true,
      completedAt: true,
      jobContentHash: true,
    },
  },
  currentAnalysis: {
    select: { id: true, recommendation: { include: { matchAnalysis: true } } },
  },
  selectedResumeVersion: { include: { resume: { select: { id: true, name: true } } } },
  applications: {
    where: { archivedAt: null },
    take: 1,
    select: {
      id: true,
      status: true,
      resumeVersion: { select: { versionNumber: true, resume: { select: { name: true } } } },
    },
  },
} as const satisfies Prisma.JobInclude;

export type JobWithRelations = Prisma.JobGetPayload<{ include: typeof JOB_INCLUDE }>;
type RecommendationRow = Prisma.ResumeRecommendationGetPayload<{
  include: { matchAnalysis: true };
}>;
type AnalysisRow = Prisma.JobAnalysisGetPayload<{ include: { requirements: true } }>;
type MatchRow = Prisma.MatchAnalysisGetPayload<object>;

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function toRecommendationItem(r: RecommendationRow): ResumeRecommendationItem {
  return {
    id: r.id,
    analysisId: r.analysisId,
    matchAnalysisId: r.matchAnalysisId,
    resumeId: r.matchAnalysis.resumeId,
    resumeVersionId: r.resumeVersionId,
    resumeName: r.matchAnalysis.resumeName,
    versionNumber: r.matchAnalysis.versionNumber,
    score: r.score,
    level: matchLevel(r.score),
    reasons: r.reasons,
    gaps: r.gaps,
    generatedAt: r.generatedAt.toISOString(),
  };
}

export function toJobSummary(job: JobWithRelations): JobSummary {
  const recommendation = job.currentAnalysis?.recommendation ?? null;
  return {
    id: job.id,
    title: job.title,
    companyName: job.companyName,
    location: job.location,
    employmentType: job.employmentType,
    source: job.source,
    jobUrl: job.jobUrl,
    status: job.status,
    origin: job.origin,
    isSampleData: job.isSampleData,
    inLibrary: job.inLibrary,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    analysisStatus: job.analyses[0]?.status ?? null,
    bestMatch: recommendation
      ? {
          score: recommendation.score,
          level: matchLevel(recommendation.score),
          resumeName: recommendation.matchAnalysis.resumeName,
        }
      : null,
    selectedResumeName: job.selectedResumeVersion?.resume.name ?? null,
  };
}

export function toJobDetail(job: JobWithRelations): JobDetail {
  const latest = job.analyses[0];
  const recommendation = job.currentAnalysis?.recommendation ?? null;
  const selected = job.selectedResumeVersion;
  const application = job.applications[0];
  return {
    ...toJobSummary(job),
    description: job.description,
    archivedAt: iso(job.archivedAt),
    currentAnalysisId: job.currentAnalysisId,
    latestAnalysis: latest
      ? {
          id: latest.id,
          status: latest.status,
          error: latest.error,
          createdAt: latest.createdAt.toISOString(),
          completedAt: iso(latest.completedAt),
          outdated: latest.jobContentHash !== job.contentHash,
        }
      : null,
    recommendation: recommendation ? toRecommendationItem(recommendation) : null,
    selectedResume:
      selected && job.selectedAt
        ? {
            resumeId: selected.resume.id,
            resumeVersionId: selected.id,
            resumeName: selected.resume.name,
            versionNumber: selected.versionNumber,
            selectedAt: job.selectedAt.toISOString(),
            isRecommended: recommendation?.resumeVersionId === selected.id,
          }
        : null,
    application: application
      ? {
          id: application.id,
          status: application.status,
          resumeName: application.resumeVersion.resume.name,
          versionNumber: application.resumeVersion.versionNumber,
        }
      : null,
  };
}

export function toRequirementItem(r: AnalysisRow['requirements'][number]): JobRequirementItem {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    normalizedName: r.normalizedName,
    importance: r.importance,
    origin: r.origin,
    detectedBy: r.detectedBy,
    evidence: r.evidence,
    minYears: r.minYears,
  };
}

export function toAnalysisResult(a: AnalysisRow, jobContentHash: string): JobAnalysisResult {
  const aiStatus =
    (['VALID', 'INVALID', 'FAILED'] as const).find((s) => s === a.aiStatus) ?? 'DISABLED';
  return {
    id: a.id,
    jobId: a.jobId,
    status: a.status,
    error: a.error,
    analyzerVersion: a.analyzerVersion,
    summary: a.summary,
    aiSummary: a.aiSummary,
    seniority: a.seniority,
    seniorityOrigin:
      a.seniorityOrigin === 'STATED' || a.seniorityOrigin === 'INFERRED' ? a.seniorityOrigin : null,
    employmentType: a.employmentType,
    keywords: a.keywords,
    confidence: a.confidence === null ? null : a.confidence.toNumber(),
    aiStatus,
    aiNote: a.aiNote,
    aiProvider: a.aiProvider,
    requirements: [...a.requirements]
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map(toRequirementItem),
    outdated: a.jobContentHash !== jobContentHash,
    createdAt: a.createdAt.toISOString(),
    completedAt: iso(a.completedAt),
  };
}

export function toMatchItem(m: MatchRow): MatchAnalysisItem {
  return {
    id: m.id,
    subjectType: m.subjectType,
    resumeId: m.resumeId,
    resumeVersionId: m.resumeVersionId,
    resumeName: m.resumeName,
    versionNumber: m.versionNumber,
    isDefaultResume: m.isDefaultResume,
    overallScore: m.overallScore,
    level: matchLevel(m.overallScore),
    scores: {
      skills: m.skillScore,
      experience: m.experienceScore,
      responsibilities: m.responsibilityScore,
      projects: m.projectScore,
      education: m.educationScore,
      keywords: m.keywordScore,
    },
    strengths: m.strengths,
    gaps: m.gaps,
    evidence: m.evidence as unknown as MatchEvidence,
    rank: m.rank,
    createdAt: m.createdAt.toISOString(),
  };
}

export function readExcluded(value: unknown): ExcludedResume[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is ExcludedResume =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as ExcludedResume).resumeId === 'string' &&
      typeof (v as ExcludedResume).resumeName === 'string' &&
      typeof (v as ExcludedResume).reason === 'string',
  );
}
