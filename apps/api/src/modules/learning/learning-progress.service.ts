import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ActivityAnswer,
  type ActivityAttemptResult,
  type CourseProgress,
  type DiagnosticResult,
  type LearningDashboard,
  type NextLessonRef,
  type RevisionItem,
  SKILL_EVIDENCE_MIN_QUESTIONS,
  type SubmitDiagnosticRequest,
} from '@job-assist/shared';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { toSummary } from './catalogue/build.js';
import { gradeActivity, InvalidAnswerError } from './grading.js';
import { LearningService } from './learning.service.js';

const badRequest = (message: string) =>
  new AppException(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

/** A diagnostic topic counts as "skim" only when every question on it was answered correctly. */
const SKIM_THRESHOLD = 1;

interface ProgressRows {
  enrollments: { courseId: string; createdAt: Date }[];
  completions: { courseId: string; lessonId: string; completedAt: Date }[];
  attempts: {
    courseId: string;
    lessonId: string;
    activityId: string;
    correct: boolean | null;
    createdAt: Date;
  }[];
  assessments: {
    id: string;
    courseId: string;
    score: number;
    maxScore: number;
    results: Prisma.JsonValue;
    createdAt: Date;
  }[];
}

const latest = (dates: (Date | undefined)[]) =>
  dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);

/**
 * Per-user learning progress (ADR-0022). Every query is scoped to the authenticated user; ids
 * in requests are catalogue ids, validated against the catalogue before anything is stored.
 * Lesson completion, practice attempts, assessments and skill evidence are stored separately.
 */
@Injectable()
export class LearningProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: LearningService,
  ) {}

  // ── Enrolment ──

  async enroll(userId: string, courseId: string): Promise<CourseProgress> {
    const course = this.catalogue.get(courseId);
    if (course.status !== 'PUBLISHED')
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'This course is planned and cannot be started yet.',
      );
    await this.ensureEnrolled(userId, courseId);
    return this.courseProgress(userId, courseId);
  }

  /** Removes the course from "My learning". Recorded progress and assessments are kept. */
  async unenroll(userId: string, courseId: string): Promise<void> {
    this.catalogue.get(courseId);
    await this.prisma.learningEnrollment.deleteMany({ where: { userId, courseId } });
  }

  // ── Lessons ──

  async completeLesson(
    userId: string,
    courseId: string,
    lessonId: string,
  ): Promise<CourseProgress> {
    this.catalogue.lesson(courseId, lessonId);
    await this.ensureEnrolled(userId, courseId);
    await this.prisma.learningLessonCompletion.upsert({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      create: { userId, courseId, lessonId },
      update: {},
    });
    return this.courseProgress(userId, courseId);
  }

  async uncompleteLesson(
    userId: string,
    courseId: string,
    lessonId: string,
  ): Promise<CourseProgress> {
    this.catalogue.lesson(courseId, lessonId);
    await this.prisma.learningLessonCompletion.deleteMany({
      where: { userId, courseId, lessonId },
    });
    return this.courseProgress(userId, courseId);
  }

  // ── Activities ──

  async submitActivity(
    userId: string,
    courseId: string,
    activityId: string,
    answer: ActivityAnswer,
  ): Promise<ActivityAttemptResult> {
    const entry = this.catalogue.activity(courseId, activityId);
    let grade;
    try {
      grade = gradeActivity(entry.activity, answer);
    } catch (error) {
      if (error instanceof InvalidAnswerError) throw badRequest(error.message);
      throw error;
    }
    await this.ensureEnrolled(userId, courseId);
    const [previous, attempt] = await this.prisma.$transaction([
      this.prisma.learningActivityAttempt.count({ where: { userId, courseId, activityId } }),
      this.prisma.learningActivityAttempt.create({
        data: {
          userId,
          courseId,
          lessonId: entry.lessonId,
          activityId,
          answer: answer,
          correct: grade.correct,
          score: grade.score,
        },
      }),
    ]);
    return {
      activityId,
      ...grade,
      attemptNumber: previous + 1,
      recordedAt: attempt.createdAt.toISOString(),
    };
  }

  // ── Diagnostic ──

  async submitDiagnostic(
    userId: string,
    courseId: string,
    request: SubmitDiagnosticRequest,
  ): Promise<DiagnosticResult> {
    const diagnostic = this.catalogue.diagnosticEntry(courseId);
    const byId = new Map(diagnostic.questions.map((q) => [q.id, q]));
    const answers = new Map<string, string>();
    for (const a of request.answers) {
      const question = byId.get(a.questionId);
      if (!question)
        throw badRequest('The answers refer to questions that are not in this assessment.');
      if (answers.has(a.questionId)) throw badRequest('Each question can be answered only once.');
      if (!question.options.some((o) => o.id === a.optionId))
        throw badRequest('Choose one of the listed options for every answered question.');
      answers.set(a.questionId, a.optionId);
    }
    if (answers.size === 0) throw badRequest('Answer at least one question to get a result.');

    const lessons = new Map(this.catalogue.lessons(courseId).map((l) => [l.lesson.id, l.lesson]));
    const course = this.catalogue.get(courseId);
    // Unanswered questions count as not yet known — the learner was told not to guess.
    const questions = diagnostic.questions.map((q) => {
      const right = q.options.find((o) => o.correct)!;
      return {
        questionId: q.id,
        lessonId: q.lessonId,
        answered: answers.has(q.id),
        correct: answers.get(q.id) === right.id,
        correctOptionId: right.id,
        explanation: q.explanation,
      };
    });

    const topics = [...new Set(questions.map((q) => q.lessonId))].map((lessonId) => {
      const onTopic = questions.filter((q) => q.lessonId === lessonId);
      const correct = onTopic.filter((q) => q.correct).length;
      return {
        lessonId,
        lessonTitle: lessons.get(lessonId)?.title ?? lessonId,
        correct,
        total: onTopic.length,
        recommendation:
          correct / onTopic.length >= SKIM_THRESHOLD ? ('SKIM' as const) : ('STUDY' as const),
      };
    });

    const skillTotals = new Map<string, { correct: number; total: number }>();
    // Skill evidence counts only answered questions: skipping is "not yet known", not "wrong".
    for (const q of questions.filter((x) => x.answered)) {
      const lessonSkills = lessons.get(q.lessonId)?.skillIds ?? [];
      const skillIds = lessonSkills.length ? lessonSkills : course.skills.map((s) => s.id);
      for (const skillId of skillIds) {
        const t = skillTotals.get(skillId) ?? { correct: 0, total: 0 };
        t.total += 1;
        if (q.correct) t.correct += 1;
        skillTotals.set(skillId, t);
      }
    }
    const skills = [...skillTotals].map(([skillId, t]) => ({
      skillId,
      name: this.catalogue.index.skillById.get(skillId)?.name ?? skillId,
      ...t,
    }));

    const score = questions.filter((q) => q.correct).length;
    const publicQuestions = questions.map(({ lessonId: _l, ...q }) => q);
    await this.ensureEnrolled(userId, courseId);
    const attempt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.learningAssessmentAttempt.create({
        data: {
          userId,
          courseId,
          kind: 'DIAGNOSTIC',
          score,
          maxScore: questions.length,
          results: {
            topics,
            questions: publicQuestions,
            skills,
          },
        },
      });
      await tx.learningSkillEvidence.createMany({
        data: skills.map((s) => ({
          userId,
          skillId: s.skillId,
          assessmentAttemptId: created.id,
          correct: s.correct,
          total: s.total,
        })),
      });
      return created;
    });
    return {
      attemptId: attempt.id,
      courseId,
      score,
      maxScore: questions.length,
      completedAt: attempt.createdAt.toISOString(),
      topics,
      questions: publicQuestions,
      skills,
    };
  }

  // ── Reading progress ──

  async courseProgress(userId: string, courseId: string): Promise<CourseProgress> {
    this.catalogue.get(courseId);
    const rows = await this.loadRows(userId, [courseId]);
    return this.buildProgress(courseId, rows);
  }

  /** Course progress for the dashboard; LearningDashboardService adds readiness. */
  async dashboard(userId: string): Promise<Omit<LearningDashboard, 'readiness' | 'analytics'>> {
    const enrollments = await this.prisma.learningEnrollment.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { courseId: true },
    });
    // Courses removed from the catalogue since enrolment are skipped (retired content).
    const courseIds = enrollments
      .map((e) => e.courseId)
      .filter((id) => this.catalogue.index.courseById.has(id));
    const rows = await this.loadRows(userId, courseIds);
    const courses = courseIds.map((id) => ({
      course: toSummary(this.catalogue.index.courseById.get(id)!),
      progress: this.buildProgress(id, rows),
    }));

    const revision: RevisionItem[] = [];
    for (const { course, progress } of courses) {
      const lessons = new Map(
        (this.catalogue.index.lessonsByCourse.get(course.id) ?? []).map((l) => [
          l.lesson.id,
          l.lesson,
        ]),
      );
      for (const a of progress.activities) {
        if (a.latestCorrect !== false) continue;
        const lesson = lessons.get(a.lessonId);
        const activity = lesson?.activities.find((x) => x.id === a.activityId);
        if (!lesson || !activity) continue;
        revision.push({
          courseId: course.id,
          courseTitle: course.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          activityId: activity.id,
          prompt: activity.prompt,
        });
      }
    }

    const active = [...courses]
      .filter((c) => c.progress.nextLesson)
      .sort((a, b) =>
        (b.progress.lastActivityAt ?? '').localeCompare(a.progress.lastActivityAt ?? ''),
      );

    const evidence = await this.prisma.learningSkillEvidence.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { skillId: true, correct: true, total: true, createdAt: true },
    });
    const seen = new Set<string>();
    const assessedSkills = evidence.flatMap((e) => {
      if (seen.has(e.skillId)) return [];
      seen.add(e.skillId);
      const skill = this.catalogue.index.skillById.get(e.skillId);
      return skill
        ? [
            {
              skillId: e.skillId,
              name: skill.name,
              correct: e.correct,
              total: e.total,
              sufficient: e.total >= SKILL_EVIDENCE_MIN_QUESTIONS,
              assessedAt: e.createdAt.toISOString(),
            },
          ]
        : [];
    });

    return {
      courses,
      revision: revision.slice(0, 20),
      nextLesson: active[0]?.progress.nextLesson ?? null,
      remainingMinutes: courses.reduce((sum, c) => sum + c.progress.remainingMinutes, 0),
      assessedSkills,
    };
  }

  /** Latest assessment evidence per skill, for recommendations. */
  async latestSkillEvidence(
    userId: string,
  ): Promise<Map<string, { correct: number; total: number; assessedAt: Date; courseId: string }>> {
    const rows = await this.prisma.learningSkillEvidence.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        skillId: true,
        correct: true,
        total: true,
        createdAt: true,
        assessmentAttempt: { select: { courseId: true } },
      },
    });
    const result = new Map<
      string,
      { correct: number; total: number; assessedAt: Date; courseId: string }
    >();
    for (const r of rows)
      if (!result.has(r.skillId))
        result.set(r.skillId, {
          correct: r.correct,
          total: r.total,
          assessedAt: r.createdAt,
          courseId: r.assessmentAttempt.courseId,
        });
    return result;
  }

  /** Completed lesson ids and enrolment per course, for recommendations. */
  async courseStates(
    userId: string,
  ): Promise<Map<string, { enrolled: boolean; completed: number }>> {
    const [enrollments, completions] = await Promise.all([
      this.prisma.learningEnrollment.findMany({ where: { userId }, select: { courseId: true } }),
      this.prisma.learningLessonCompletion.groupBy({
        by: ['courseId'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);
    const states = new Map<string, { enrolled: boolean; completed: number }>();
    for (const e of enrollments) states.set(e.courseId, { enrolled: true, completed: 0 });
    for (const c of completions)
      states.set(c.courseId, {
        enrolled: states.get(c.courseId)?.enrolled ?? false,
        completed: c._count._all,
      });
    return states;
  }

  // ── Internals ──

  private async ensureEnrolled(userId: string, courseId: string): Promise<void> {
    await this.prisma.learningEnrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: {},
    });
  }

  private async loadRows(userId: string, courseIds: string[]): Promise<ProgressRows> {
    if (!courseIds.length)
      return { enrollments: [], completions: [], attempts: [], assessments: [] };
    const where = { userId, courseId: { in: courseIds } };
    const [enrollments, completions, attempts, assessments] = await Promise.all([
      this.prisma.learningEnrollment.findMany({
        where,
        select: { courseId: true, createdAt: true },
      }),
      this.prisma.learningLessonCompletion.findMany({
        where,
        select: { courseId: true, lessonId: true, completedAt: true },
      }),
      this.prisma.learningActivityAttempt.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          courseId: true,
          lessonId: true,
          activityId: true,
          correct: true,
          createdAt: true,
        },
      }),
      this.prisma.learningAssessmentAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          courseId: true,
          results: true,
          createdAt: true,
          score: true,
          maxScore: true,
        },
      }),
    ]);
    return { enrollments, completions, attempts, assessments };
  }

  private buildProgress(courseId: string, rows: ProgressRows): CourseProgress {
    const lessons = this.catalogue.index.lessonsByCourse.get(courseId) ?? [];
    const lessonIds = new Set(lessons.map((l) => l.lesson.id));
    const enrollment = rows.enrollments.find((e) => e.courseId === courseId);
    const completions = rows.completions.filter(
      (c) => c.courseId === courseId && lessonIds.has(c.lessonId),
    );
    const completed = new Set(completions.map((c) => c.lessonId));
    const attempts = rows.attempts.filter((a) => a.courseId === courseId);
    const assessment = rows.assessments.find((a) => a.courseId === courseId);

    const byActivity = new Map<string, CourseProgress['activities'][number]>();
    for (const a of attempts) {
      const current = byActivity.get(a.activityId);
      byActivity.set(a.activityId, {
        activityId: a.activityId,
        lessonId: a.lessonId,
        attempts: (current?.attempts ?? 0) + 1,
        latestCorrect: a.correct,
      });
    }

    let latestDiagnostic: DiagnosticResult | null = null;
    if (assessment) {
      const results = assessment.results as unknown as Pick<
        DiagnosticResult,
        'topics' | 'questions' | 'skills'
      >;
      latestDiagnostic = {
        attemptId: assessment.id,
        courseId,
        score: assessment.score,
        maxScore: assessment.maxScore,
        completedAt: assessment.createdAt.toISOString(),
        ...results,
      };
    }
    const skim = new Set(
      latestDiagnostic?.topics.filter((t) => t.recommendation === 'SKIM').map((t) => t.lessonId) ??
        [],
    );

    const pending = lessons.filter((l) => !completed.has(l.lesson.id));
    const next = pending.find((l) => !skim.has(l.lesson.id)) ?? pending[0];
    const nextLesson: NextLessonRef | null = next
      ? {
          courseId,
          lessonId: next.lesson.id,
          lessonTitle: next.lesson.title,
          moduleTitle: next.moduleTitle,
        }
      : null;

    const lastActivity = latest([
      enrollment?.createdAt,
      ...completions.map((c) => c.completedAt),
      ...attempts.map((a) => a.createdAt),
      assessment?.createdAt,
    ]);
    return {
      courseId,
      enrolled: Boolean(enrollment),
      enrolledAt: enrollment?.createdAt.toISOString() ?? null,
      lessonCount: lessons.length,
      completedLessonIds: lessons.map((l) => l.lesson.id).filter((id) => completed.has(id)),
      remainingMinutes: pending.reduce((sum, l) => sum + l.lesson.estimatedMinutes, 0),
      latestDiagnostic,
      skimLessonIds: [...skim].filter((id) => !completed.has(id)),
      activities: [...byActivity.values()],
      nextLesson,
      lastActivityAt: lastActivity?.toISOString() ?? null,
    };
  }
}
