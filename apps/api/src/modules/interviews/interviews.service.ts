import { HttpStatus, Injectable } from '@nestjs/common';
import {
  countWords,
  type CreateInterviewRequest,
  type EvaluationDimension,
  INTERVIEW_FEEDBACK_LABEL,
  type InterviewEvaluationItem,
  type InterviewFocus,
  type InterviewFocusAreas,
  type InterviewQuestionItem,
  type InterviewReport,
  type InterviewSessionDetail,
  type InterviewSessionSummary,
  type InterviewSessionType,
  matchLevel,
  RULES_FEEDBACK_LABEL,
  type StarLevel,
} from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PreparationContextLoader } from '../application-preparation/preparation-context.loader.js';
import type { PreparationContext } from '../application-preparation/preparation-context.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { InterviewAi } from './ai/interview-ai.js';
import { type DraftEvaluation, evaluateWithRules } from './rules/answer-evaluator.js';
import { generateQuestions } from './rules/question-generator.js';
import { buildReport } from './rules/report-builder.js';

const BUSY_TIMEOUT_MS = 5 * 60 * 1000;
const RULES_NOTE =
  'AI is not configured on this server: these are rule-based practice checks (topic coverage, structure, specificity, length). Technical accuracy is not assessed.';
const RULES_QUESTIONS_NOTE =
  'AI is not configured on this server: questions were built from the job’s requirements and your resume.';

const DEFAULT_FOCUS: Record<InterviewSessionType, InterviewFocus> = {
  PREPARATION: 'MIXED',
  MOCK_INTERVIEW: 'MIXED',
  TECHNICAL: 'TECHNICAL',
  BEHAVIORAL: 'BEHAVIORAL',
  HR: 'HR',
};

const notFound = (what = 'Interview') =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found.`);
const conflict = (code: ErrorCode, message: string) =>
  new AppException(HttpStatus.CONFLICT, code, message);
const toJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

const SESSION_INCLUDE = {
  application: { select: { job: { select: { id: true, title: true, companyName: true } } } },
  resumeVersion: {
    select: { id: true, versionNumber: true, resume: { select: { id: true, name: true } } },
  },
} as const satisfies Prisma.InterviewSessionInclude;

const DETAIL_INCLUDE = {
  ...SESSION_INCLUDE,
  questions: {
    orderBy: { order: 'asc' },
    include: { answers: { orderBy: { attempt: 'asc' }, include: { evaluation: true } } },
  },
} as const satisfies Prisma.InterviewSessionInclude;

type SessionRow = Prisma.InterviewSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;
type DetailRow = Prisma.InterviewSessionGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type EvaluationRow = Prisma.InterviewEvaluationGetPayload<object>;

function toSummary(s: SessionRow): InterviewSessionSummary {
  return {
    id: s.id,
    applicationId: s.applicationId,
    type: s.type,
    focus: s.focus,
    difficulty: s.difficulty,
    questionCount: s.questionCount,
    status: s.status,
    job: s.application.job,
    resume: {
      resumeId: s.resumeVersion.resume.id,
      resumeName: s.resumeVersion.resume.name,
      resumeVersionId: s.resumeVersion.id,
      versionNumber: s.resumeVersion.versionNumber,
    },
    overallScore: s.overallScore,
    startedAt: s.startedAt?.toISOString() ?? null,
    completedAt: s.completedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

function toEvaluation(e: EvaluationRow): InterviewEvaluationItem {
  return {
    id: e.id,
    source: e.source,
    overallScore: e.overallScore.toNumber(),
    dimensions: e.dimensions as Record<EvaluationDimension, number | null>,
    strengths: e.strengths,
    improvements: e.improvements,
    star: (e.star as InterviewEvaluationItem['star']) ?? null,
    technical: (e.technical as InterviewEvaluationItem['technical']) ?? null,
    feedback: e.feedback,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  };
}

/**
 * Interview practice and mock interviews for an application. Sessions keep the exact
 * application, job and resume version they were created with; questions are generated once;
 * answers are never changed; evaluations are stored separately.
 */
@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly applications: ApplicationsService,
    private readonly resumes: ResumesService,
    private readonly contexts: PreparationContextLoader,
    private readonly ai: InterviewAi,
  ) {}

  // ── Application-level ──

  /** What interviews for this application will focus on (from the job analysis and match). */
  async focus(userId: string, applicationId: string): Promise<InterviewFocusAreas> {
    const target = await this.applications.getPreparationTarget(userId, applicationId);
    let ctx: PreparationContext | null = null;
    try {
      ctx = await this.contexts.load(userId, applicationId);
    } catch (error) {
      if (!(error instanceof AppException && error.code === ErrorCode.ANALYSIS_NOT_AVAILABLE))
        throw error;
    }
    const version = await this.resumes.getVersionContent(userId, target.resumeVersionId);
    const job = await this.prisma.job.findFirstOrThrow({
      where: { id: target.jobId, userId },
      select: { id: true, title: true, companyName: true },
    });
    const skills = ctx?.match.evidence.skills ?? [];
    return {
      applicationId,
      job,
      resume: {
        resumeId: version?.resumeId ?? '',
        resumeName: version?.resumeName ?? '',
        resumeVersionId: target.resumeVersionId,
        versionNumber: version?.versionNumber ?? 0,
      },
      match: ctx ? { score: ctx.match.score, level: matchLevel(ctx.match.score) } : null,
      strengths: skills.filter((s) => s.status === 'MATCH').map((s) => s.skill),
      gaps: skills
        .filter((s) => s.status !== 'MATCH' && s.importance === 'REQUIRED')
        .map((s) => s.skill),
      responsibilities:
        ctx?.job.requirements.filter((r) => r.type === 'RESPONSIBILITY').map((r) => r.name) ?? [],
      aiEnabled: this.ai.enabled,
    };
  }

  async create(
    userId: string,
    applicationId: string,
    dto: CreateInterviewRequest,
    ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    const target = await this.applications.getPreparationTarget(userId, applicationId);
    if (target.archivedAt)
      throw conflict(
        ErrorCode.APPLICATION_ARCHIVED,
        'Restore this application to practise for it.',
      );
    const session = await this.prisma.interviewSession.create({
      data: {
        userId,
        applicationId: target.id,
        // The exact job and resume version of the application, kept even if they change later.
        jobId: target.jobId,
        resumeVersionId: target.resumeVersionId,
        type: dto.type,
        focus:
          dto.type === 'MOCK_INTERVIEW'
            ? (dto.focus ?? 'MIXED')
            : (dto.focus ?? DEFAULT_FOCUS[dto.type]),
        difficulty: dto.difficulty ?? 'MEDIUM',
        questionCount: dto.questionCount ?? 10,
      },
    });
    await this.audit.record({
      action: AuditAction.INTERVIEW_SESSION_CREATED,
      userId,
      requestId: ctx.requestId,
      metadata: {
        sessionId: session.id,
        applicationId,
        type: session.type,
        resumeVersionId: session.resumeVersionId,
      },
    });
    return this.get(userId, session.id);
  }

  async list(userId: string, applicationId?: string): Promise<InterviewSessionSummary[]> {
    if (applicationId) await this.applications.getPreparationTarget(userId, applicationId);
    const rows = await this.prisma.interviewSession.findMany({
      where: { userId, ...(applicationId ? { applicationId } : {}) },
      include: SESSION_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toSummary);
  }

  // ── Session ──

  async get(userId: string, sessionId: string): Promise<InterviewSessionDetail> {
    const s = await this.loadOwned(userId, sessionId);
    const isMock = s.type === 'MOCK_INTERVIEW';
    // In a mock interview, feedback is revealed only once the interview is completed.
    const reveal = !isMock || s.status === 'COMPLETED';
    const questions: InterviewQuestionItem[] = s.questions.map((q) => ({
      id: q.id,
      order: q.order,
      question: q.question,
      category: q.category,
      difficulty: q.difficulty,
      expectedTopics: reveal ? q.expectedTopics : [],
      rationale: reveal ? q.rationale : null,
      source: q.source,
      answers: q.answers.map((a) => ({
        id: a.id,
        attempt: a.attempt,
        answer: a.answer,
        createdAt: a.createdAt.toISOString(),
        evaluation: reveal && a.evaluation ? toEvaluation(a.evaluation) : null,
      })),
    }));
    return {
      ...toSummary(s),
      isMock,
      currentIndex: s.currentIndex,
      questions,
      questionsSource: s.questionsSource,
      questionsNote: s.questionsNote,
      busyOperation:
        s.busyOperation && s.busySince && Date.now() - s.busySince.getTime() < BUSY_TIMEOUT_MS
          ? s.busyOperation
          : null,
      aiEnabled: this.ai.enabled,
      hasReport: s.report !== null,
    };
  }

  /** Generates the session's questions once; later calls return the stored ones. */
  async generateQuestions(
    userId: string,
    sessionId: string,
    ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    const s = await this.loadOwned(userId, sessionId);
    this.assertOpen(s);
    if (s.questions.length > 0) return this.get(userId, sessionId);
    await this.withBusy(s.id, 'questions', async () => {
      const context = await this.contexts.load(userId, s.applicationId, s.resumeVersionId);
      const settings = { focus: s.focus, difficulty: s.difficulty, count: s.questionCount };
      const ai = await this.ai.generateInterviewQuestions(context, settings);
      const aiQuestions =
        ai?.status === 'VALID'
          ? ai.value.questions.map((q) => ({ ...q, source: 'AI' as const }))
          : [];
      const note =
        ai === null
          ? RULES_QUESTIONS_NOTE
          : ai.status !== 'VALID'
            ? `${ai.reason} Questions were built from the job’s requirements and your resume instead.`
            : null;
      // Top up (or fully generate) from the rule-based generator, avoiding duplicates.
      const seen = new Set(aiQuestions.map((q) => q.question.toLowerCase()));
      const ruleQuestions =
        aiQuestions.length < settings.count
          ? generateQuestions(context, settings)
              .filter((q) => !seen.has(q.question.toLowerCase()))
              .map((q) => ({ ...q, source: 'RULES' as const }))
          : [];
      const questions = [...aiQuestions, ...ruleQuestions].slice(0, settings.count);
      const source: 'AI' | 'RULES' = aiQuestions.length > 0 ? 'AI' : 'RULES';
      await this.prisma.$transaction([
        this.prisma.interviewQuestion.createMany({
          data: questions.map((q, i) => ({
            sessionId: s.id,
            order: i + 1,
            question: q.question,
            category: q.category,
            difficulty: q.difficulty,
            expectedTopics: q.expectedTopics,
            rationale: q.rationale,
            source: q.source,
          })),
        }),
        this.prisma.interviewSession.update({
          where: { id: s.id },
          data: { questionsSource: source, questionsNote: note, questionCount: questions.length },
        }),
      ]);
      await this.audit.record({
        action: AuditAction.INTERVIEW_QUESTIONS_GENERATED,
        userId,
        requestId: ctx.requestId,
        metadata: { sessionId, count: questions.length, source },
      });
    });
    return this.get(userId, sessionId);
  }

  async start(
    userId: string,
    sessionId: string,
    ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    const s = await this.loadOwned(userId, sessionId);
    this.assertOpen(s);
    if (s.questions.length === 0)
      throw conflict(ErrorCode.QUESTIONS_NOT_GENERATED, 'Generate the questions first.');
    if (s.status === 'CREATED') {
      await this.prisma.interviewSession.update({
        where: { id: s.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
      await this.audit.record({
        action: AuditAction.INTERVIEW_STARTED,
        userId,
        requestId: ctx.requestId,
        metadata: { sessionId, type: s.type },
      });
    }
    return this.get(userId, sessionId);
  }

  /** Stores the answer exactly as written. Practice allows new attempts; a mock interview takes one answer per question, in order. */
  async answer(
    userId: string,
    sessionId: string,
    questionId: string,
    text: string,
    ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    const s = await this.loadOwned(userId, sessionId);
    this.assertOpen(s);
    if (s.status !== 'IN_PROGRESS')
      throw conflict(ErrorCode.INTERVIEW_NOT_STARTED, 'Start the session before answering.');
    const q = s.questions.find((x) => x.id === questionId);
    if (!q) throw notFound('Question');
    const isMock = s.type === 'MOCK_INTERVIEW';
    if (isMock) {
      if (q.answers.length > 0)
        throw conflict(
          ErrorCode.ANSWER_EXISTS,
          'This question has already been answered in this mock interview.',
        );
      if (q.order !== s.currentIndex + 1)
        throw conflict(
          ErrorCode.ANSWER_OUT_OF_ORDER,
          `Answer question ${s.currentIndex + 1} next.`,
        );
    }
    const attempt = (q.answers.at(-1)?.attempt ?? 0) + 1;
    await this.prisma.$transaction([
      this.prisma.interviewAnswer.create({ data: { questionId: q.id, attempt, answer: text } }),
      ...(isMock
        ? [
            this.prisma.interviewSession.update({
              where: { id: s.id },
              data: { currentIndex: q.order },
            }),
          ]
        : [
            this.prisma.interviewSession.update({
              where: { id: s.id },
              data: { updatedAt: new Date() },
            }),
          ]),
    ]);
    await this.audit.record({
      action: AuditAction.INTERVIEW_ANSWER_SUBMITTED,
      userId,
      requestId: ctx.requestId,
      metadata: { sessionId, questionId, attempt, words: countWords(text) },
    });
    return this.get(userId, sessionId);
  }

  /** Practice feedback on the latest answer (practice sessions only; mock feedback comes at the end). */
  async evaluate(
    userId: string,
    sessionId: string,
    questionId: string,
    ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    const s = await this.loadOwned(userId, sessionId);
    this.assertOpen(s);
    if (s.type === 'MOCK_INTERVIEW')
      throw conflict(
        ErrorCode.EVALUATION_DEFERRED,
        'In a mock interview, feedback is given when you complete the interview.',
      );
    const q = s.questions.find((x) => x.id === questionId);
    if (!q) throw notFound('Question');
    const latest = q.answers.at(-1);
    if (!latest)
      throw conflict(ErrorCode.ANSWER_REQUIRED, 'Answer the question before asking for feedback.');
    if (!latest.evaluation) {
      await this.withBusy(s.id, 'evaluation', async () => {
        const context = await this.contexts.load(userId, s.applicationId, s.resumeVersionId);
        await this.evaluateAndStore(context, q, latest.id, latest.answer, userId, ctx);
      });
    }
    return this.get(userId, sessionId);
  }

  /** Ends the session: evaluates anything not yet evaluated and stores the final report. */
  async complete(userId: string, sessionId: string, ctx: RequestContext): Promise<InterviewReport> {
    const s = await this.loadOwned(userId, sessionId);
    if (s.status === 'COMPLETED') return this.report(userId, sessionId);
    this.assertOpen(s);
    if (!s.questions.some((q) => q.answers.length > 0))
      throw conflict(ErrorCode.NO_ANSWERS, 'Answer at least one question before completing.');
    await this.withBusy(s.id, 'report', async () => {
      const context = await this.contexts.load(userId, s.applicationId, s.resumeVersionId);
      const evaluations = new Map<string, DraftEvaluation & { source: string }>();
      for (const q of s.questions) {
        const latest = q.answers.at(-1);
        if (!latest) continue;
        const stored = latest.evaluation;
        const ev = stored
          ? toEvaluation(stored)
          : await this.evaluateAndStore(context, q, latest.id, latest.answer, userId, ctx);
        evaluations.set(q.id, ev);
      }
      const base = buildReport(
        s.questions.map((q) => {
          const ev = evaluations.get(q.id);
          return {
            category: q.category,
            expectedTopics: q.expectedTopics,
            score: ev ? ev.overallScore : null,
            strengths: ev?.strengths ?? [],
            improvements: ev?.improvements ?? [],
          };
        }),
      );
      const usedAi = [...evaluations.values()].some((e) => e.source === 'AI');
      const perQuestion = s.questions
        .map((q) => {
          const ev = evaluations.get(q.id);
          return `Q${q.order} (${q.category}): ${ev ? `${ev.overallScore}/10. Strengths: ${ev.strengths.join('; ')}. Improve: ${ev.improvements.join('; ')}` : 'not answered'}`;
        })
        .join('\n');
      const narrative = await this.ai.generateInterviewReport(context, perQuestion);
      const report: InterviewReport = {
        sessionId: s.id,
        ...base,
        strengths:
          narrative?.status === 'VALID' && narrative.value.strengths.length
            ? narrative.value.strengths
            : base.strengths,
        improvements:
          narrative?.status === 'VALID' && narrative.value.improvements.length
            ? [
                ...base.improvements.filter((i) => i.includes('not answered')),
                ...narrative.value.improvements,
              ]
            : base.improvements,
        label: usedAi ? INTERVIEW_FEEDBACK_LABEL : RULES_FEEDBACK_LABEL,
        source: usedAi ? 'AI' : 'RULES',
        summary: narrative?.status === 'VALID' ? narrative.value.summary : null,
        generatedAt: new Date().toISOString(),
      };
      await this.prisma.interviewSession.update({
        where: { id: s.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          overallScore: report.overallScore,
          report: toJson(report),
          startedAt: s.startedAt ?? new Date(),
        },
      });
      await this.audit.record({
        action: AuditAction.INTERVIEW_COMPLETED,
        userId,
        requestId: ctx.requestId,
        metadata: { sessionId, answered: report.answered, total: report.total },
      });
      await this.audit.record({
        action: AuditAction.INTERVIEW_REPORT_GENERATED,
        userId,
        requestId: ctx.requestId,
        metadata: { sessionId, overallScore: report.overallScore, source: report.source },
      });
    });
    return this.report(userId, sessionId);
  }

  async abandon(
    userId: string,
    sessionId: string,
    ctx: RequestContext,
  ): Promise<InterviewSessionDetail> {
    const s = await this.loadOwned(userId, sessionId);
    this.assertOpen(s);
    await this.prisma.interviewSession.update({
      where: { id: s.id },
      data: { status: 'ABANDONED', completedAt: new Date() },
    });
    await this.audit.record({
      action: AuditAction.INTERVIEW_ABANDONED,
      userId,
      requestId: ctx.requestId,
      metadata: { sessionId },
    });
    return this.get(userId, sessionId);
  }

  async report(userId: string, sessionId: string): Promise<InterviewReport> {
    const s = await this.prisma.interviewSession.findFirst({
      where: { id: sessionId, userId },
      select: { report: true, status: true },
    });
    if (!s) throw notFound();
    if (!s.report)
      throw conflict(ErrorCode.REPORT_NOT_READY, 'Complete the interview to see the report.');
    return s.report as unknown as InterviewReport;
  }

  // ── Internals ──

  private async loadOwned(userId: string, sessionId: string): Promise<DetailRow> {
    const s = await this.prisma.interviewSession.findFirst({
      where: { id: sessionId, userId },
      include: DETAIL_INCLUDE,
    });
    if (!s) throw notFound();
    return s;
  }

  private assertOpen(s: { status: string }): void {
    if (s.status === 'COMPLETED' || s.status === 'ABANDONED') {
      throw conflict(
        ErrorCode.INTERVIEW_CLOSED,
        `This session is ${s.status.toLowerCase()} and can’t be changed. Start a new session to practise again.`,
      );
    }
  }

  private async evaluateAndStore(
    context: PreparationContext,
    q: DetailRow['questions'][number],
    answerId: string,
    answer: string,
    userId: string,
    ctx: RequestContext,
  ): Promise<DraftEvaluation & { source: 'AI' | 'RULES' }> {
    const input = {
      question: q.question,
      category: q.category,
      difficulty: q.difficulty,
      expectedTopics: q.expectedTopics,
      answer,
    };
    const ai = await this.ai.evaluateInterviewAnswer(context, input);
    const ev: DraftEvaluation & { source: 'AI' | 'RULES'; note: string | null } =
      ai?.status === 'VALID'
        ? { ...ai.value, source: 'AI', note: null }
        : {
            ...evaluateWithRules(input),
            source: 'RULES',
            note:
              ai === null
                ? RULES_NOTE
                : `${ai.reason} These are rule-based practice checks instead; technical accuracy is not assessed.`,
          };
    await this.prisma.interviewEvaluation.create({
      data: {
        answerId,
        source: ev.source,
        overallScore: ev.overallScore,
        dimensions: toJson(ev.dimensions),
        strengths: ev.strengths,
        improvements: ev.improvements,
        star: ev.star ? toJson(ev.star as Record<string, StarLevel>) : undefined,
        technical: ev.technical ? toJson(ev.technical) : undefined,
        feedback: ev.feedback,
        note: ev.note,
      },
    });
    await this.audit.record({
      action: AuditAction.INTERVIEW_ANSWER_EVALUATED,
      userId,
      requestId: ctx.requestId,
      metadata: { questionId: q.id, answerId, source: ev.source, score: ev.overallScore },
    });
    return ev;
  }

  private async withBusy(
    sessionId: string,
    operation: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const staleBefore = new Date(Date.now() - BUSY_TIMEOUT_MS);
    const claimed = await this.prisma.interviewSession.updateMany({
      where: { id: sessionId, OR: [{ busyOperation: null }, { busySince: { lt: staleBefore } }] },
      data: { busyOperation: operation, busySince: new Date() },
    });
    if (claimed.count === 0)
      throw conflict(
        ErrorCode.AI_GENERATION_IN_PROGRESS,
        'Something is already being generated for this session. Wait for it to finish.',
      );
    try {
      await fn();
    } finally {
      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: { busyOperation: null, busySince: null },
      });
    }
  }
}
