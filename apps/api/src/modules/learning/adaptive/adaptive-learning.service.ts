import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  DiagnosticResult,
  LearningAnalytics,
  LearningCategory,
  LearningDashboard,
  LearningPreferences,
  LearningRole,
  NextStepsResponse,
  RevisionQueueResponse,
  SkillAssessment,
  UpdateLearningPreferencesRequest,
} from '@job-assist/shared';
import { AppException } from '../../../common/errors/app.exception.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { INTERVIEW_QUESTIONS } from '../catalogue/interview-questions.js';
import type { InterviewEvaluation } from '../interview/interview-evaluator.js';
import { LearningProgressService } from '../learning-progress.service.js';
import { LearningService } from '../learning.service.js';
import { ProjectChallengesService } from '../projects/project-challenges.service.js';
import { LearningRecommendationsService } from '../recommendations/learning-recommendations.service.js';
import { SkillDemandService } from '../recommendations/skill-demand.service.js';
import { buildAnalytics } from './analytics.js';
import { rankNextSteps } from './next-steps.js';
import {
  type AttemptRecord,
  buildRevisionQueue,
  type DiagnosticRecord,
  type InterviewRecord,
  type LessonInfo,
  lessonKey,
} from './revision.js';

/** Dismissed suggestions kept per user (newest first). */
const MAX_DISMISSED = 100;
const GRADED = new Set(['MULTIPLE_CHOICE', 'FILL_IN_THE_GAP', 'SHORT_ANSWER']);

type Core = Omit<LearningDashboard, 'readiness' | 'analytics'>;

export interface AdaptiveSnapshot {
  revision: RevisionQueueResponse;
  dueActivities: { courseId: string; lessonId: string; activityId: string }[];
  nextSteps: NextStepsResponse;
  analytics: LearningAnalytics;
}

const EMPTY_PREFERENCES: LearningPreferences = {
  targetRole: null,
  interestCategories: [],
  interestSkillIds: [],
  weeklyGoalMinutes: null,
  dismissedSteps: [],
  updatedAt: null,
};

/**
 * Adaptive learning (ADR-0024): revision scheduling, ranked next steps, analytics and learner
 * preferences. Everything is computed from the user's own persisted records on request; only
 * preferences are stored. Resume content is read through the plan's owner-scoped assessment
 * and never copied.
 */
@Injectable()
export class AdaptiveLearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: LearningService,
    private readonly progress: LearningProgressService,
    private readonly projects: ProjectChallengesService,
    private readonly recommendations: LearningRecommendationsService,
    private readonly demand: SkillDemandService,
  ) {}

  // ── Preferences ──

  async getPreferences(userId: string): Promise<LearningPreferences> {
    const row = await this.prisma.learningPreferences.findUnique({ where: { userId } });
    if (!row) return EMPTY_PREFERENCES;
    return {
      targetRole: row.targetRole as LearningRole | null,
      interestCategories: row.interestCategories as LearningCategory[],
      interestSkillIds: row.interestSkillIds.filter((id) => this.catalogue.index.skillById.has(id)),
      weeklyGoalMinutes: row.weeklyGoalMinutes,
      dismissedSteps: (row.dismissedSteps as LearningPreferences['dismissedSteps'] | null) ?? [],
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Replaces the preferences (idempotent). Dismissed suggestions are kept. */
  async updatePreferences(
    userId: string,
    request: UpdateLearningPreferencesRequest,
  ): Promise<LearningPreferences> {
    const unknown = request.interestSkillIds.filter(
      (id) => !this.catalogue.index.skillById.has(id),
    );
    if (unknown.length)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.BAD_REQUEST,
        'Unknown skill in interests.',
      );
    const data = {
      targetRole: request.targetRole,
      interestCategories: [...new Set(request.interestCategories)],
      interestSkillIds: [...new Set(request.interestSkillIds)],
      weeklyGoalMinutes: request.weeklyGoalMinutes,
    };
    await this.prisma.learningPreferences.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.getPreferences(userId);
  }

  async dismiss(userId: string, key: string): Promise<LearningPreferences> {
    const current = await this.getPreferences(userId);
    const dismissed = [
      { key, dismissedAt: new Date().toISOString() },
      ...current.dismissedSteps.filter((d) => d.key !== key),
    ].slice(0, MAX_DISMISSED);
    await this.saveDismissed(userId, dismissed);
    return this.getPreferences(userId);
  }

  async restoreDismissed(userId: string): Promise<LearningPreferences> {
    await this.saveDismissed(userId, []);
    return this.getPreferences(userId);
  }

  // ── Revision, next steps and analytics ──

  async revision(userId: string): Promise<RevisionQueueResponse> {
    return (await this.snapshot(userId)).revision;
  }

  async nextSteps(userId: string): Promise<NextStepsResponse> {
    return (await this.snapshot(userId)).nextSteps;
  }

  /** Everything computed at once (used by the dashboard). */
  async snapshot(userId: string, core?: Core): Promise<AdaptiveSnapshot> {
    const now = new Date();
    const { index } = this.catalogue;
    const [
      coreData,
      preferences,
      attemptRows,
      completionRows,
      assessmentRows,
      interviewRows,
      projects,
      evidence,
      demand,
    ] = await Promise.all([
      core ? Promise.resolve(core) : this.progress.dashboard(userId),
      this.getPreferences(userId),
      this.prisma.learningActivityAttempt.findMany({
        where: { userId },
        select: {
          courseId: true,
          lessonId: true,
          activityId: true,
          correct: true,
          createdAt: true,
        },
      }),
      this.prisma.learningLessonCompletion.findMany({
        where: { userId },
        select: { courseId: true, lessonId: true, completedAt: true },
      }),
      this.prisma.learningAssessmentAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { courseId: true, results: true, createdAt: true },
      }),
      this.prisma.learningInterviewAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { questionId: true, feedback: true, createdAt: true },
      }),
      this.projects.overview(userId),
      this.progress.latestSkillEvidence(userId),
      this.demand.forUser(userId, null),
    ]);

    // Catalogue lessons with their graded activities (retired content simply drops out).
    const lessons = new Map<string, LessonInfo>();
    const minutes = new Map<string, number>();
    for (const course of index.courses)
      for (const { lesson } of index.lessonsByCourse.get(course.id) ?? []) {
        const skillIds = lesson.skillIds.length ? lesson.skillIds : course.skills.map((s) => s.id);
        lessons.set(lessonKey(course.id, lesson.id), {
          courseId: course.id,
          lessonId: lesson.id,
          title: lesson.title,
          skillNames: skillIds.map((id) => index.skillById.get(id)?.name ?? id),
          activities: lesson.activities
            .filter((a) => GRADED.has(a.type))
            .map((a) => ({ activityId: a.id, prompt: a.prompt })),
        });
        minutes.set(lessonKey(course.id, lesson.id), lesson.estimatedMinutes);
      }

    const attempts: AttemptRecord[] = attemptRows;
    const diagnostics = this.diagnosticRecords(assessmentRows);
    const interviews = this.interviewRecords(interviewRows);
    const { queue, dueActivities } = buildRevisionQueue({
      now,
      attempts,
      lessons,
      completions: completionRows,
      diagnostics,
      interviews,
    });

    // Course states.
    const startedCourseIds = new Set(
      [
        ...coreData.courses.map((c) => c.course.id),
        ...completionRows.map((c) => c.courseId),
        ...attemptRows.map((a) => a.courseId),
        ...assessmentRows.map((a) => a.courseId),
      ].filter((id) => index.courseById.has(id)),
    );
    const completedCourseIds = new Set(
      index.courses
        .filter((c) => c.lessonCount > 0)
        .filter((c) =>
          (index.lessonsByCourse.get(c.id) ?? []).every((l) =>
            completionRows.some((r) => r.courseId === c.id && r.lessonId === l.lesson.id),
          ),
        )
        .map((c) => c.id),
    );

    // Target-role skills, with resume evidence from the default resume when there is one.
    const roleSkills = preferences.targetRole
      ? await this.assessRoleSkills(userId, preferences.targetRole)
      : { skills: [], hasResume: false };

    const enrolled = [...coreData.courses]
      .sort((a, b) =>
        (b.progress.lastActivityAt ?? '').localeCompare(a.progress.lastActivityAt ?? ''),
      )
      .flatMap((e) => {
        const course = index.courseById.get(e.course.id);
        return course ? [{ course, progress: e.progress }] : [];
      });
    const jobSkills = demand.skills
      .filter((s): s is typeof s & { skillId: string } => s.skillId !== null)
      .map((s) => ({
        skillId: s.skillId,
        name: index.skillById.get(s.skillId)?.name ?? s.name,
        postings: s.postings,
        requiredIn: s.requiredIn,
      }))
      .filter((s) => {
        const e = evidence.get(s.skillId);
        return !e || e.total < 3 || e.correct / e.total < 0.8;
      });
    const ranked = rankNextSteps({
      revision: queue,
      projects,
      enrolled,
      courses: index.courses,
      completedCourseIds,
      startedCourseIds,
      preferences,
      roleSkills: roleSkills.skills,
      jobSkills,
      analysedJobs: demand.jobCount,
      dismissedKeys: new Set(preferences.dismissedSteps.map((d) => d.key)),
    });

    const relevantSkillIds = new Set([
      ...[...startedCourseIds].flatMap(
        (id) => index.courseById.get(id)?.skills.map((s) => s.id) ?? [],
      ),
      ...roleSkills.skills.map((s) => s.skillId),
    ]);
    const analytics = buildAnalytics({
      now,
      startedCourseIds,
      completedCourseIds,
      completions: completionRows
        .filter((c) => minutes.has(lessonKey(c.courseId, c.lessonId)))
        .map((c) => ({ ...c, minutes: minutes.get(lessonKey(c.courseId, c.lessonId))! })),
      attempts,
      diagnostics: assessmentRows.map((a) => ({ completedAt: a.createdAt })),
      interviewAttempts: interviewRows,
      skillEvidence: [...evidence].map(([skillId, e]) => ({ skillId, total: e.total })),
      relevantSkillIds,
      revision: { due: queue.dueCount, scheduled: queue.scheduledCount },
      projects,
      targetRole: preferences.targetRole,
      roleSkills: roleSkills.skills,
      weeklyGoalMinutes: preferences.weeklyGoalMinutes,
    });

    return {
      revision: queue,
      dueActivities,
      nextSteps: {
        steps: ranked.steps,
        dismissedCount: ranked.dismissedCount,
        basedOn: {
          targetRole: preferences.targetRole,
          interests: preferences.interestCategories.length + preferences.interestSkillIds.length,
          hasResume: roleSkills.hasResume,
          analysedJobs: demand.jobCount,
          practiceAnswers: attemptRows.filter((a) => a.correct !== null).length,
          diagnostics: assessmentRows.length,
        },
      },
      analytics,
    };
  }

  // ── Internals ──

  private async saveDismissed(userId: string, dismissed: LearningPreferences['dismissedSteps']) {
    const value = dismissed as unknown as Prisma.InputJsonValue;
    await this.prisma.learningPreferences.upsert({
      where: { userId },
      create: { userId, dismissedSteps: value },
      update: { dismissedSteps: value },
    });
  }

  /** The default resume's current version id, if the user has one (only the id is read). */
  async defaultResumeVersionId(userId: string): Promise<string | null> {
    const row = await this.prisma.defaultResume.findUnique({
      where: { userId },
      select: { resume: { select: { currentVersionId: true, status: true } } },
    });
    return row?.resume.status === 'ACTIVE' ? (row.resume.currentVersionId ?? null) : null;
  }

  /** Target-role core skills assessed with the plan's rules, using the default resume if any. */
  async assessRoleSkills(
    userId: string,
    role: LearningRole,
  ): Promise<{ skills: SkillAssessment[]; hasResume: boolean }> {
    const coreSkillIds =
      this.catalogue.index.roles.find((r) => r.id === role)?.coreSkills.map((s) => s.id) ?? [];
    const versionId = await this.defaultResumeVersionId(userId);
    try {
      const result = await this.recommendations.assessSkills(userId, {
        coreSkillIds,
        includeEvidencedSkills: false,
        resumeVersionId: versionId,
      });
      return { skills: result.skills, hasResume: Boolean(result.resume) };
    } catch (error) {
      // A default resume without reviewed content is simply not used.
      if (!(error instanceof AppException) || error.code !== ErrorCode.RESUME_CONTENT_MISSING)
        throw error;
      const result = await this.recommendations.assessSkills(userId, {
        coreSkillIds,
        includeEvidencedSkills: false,
      });
      return { skills: result.skills, hasResume: false };
    }
  }

  /** Latest diagnostic per course, with answered-but-wrong questions grouped by lesson. */
  private diagnosticRecords(
    rows: { courseId: string; results: Prisma.JsonValue; createdAt: Date }[],
  ): DiagnosticRecord[] {
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.courseId)) latest.set(r.courseId, r);
    return [...latest.values()].flatMap((r) => {
      const course = this.catalogue.index.courseById.get(r.courseId);
      const entry = this.catalogue.index.diagnostics.get(r.courseId);
      if (!course || !entry) return [];
      const results = r.results as unknown as Pick<DiagnosticResult, 'topics' | 'questions'>;
      const lessonOf = new Map(entry.questions.map((q) => [q.id, q.lessonId]));
      const wrongByLesson = new Map<string, number>();
      for (const q of results.questions ?? []) {
        // Only explicit "answered and wrong" counts; older results without the flag are skipped.
        if (q.correct || q.answered !== true) continue;
        const lessonId = lessonOf.get(q.questionId);
        if (lessonId) wrongByLesson.set(lessonId, (wrongByLesson.get(lessonId) ?? 0) + 1);
      }
      return [
        {
          courseId: r.courseId,
          courseTitle: course.title,
          completedAt: r.createdAt,
          wrongByLesson,
          skimLessonIds: new Set(
            (results.topics ?? [])
              .filter((t) => t.recommendation === 'SKIM')
              .map((t) => t.lessonId),
          ),
        },
      ];
    });
  }

  /** Latest attempt per interview question, with its missing concepts. */
  private interviewRecords(
    rows: { questionId: string; feedback: Prisma.JsonValue; createdAt: Date }[],
  ): InterviewRecord[] {
    const seen = new Set<string>();
    const records: InterviewRecord[] = [];
    for (const r of rows) {
      if (seen.has(r.questionId)) continue;
      seen.add(r.questionId);
      const question = INTERVIEW_QUESTIONS.find((q) => q.id === r.questionId);
      if (!question) continue;
      const evaluation = r.feedback as unknown as InterviewEvaluation;
      records.push({
        questionId: question.id,
        prompt: question.prompt,
        skillName: this.catalogue.index.skillById.get(question.skillId)?.name ?? question.skillId,
        attemptedAt: r.createdAt,
        missing: (evaluation.missingConceptIds ?? []).flatMap((id) => {
          const concept = question.concepts.find((c) => c.id === id);
          if (!concept) return [];
          const link = this.catalogue.revisionLink(concept.lessonId);
          return [
            {
              label: concept.label,
              courseId: link?.courseId ?? null,
              lessonId: link?.lessonId ?? null,
            },
          ];
        }),
      });
    }
    return records;
  }
}
