import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AnalysedJobRef,
  AnalysedJobsResponse,
  JobReadinessRequest,
  JobReadinessResponse,
  JobSkillReadiness,
} from '@job-assist/shared';
import { AppException } from '../../../common/errors/app.exception.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { createSkillLookup } from '../catalogue/skill-lookup.js';
import { InterviewPracticeService } from '../interview/interview-practice.service.js';
import { LearningService } from '../learning.service.js';
import { ProjectChallengesService } from '../projects/project-challenges.service.js';
import { LearningRecommendationsService } from '../recommendations/learning-recommendations.service.js';

const MAX_LESSONS_PER_SKILL = 3;

/**
 * Job readiness (ADR-0023): compares one of the user's own analysed jobs with their skill
 * evidence, using the personalised plan's rules (no second matcher). Only real job records the
 * user owns are used — nothing is invented, and there is no combined score.
 */
@Injectable()
export class JobReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: LearningService,
    private readonly recommendations: LearningRecommendationsService,
    private readonly interview: InterviewPracticeService,
    private readonly projects: ProjectChallengesService,
  ) {}

  async jobs(userId: string): Promise<AnalysedJobsResponse> {
    const jobs = await this.prisma.job.findMany({
      where: { userId, currentAnalysisId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        companyName: true,
        isSampleData: true,
        currentAnalysis: {
          select: {
            completedAt: true,
            _count: { select: { requirements: { where: { type: 'SKILL' } } } },
          },
        },
      },
    });
    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        companyName: j.companyName,
        isSampleData: j.isSampleData,
        analysedAt: j.currentAnalysis?.completedAt?.toISOString() ?? null,
        skillCount: j.currentAnalysis?._count.requirements ?? 0,
      })),
    };
  }

  async readiness(userId: string, request: JobReadinessRequest): Promise<JobReadinessResponse> {
    // Owner-scoped: another user's job id behaves like a missing one.
    const job = await this.prisma.job.findFirst({
      where: { id: request.jobId, userId },
      select: {
        id: true,
        title: true,
        companyName: true,
        isSampleData: true,
        selectedResumeVersionId: true,
        currentAnalysis: {
          select: {
            completedAt: true,
            requirements: {
              where: { type: 'SKILL' },
              orderBy: { sortOrder: 'asc' },
              select: { name: true, normalizedName: true, importance: true, origin: true },
            },
          },
        },
      },
    });
    if (!job) throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Job not found.');
    if (!job.currentAnalysis)
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.ANALYSIS_NOT_AVAILABLE,
        'This job has not been analysed yet. Analyse it from the job page first.',
      );

    const lookup = createSkillLookup(this.catalogue.index.skillById.values());
    // One entry per skill; a REQUIRED mention wins over PREFERRED.
    const requested = new Map<
      string,
      {
        name: string;
        importance: 'REQUIRED' | 'PREFERRED';
        origin: 'EXPLICIT' | 'INFERRED';
        skillId: string | null;
      }
    >();
    for (const r of job.currentAnalysis.requirements) {
      const skillId = lookup(r.normalizedName) ?? lookup(r.name);
      const key = skillId ?? `name:${r.normalizedName}`;
      const existing = requested.get(key);
      if (!existing || (existing.importance === 'PREFERRED' && r.importance === 'REQUIRED'))
        requested.set(key, { name: r.name, importance: r.importance, origin: r.origin, skillId });
    }
    const skillIds = [...requested.values()].flatMap((r) => (r.skillId ? [r.skillId] : []));

    const limitations = [
      'Job skills were extracted automatically from the posting and may be incomplete.',
      'Your side uses the same rules as the personalised plan: proficiency is unknown unless a diagnostic measured it.',
      'This is a comparison to guide practice, not a prediction of whether you would get the job.',
    ];
    if (job.isSampleData)
      limitations.unshift('This is development sample data, not a real job listing.');

    const explicitResume = Boolean(request.resumeVersionId);
    const resumeVersionId = request.resumeVersionId ?? job.selectedResumeVersionId;
    let assessment;
    try {
      assessment = await this.recommendations.assessSkills(userId, {
        coreSkillIds: skillIds,
        includeEvidencedSkills: false,
        resumeVersionId,
        corrections: request.corrections,
      });
    } catch (error) {
      // The job's selected resume may have no reviewed content; continue without it.
      if (
        explicitResume ||
        !(error instanceof AppException) ||
        error.code !== ErrorCode.RESUME_CONTENT_MISSING
      )
        throw error;
      assessment = await this.recommendations.assessSkills(userId, {
        coreSkillIds: skillIds,
        includeEvidencedSkills: false,
        corrections: request.corrections,
      });
      limitations.push(
        'The resume selected for this job has no reviewed content, so it was not used.',
      );
    }
    const bySkill = new Map(assessment.skills.map((s) => [s.skillId, s]));

    const skills: JobSkillReadiness[] = [...requested.values()].map((r) => ({
      name: r.name,
      importance: r.importance,
      jobSource: r.origin,
      skillId: r.skillId,
      assessment: r.skillId ? (bySkill.get(r.skillId) ?? null) : null,
      courses: r.skillId
        ? this.catalogue.index.courses
            .filter((c) => c.skills.some((s) => s.id === r.skillId))
            .map((c) => ({ id: c.id, title: c.title, status: c.status }))
        : [],
      lessons: r.skillId ? this.lessonsFor(r.skillId) : [],
      projectChallenges: r.skillId ? this.projects.forSkill(r.skillId) : [],
      interviewQuestionCount: r.skillId ? this.interview.questionCount(r.skillId) : 0,
    }));

    const basis = (b: string) => skills.filter((s) => s.assessment?.basis === b).length;
    const jobRef: AnalysedJobRef = {
      id: job.id,
      title: job.title,
      companyName: job.companyName,
      isSampleData: job.isSampleData,
      analysedAt: job.currentAnalysis.completedAt?.toISOString() ?? null,
      skillCount: job.currentAnalysis.requirements.length,
    };
    if (!skills.length) limitations.push('No skills were extracted from this posting.');
    return {
      job: jobRef,
      resume: assessment.resume,
      skills,
      counts: {
        requested: skills.length,
        measured: basis('MEASURED'),
        resumeEvidence: basis('RESUME_EVIDENCE'),
        userCorrected: basis('USER_CORRECTED'),
        unknown: basis('UNKNOWN'),
        notCatalogued: skills.filter((s) => !s.skillId).length,
        toPractise: skills.filter((s) => s.assessment?.gap).length,
      },
      limitations,
    };
  }

  private lessonsFor(skillId: string) {
    const links = this.catalogue.index.courses
      .filter((c) => c.status === 'PUBLISHED')
      .flatMap((c) => (this.catalogue.index.lessonsByCourse.get(c.id) ?? []).map((l) => l.lesson))
      .filter((l) => l.skillIds.includes(skillId))
      .map((l) => this.catalogue.revisionLink(l.id))
      .filter((l): l is NonNullable<typeof l> => l !== null);
    const unique = [...new Map(links.map((l) => [l.lessonId, l])).values()];
    return unique.slice(0, MAX_LESSONS_PER_SKILL);
  }
}
