import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  InterviewFeedback,
  InterviewPracticeQuery,
  InterviewPracticeQuestion,
  InterviewPracticeQuestionsResponse,
  InterviewQuestionDetail,
  ReadinessOverview,
} from '@job-assist/shared';
import { AppException } from '../../../common/errors/app.exception.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  INTERVIEW_QUESTIONS,
  type InterviewQuestionSource,
} from '../catalogue/interview-questions.js';
import { LearningService, learningNotFound } from '../learning.service.js';
import {
  evaluateInterviewAnswer,
  type InterviewEvaluation,
  PRACTICE_DISCLAIMER,
  TARGET_WORDS,
} from './interview-evaluator.js';

interface AttemptRow {
  id: string;
  questionId: string;
  answer: string;
  feedback: Prisma.JsonValue;
  createdAt: Date;
}

/**
 * Skill-based interview practice (ADR-0023). Separate from the application-bound interview
 * module, whose rule evaluator it reuses. Questions come from the static catalogue; attempts
 * belong to the authenticated user. Rubric concepts and example answers are only returned
 * with feedback, after an answer is submitted.
 */
@Injectable()
export class InterviewPracticeService {
  private readonly byId = new Map(INTERVIEW_QUESTIONS.map((q) => [q.id, q]));

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: LearningService,
  ) {}

  async list(
    userId: string,
    query: InterviewPracticeQuery,
  ): Promise<InterviewPracticeQuestionsResponse> {
    let skills: Set<string> | null = null;
    if (query.courseId)
      skills = new Set(this.catalogue.get(query.courseId).skills.map((s) => s.id));
    if (query.role) {
      const role = this.catalogue.index.roles.find((r) => r.id === query.role)!;
      const roleSkills = new Set(role.coreSkills.map((s) => s.id));
      skills = skills ? new Set([...skills].filter((s) => roleSkills.has(s))) : roleSkills;
    }
    const questions = INTERVIEW_QUESTIONS.filter(
      (q) =>
        (!skills || skills.has(q.skillId)) &&
        (!query.skill || q.skillId === query.skill) &&
        (!query.difficulty || q.difficulty === query.difficulty),
    );
    const counts = await this.prisma.learningInterviewAttempt.groupBy({
      by: ['questionId'],
      where: { userId, questionId: { in: questions.map((q) => q.id) } },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const stats = new Map(counts.map((c) => [c.questionId, c]));
    return {
      questions: questions.map((q) =>
        this.toPublic(
          q,
          stats.get(q.id)?._count._all ?? 0,
          stats.get(q.id)?._max.createdAt ?? null,
        ),
      ),
    };
  }

  async get(userId: string, questionId: string): Promise<InterviewQuestionDetail> {
    const question = this.question(questionId);
    const rows = await this.prisma.learningInterviewAttempt.findMany({
      where: { userId, questionId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, questionId: true, answer: true, feedback: true, createdAt: true },
    });
    return {
      question: this.toPublic(question, rows.length, rows[0]?.createdAt ?? null),
      attempts: rows.map((row, i) => this.toFeedback(question, row, rows.length - i)),
    };
  }

  async submit(userId: string, questionId: string, answer: string): Promise<InterviewFeedback> {
    const question = this.question(questionId);
    if (!answer.trim())
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.BAD_REQUEST,
        'Write an answer before asking for feedback.',
      );
    const evaluation = evaluateInterviewAnswer(question, answer);
    const [previous, row] = await this.prisma.$transaction([
      this.prisma.learningInterviewAttempt.count({ where: { userId, questionId } }),
      this.prisma.learningInterviewAttempt.create({
        data: {
          userId,
          questionId,
          skillId: question.skillId,
          answer,
          feedback: evaluation as unknown as Prisma.InputJsonValue,
          correctnessScore: evaluation.correctness.score,
        },
        select: { id: true, questionId: true, answer: true, feedback: true, createdAt: true },
      }),
    ]);
    return this.toFeedback(question, row, previous + 1);
  }

  /** Practice summary for the dashboard. */
  async overview(userId: string): Promise<ReadinessOverview['interview']> {
    const rows = await this.prisma.learningInterviewAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { questionId: true, feedback: true, createdAt: true, correctnessScore: true },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows)
      if (!latest.has(r.questionId) && this.byId.has(r.questionId)) latest.set(r.questionId, r);

    const recent = [...latest.values()].slice(0, 5).map((r) => {
      const q = this.byId.get(r.questionId)!;
      return {
        questionId: q.id,
        prompt: q.prompt,
        skillName: this.skillName(q.skillId),
        lastAttemptAt: r.createdAt.toISOString(),
        correctness: r.correctnessScore.toNumber(),
      };
    });
    const conceptsToRevise = [...latest.values()].flatMap((r) => {
      const q = this.byId.get(r.questionId)!;
      const evaluation = r.feedback as unknown as InterviewEvaluation;
      return (evaluation.missingConceptIds ?? []).flatMap((id) => {
        const concept = q.concepts.find((c) => c.id === id);
        return concept
          ? [
              {
                label: concept.label,
                skillName: this.skillName(q.skillId),
                revise: this.catalogue.revisionLink(concept.lessonId),
              },
            ]
          : [];
      });
    });
    return {
      attempts: rows.length,
      questionsPractised: latest.size,
      recent,
      conceptsToRevise: conceptsToRevise.slice(0, 10),
    };
  }

  /** Number of practice questions for a skill. */
  questionCount(skillId: string): number {
    return INTERVIEW_QUESTIONS.filter((q) => q.skillId === skillId).length;
  }

  private question(questionId: string): InterviewQuestionSource {
    const question = this.byId.get(questionId);
    if (!question) throw learningNotFound('Interview question');
    return question;
  }

  private skillName(skillId: string): string {
    return this.catalogue.index.skillById.get(skillId)?.name ?? skillId;
  }

  private toPublic(
    q: InterviewQuestionSource,
    attempts: number,
    lastAttemptAt: Date | null,
  ): InterviewPracticeQuestion {
    return {
      id: q.id,
      skill: { id: q.skillId, name: this.skillName(q.skillId) },
      difficulty: q.difficulty,
      prompt: q.prompt,
      courseIds: this.catalogue.publishedCourseIdsFor(q.skillId),
      conceptCount: q.concepts.length,
      targetWords: TARGET_WORDS[q.difficulty],
      attempts,
      lastAttemptAt: lastAttemptAt?.toISOString() ?? null,
    };
  }

  private toFeedback(
    q: InterviewQuestionSource,
    row: AttemptRow,
    attemptNumber: number,
  ): InterviewFeedback {
    const evaluation = row.feedback as unknown as InterviewEvaluation;
    const concept = (id: string) => q.concepts.find((c) => c.id === id);
    return {
      attemptId: row.id,
      questionId: row.questionId,
      attemptNumber,
      createdAt: row.createdAt.toISOString(),
      answer: row.answer,
      source: 'RULES',
      dimensions: {
        correctness: evaluation.correctness,
        clarity: evaluation.clarity,
        completeness: evaluation.completeness,
      },
      conceptsCovered: evaluation.coveredConceptIds.flatMap((id) => {
        const c = concept(id);
        return c ? [{ id, label: c.label }] : [];
      }),
      missingConcepts: evaluation.missingConceptIds.flatMap((id) => {
        const c = concept(id);
        return c ? [{ id, label: c.label, revise: this.catalogue.revisionLink(c.lessonId) }] : [];
      }),
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      exampleAnswer: q.exampleAnswer,
      disclaimer: PRACTICE_DISCLAIMER,
    };
  }
}
