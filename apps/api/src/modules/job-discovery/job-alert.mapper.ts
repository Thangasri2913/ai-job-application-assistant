import {
  type JobAlertItem,
  type JobRecommendationItem,
  type JobSearchRunItem,
  type JobSearchSourceResult,
  matchLevel,
} from '@job-assist/shared';
import type { Prisma } from '../../generated/prisma/client.js';

type AlertRow = Prisma.JobSearchAlertGetPayload<object>;
type RunRow = Prisma.JobSearchRunGetPayload<object>;

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function toRunItem(run: RunRow): JobSearchRunItem {
  return {
    id: run.id,
    alertId: run.alertId,
    trigger: run.trigger,
    status: run.status,
    jobsFound: run.jobsFound,
    jobsCreated: run.jobsCreated,
    jobsSkipped: run.jobsSkipped,
    belowThreshold: run.belowThreshold,
    recommendationsCreated: run.recommendationsCreated,
    sources: Array.isArray(run.sourceResults)
      ? (run.sourceResults as unknown as JobSearchSourceResult[])
      : [],
    errorMessage: run.errorMessage,
    note: run.note,
    startedAt: run.startedAt.toISOString(),
    completedAt: iso(run.completedAt),
  };
}

export function toAlertItem(
  alert: AlertRow,
  lastRun: RunRow | null,
  recommendationCount: number,
): JobAlertItem {
  return {
    id: alert.id,
    name: alert.name,
    keywords: alert.keywords,
    locations: alert.locations,
    remotePreference: alert.remotePreference,
    employmentTypes: alert.employmentTypes,
    experienceLevel: alert.experienceLevel,
    minimumMatchScore: alert.minimumMatchScore,
    resumeMode: alert.resumeMode,
    isActive: alert.isActive,
    schedule: {
      type: alert.scheduleType,
      time: alert.scheduleTime,
      days: alert.scheduleDays,
      timezone: alert.timezone,
    },
    lastRunAt: iso(alert.lastRunAt),
    nextRunAt: iso(alert.nextRunAt),
    lastRun: lastRun ? toRunItem(lastRun) : null,
    recommendationCount,
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  };
}

export const RECOMMENDATION_INCLUDE = {
  job: {
    select: {
      id: true,
      title: true,
      companyName: true,
      location: true,
      employmentType: true,
      jobUrl: true,
      isSampleData: true,
    },
  },
  alert: { select: { id: true, name: true } },
  discoveredJob: {
    select: {
      workMode: true,
      postedAt: true,
      source: { select: { key: true, name: true, isDevelopment: true } },
    },
  },
} as const satisfies Prisma.JobRecommendationInclude;

export type RecommendationRow = Prisma.JobRecommendationGetPayload<{
  include: typeof RECOMMENDATION_INCLUDE;
}>;

export function toRecommendationItem(r: RecommendationRow): JobRecommendationItem {
  return {
    id: r.id,
    status: r.status,
    matchScore: r.matchScore,
    level: matchLevel(r.matchScore),
    rank: r.rank,
    reason: r.reason,
    reasons: r.reasons,
    gaps: r.gaps,
    requiredSkills: { matched: r.requiredSkillsMatched, missing: r.requiredSkillsMissing },
    resume:
      r.resumeName !== null || r.recommendedResumeVersionId !== null
        ? {
            resumeId: r.resumeId,
            resumeVersionId: r.recommendedResumeVersionId,
            resumeName: r.resumeName,
            versionNumber: r.versionNumber,
          }
        : null,
    job: {
      id: r.job.id,
      title: r.job.title,
      companyName: r.job.companyName,
      location: r.job.location,
      employmentType: r.job.employmentType,
      workMode: r.discoveredJob?.workMode ?? null,
      jobUrl: r.job.jobUrl,
      postedAt: iso(r.discoveredJob?.postedAt ?? null),
      isSampleData: r.job.isSampleData,
    },
    source: r.discoveredJob?.source ?? null,
    alert: r.alert,
    createdAt: r.createdAt.toISOString(),
    viewedAt: iso(r.viewedAt),
    savedAt: iso(r.savedAt),
    dismissedAt: iso(r.dismissedAt),
    appliedAt: iso(r.appliedAt),
  };
}
