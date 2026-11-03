import { Injectable } from '@nestjs/common';
import type {
  CatalogueSnapshot,
  InterviewPracticeResult,
  LearningPlanResult,
  LearningSnapshot,
  MentorToolPort,
  SkillAssessmentResult,
} from '@job-assist/career-mentor-agent';
import type {
  AnalysedJobRef,
  JobReadinessResponse,
  LearningPreferences,
  LearningRole,
  ProjectChallengeSummary,
} from '@job-assist/shared';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AdaptiveLearningService } from '../learning/adaptive/adaptive-learning.service.js';
import { bestCourseFor } from '../learning/adaptive/next-steps.js';
import { InterviewPracticeService } from '../learning/interview/interview-practice.service.js';
import { LearningProgressService } from '../learning/learning-progress.service.js';
import { LearningService } from '../learning/learning.service.js';
import { ProjectChallengesService } from '../learning/projects/project-challenges.service.js';
import { JobReadinessService } from '../learning/readiness/job-readiness.service.js';
import { LearningRecommendationsService } from '../learning/recommendations/learning-recommendations.service.js';

/**
 * The Career Mentor agent's approved tools (MentorToolPort from @job-assist/career-mentor-agent).
 * Each wraps an existing read-only service and keeps that service's ownership checks; the agent
 * calls them with the authenticated user's id from the request context — never an id from the
 * request body or a model. There is deliberately no generic data-access tool.
 */
@Injectable()
export class MentorTools implements MentorToolPort {
  constructor(
    private readonly catalogueService: LearningService,
    private readonly progress: LearningProgressService,
    private readonly adaptive: AdaptiveLearningService,
    private readonly recommendations: LearningRecommendationsService,
    private readonly interview: InterviewPracticeService,
    private readonly projects: ProjectChallengesService,
    private readonly readinessService: JobReadinessService,
  ) {}

  private catalogueCache: CatalogueSnapshot | undefined;

  /** Static catalogue content (no user data); computed once. */
  catalogue(): CatalogueSnapshot {
    if (this.catalogueCache) return this.catalogueCache;
    const { index } = this.catalogueService;
    const courses = index.courses.filter((c) => c.status === 'PUBLISHED');
    const skills = [...index.skillById.values()];
    const bestCourseBySkill: Record<string, string> = {};
    for (const s of skills) {
      const course = bestCourseFor(courses, s.id);
      if (course) bestCourseBySkill[s.id] = course.id;
    }
    this.catalogueCache = {
      courses,
      skills: skills.map((s) => ({ id: s.id, name: s.name, alsoKnownAs: s.alsoKnownAs ?? [] })),
      roleCoreSkills: Object.fromEntries(
        index.roles.map((r) => [r.id, r.coreSkills.map((s) => s.id)]),
      ),
      bestCourseBySkill,
    };
    return this.catalogueCache;
  }

  preferences(userId: string): Promise<LearningPreferences> {
    return this.adaptive.getPreferences(userId);
  }

  async learningSnapshot(userId: string): Promise<LearningSnapshot> {
    const [snapshot, states, evidence] = await Promise.all([
      this.adaptive.snapshot(userId),
      this.progress.courseStates(userId),
      this.progress.latestSkillEvidence(userId),
    ]);
    // Counts and ids only; the snapshot's due-activity list is not needed by the mentor.
    return {
      nextSteps: snapshot.nextSteps,
      revision: snapshot.revision,
      analytics: snapshot.analytics,
      enrolledCourseIds: [...states].filter(([, s]) => s.enrolled).map(([id]) => id),
      skillEvidence: [...evidence].map(([skillId, e]) => ({
        skillId,
        correct: e.correct,
        total: e.total,
      })),
    };
  }

  /** The plan's skill rules for a role (default resume when available) or for named skills. */
  async skillAssessment(
    userId: string,
    target: { role: LearningRole } | { skillIds: string[] },
  ): Promise<SkillAssessmentResult> {
    if ('role' in target) return this.adaptive.assessRoleSkills(userId, target.role);
    const versionId = await this.adaptive.defaultResumeVersionId(userId);
    const run = (resumeVersionId: string | null) =>
      this.recommendations.assessSkills(userId, {
        coreSkillIds: target.skillIds,
        includeEvidencedSkills: false,
        resumeVersionId,
      });
    try {
      const result = await run(versionId);
      return { skills: result.skills, hasResume: Boolean(result.resume) };
    } catch (error) {
      if (!isMissingResumeContent(error)) throw error;
      const result = await run(null);
      return { skills: result.skills, hasResume: false };
    }
  }

  /** The personalised plan for a role (default resume when it has reviewed content). */
  async learningPlan(userId: string, role: LearningRole): Promise<LearningPlanResult> {
    const versionId = await this.adaptive.defaultResumeVersionId(userId);
    try {
      return {
        role,
        plan: await this.recommendations.recommend(userId, {
          role,
          ...(versionId ? { resumeVersionId: versionId } : {}),
        }),
      };
    } catch (error) {
      if (!isMissingResumeContent(error)) throw error;
      return { role, plan: await this.recommendations.recommend(userId, { role }) };
    }
  }

  async interviewPractice(userId: string): Promise<InterviewPracticeResult> {
    const [list, overview] = await Promise.all([
      this.interview.list(userId, {}),
      this.interview.overview(userId),
    ]);
    return { questions: list.questions, overview };
  }

  async projectChallenges(userId: string): Promise<ProjectChallengeSummary[]> {
    return (await this.projects.list(userId, {})).challenges;
  }

  async analysedJobs(userId: string): Promise<AnalysedJobRef[]> {
    return (await this.readinessService.jobs(userId)).jobs;
  }

  /** Readiness for one of the user's jobs; another user's job id is reported as not found. */
  jobReadiness(userId: string, jobId: string): Promise<JobReadinessResponse> {
    return this.readinessService.readiness(userId, { jobId });
  }
}

function isMissingResumeContent(error: unknown): boolean {
  return error instanceof AppException && error.code === ErrorCode.RESUME_CONTENT_MISSING;
}
