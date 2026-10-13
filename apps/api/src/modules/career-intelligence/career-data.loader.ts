import { Injectable } from '@nestjs/common';
import type { ApplicationStatus, MatchEvidence, SkillMatchStatus } from '@job-assist/shared';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  ApplicationRecord,
  CareerData,
  InterviewSessionTopics,
  ResumeVersionRecord,
  TargetJobRecord,
} from './analytics/types.js';

/**
 * Loads one user's career data for analytics, read-only and scoped by userId (ADR-0019).
 * A fixed number of queries per report (no per-row queries). Historical values are read as
 * stored: each application's own match-score snapshot, and the required skills of the exact
 * analysis that snapshot came from — never recomputed.
 */
@Injectable()
export class CareerDataLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(userId: string): Promise<CareerData> {
    const [applications, targetJobs, resumes, sessions] = await Promise.all([
      this.prisma.application.findMany({
        where: { userId },
        select: {
          id: true,
          status: true,
          appliedAt: true,
          createdAt: true,
          source: true,
          matchScore: true,
          rejectionCategory: true,
          statusHistory: { select: { toStatus: true } },
          job: {
            select: {
              title: true,
              companyName: true,
              location: true,
              source: true,
              discoveries: {
                select: { workMode: true },
                where: { workMode: { not: null } },
                take: 1,
              },
              currentAnalysis: { select: { seniority: true } },
            },
          },
          resumeVersion: {
            select: {
              id: true,
              versionNumber: true,
              resume: { select: { id: true, name: true, status: true, currentVersionId: true } },
            },
          },
          matchAnalysis: {
            select: {
              analysis: {
                select: {
                  seniority: true,
                  requirements: {
                    where: { type: 'SKILL', importance: 'REQUIRED' },
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.job.findMany({
        where: {
          userId,
          status: 'ACTIVE',
          currentAnalysisId: { not: null },
          OR: [{ inLibrary: true }, { applications: { some: {} } }],
        },
        select: {
          id: true,
          currentAnalysis: {
            select: {
              requirements: {
                where: { type: 'SKILL' },
                select: { name: true, normalizedName: true, importance: true },
              },
              matches: {
                where: { subjectType: 'RESUME_VERSION', rank: 1 },
                select: { evidence: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.resume.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          status: true,
          currentVersionId: true,
          currentVersion: { select: { id: true, versionNumber: true } },
        },
      }),
      this.prisma.interviewSession.findMany({
        where: { userId, status: 'COMPLETED', report: { not: Prisma.DbNull } },
        select: { report: true },
      }),
    ]);

    const appRecords: ApplicationRecord[] = applications.map((a) => {
      const resume = a.resumeVersion.resume;
      const snapshot = a.matchAnalysis?.analysis ?? null;
      return {
        id: a.id,
        status: a.status,
        reached: [
          ...new Set<ApplicationStatus>([...a.statusHistory.map((h) => h.toStatus), a.status]),
        ],
        appliedAt: a.appliedAt,
        createdAt: a.createdAt,
        source: a.source ?? a.job.source,
        jobTitle: a.job.title,
        companyName: a.job.companyName,
        location: a.job.location,
        workMode: a.job.discoveries[0]?.workMode ?? null,
        seniority: snapshot?.seniority ?? a.job.currentAnalysis?.seniority ?? null,
        resume: {
          resumeId: resume.id,
          resumeName: resume.name,
          resumeVersionId: a.resumeVersion.id,
          versionNumber: a.resumeVersion.versionNumber,
          isCurrent: resume.currentVersionId === a.resumeVersion.id && resume.status === 'ACTIVE',
          resumeArchived: resume.status === 'ARCHIVED',
        },
        matchScore: a.matchScore,
        requiredSkills: snapshot?.requirements.map((r) => r.name) ?? [],
        rejectionCategory: a.rejectionCategory,
      };
    });

    const jobRecords: TargetJobRecord[] = targetJobs.map((job) => {
      const best = job.currentAnalysis?.matches[0];
      const evidence = best ? readSkillEvidence(best.evidence) : null;
      return {
        jobId: job.id,
        skills: (job.currentAnalysis?.requirements ?? []).map((r) => ({
          name: r.name,
          importance: r.importance,
          status: evidence ? (evidence.get(r.normalizedName) ?? 'MISSING') : null,
        })),
      };
    });

    // Versions to report: every active resume's current version, plus versions used in applications.
    const versionIds = new Set<string>([
      ...resumes
        .filter((r) => r.status === 'ACTIVE' && r.currentVersion)
        .map((r) => r.currentVersion!.id),
      ...appRecords.map((a) => a.resume.resumeVersionId),
    ]);
    const perJob = versionIds.size
      ? await this.prisma.matchAnalysis.groupBy({
          by: ['resumeVersionId', 'jobId'],
          where: { userId, resumeVersionId: { in: [...versionIds] } },
          _avg: { overallScore: true },
        })
      : [];
    const matchStats = new Map<string, { jobs: number; total: number }>();
    for (const row of perJob) {
      if (!row.resumeVersionId) continue;
      const s = matchStats.get(row.resumeVersionId) ?? { jobs: 0, total: 0 };
      s.jobs++;
      s.total += row._avg.overallScore ?? 0;
      matchStats.set(row.resumeVersionId, s);
    }
    const resumeVersions: ResumeVersionRecord[] = resumes
      .filter((r) => r.status === 'ACTIVE' && r.currentVersion)
      .map((r) => {
        const stats = matchStats.get(r.currentVersion!.id);
        return {
          resumeId: r.id,
          resumeName: r.name,
          resumeVersionId: r.currentVersion!.id,
          versionNumber: r.currentVersion!.versionNumber,
          isCurrent: true,
          resumeArchived: false,
          jobsMatched: stats?.jobs ?? 0,
          averageMatchScore: stats ? Math.round(stats.total / stats.jobs) : null,
        };
      });
    for (const a of appRecords) {
      if (resumeVersions.some((v) => v.resumeVersionId === a.resume.resumeVersionId)) continue;
      const stats = matchStats.get(a.resume.resumeVersionId);
      resumeVersions.push({
        ...a.resume,
        jobsMatched: stats?.jobs ?? 0,
        averageMatchScore: stats ? Math.round(stats.total / stats.jobs) : null,
      });
    }

    return {
      applications: appRecords,
      targetJobs: jobRecords,
      resumeVersions,
      interviewSessions: sessions.map((s) => readTopics(s.report)),
    };
  }
}

/** Skill evidence of a stored match, by normalized name. */
function readSkillEvidence(value: Prisma.JsonValue): Map<string, SkillMatchStatus> {
  const skills = (value as Partial<MatchEvidence> | null)?.skills;
  return new Map(
    Array.isArray(skills) ? skills.map((s) => [s.normalizedName, s.status] as const) : [],
  );
}

/** Topic practice scores from a stored interview report (ignores anything malformed). */
function readTopics(value: Prisma.JsonValue): InterviewSessionTopics {
  const topics = (value as { topics?: unknown } | null)?.topics;
  if (!Array.isArray(topics)) return { topics: [] };
  return {
    topics: topics.flatMap((t: unknown) => {
      const row = t as { topic?: unknown; score?: unknown };
      return typeof row.topic === 'string' && typeof row.score === 'number'
        ? [{ topic: row.topic, score: row.score }]
        : [];
    }),
  };
}
