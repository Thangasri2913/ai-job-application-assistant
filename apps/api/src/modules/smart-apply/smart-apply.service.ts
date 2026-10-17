import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUTO_SUBMIT_CONSENT_TEXT,
  AUTO_SUBMIT_CONSENT_VERSION,
  type AnswerQuestionRequest,
  type ApplicationUrlKind,
  canTransition,
  CANCELLABLE_STATES,
  checkLimits,
  type ManualSubmissionRequest,
  type PrepareSmartApplicationRequest,
  type ProfileAnswerItem,
  SMART_APPLY_STATE_LABELS,
  SMART_ANSWER_MAX_LENGTH,
  type SmartApplicationDetail,
  type SmartApplicationListResponse,
  type SmartApplicationMaterials,
  type SmartApplySettingsItem,
  type SmartApplyQuestion,
  type SmartApplyState,
  type SubmissionEligibility,
  type UpdateSmartApplySettingsRequest,
} from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ApplicationPreparationService } from '../application-preparation/application-preparation.service.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { JobAnalysisService } from '../jobs/analysis/job-analysis.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProfileService } from '../profile/profile.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  answerKeyOf,
  resolveAnswer,
  reasonFor,
  sensitivityOf,
  validUntil,
} from './answer-policy.js';
import { evaluateEligibility } from './eligibility.js';
import { EmployerQuestionsReader } from './employer-questions.js';
import type { ListSmartApplicationsQueryDto } from './dto/smart-apply.dto.js';
import { SmartApplyDispatcher } from './smart-apply-dispatcher.js';
import {
  discoveryOnlyReason,
  SUBMISSION_PROVIDERS,
  type SubmissionProvider,
  type SubmissionRequest,
  type SubmissionResult,
  type SubmissionTarget,
} from './submission/submission-provider.js';
import { toAttempt, toEvent, toSummary } from './smart-apply.mapper.js';

/** Settings from the environment (SMART_APPLY_*), injectable so tests can vary them. */
export interface SmartApplyOptions {
  autoSubmitEnabled: boolean;
  maxAttempts: number;
  retryBaseMs: number;
}
export const SMART_APPLY_OPTIONS = Symbol('SMART_APPLY_OPTIONS');

const DAY_MS = 24 * 60 * 60 * 1000;
const SUBMIT_TIMEOUT_MS = 30_000;
const MAX_RECONCILE_DELAY_MS = 6 * 60 * 60 * 1000;
/** Discovery sources whose posting URL is the employer's own posting. */
const EMPLOYER_SOURCES = new Set(['greenhouse', 'lever']);
/** States in which answers may still change. */
const ANSWERABLE: SmartApplyState[] = [
  'NEEDS_USER_INPUT',
  'READY_FOR_REVIEW',
  'AWAITING_USER_SUBMISSION',
];

const notFound = (what = 'Application') =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found.`);
const conflict = (code: ErrorCode, message: string, meta?: Record<string, string>) =>
  new AppException(HttpStatus.CONFLICT, code, message, undefined, meta);
const invalid = (field: string, message: string) =>
  AppException.validation([{ field, messages: [message] }]);

type SmartRow = Prisma.SmartApplicationGetPayload<object>;
type Db = Prisma.TransactionClient | PrismaService;

/**
 * Smart Apply (ADR-0020): prepare → ask for missing answers → review → submit through an
 * authorised integration or hand off to the official site. Every query is scoped by the
 * authenticated user; state changes are row-locked and recorded; nothing is reported as
 * submitted without a provider confirmation or the user's own (labelled) report.
 */
@Injectable()
export class SmartApplyService {
  private readonly logger = new Logger(SmartApplyService.name);
  private readonly autoSubmitEnabled: boolean;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly applications: ApplicationsService,
    private readonly preparation: ApplicationPreparationService,
    private readonly jobs: JobsService,
    private readonly jobAnalysis: JobAnalysisService,
    private readonly resumes: ResumesService,
    private readonly profile: ProfileService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly questionsReader: EmployerQuestionsReader,
    private readonly dispatcher: SmartApplyDispatcher,
    @Inject(SUBMISSION_PROVIDERS) private readonly providers: SubmissionProvider[],
    @Inject(SMART_APPLY_OPTIONS) options: SmartApplyOptions,
  ) {
    this.autoSubmitEnabled = options.autoSubmitEnabled;
    this.maxAttempts = options.maxAttempts;
    this.retryBaseMs = options.retryBaseMs;
  }

  // ── Settings ──

  async getSettings(userId: string): Promise<SmartApplySettingsItem> {
    const s = await this.settings(userId);
    const usage = await this.usage(userId);
    return {
      mode: s.mode,
      dailyApplicationLimit: s.dailyApplicationLimit,
      dailySubmissionLimit: s.dailySubmissionLimit,
      autoSubmitConsentAt: consentValid(s) ? s.autoSubmitConsentAt!.toISOString() : null,
      consentText: AUTO_SUBMIT_CONSENT_TEXT,
      consentVersion: AUTO_SUBMIT_CONSENT_VERSION,
      autoSubmitAvailable: this.autoSubmitEnabled && this.providers.length > 0,
      providers: this.providers.map((p) => ({ key: p.key, name: p.name })),
      usage,
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdateSmartApplySettingsRequest,
    ctx: RequestContext,
  ): Promise<SmartApplySettingsItem> {
    const data: Prisma.SmartApplySettingsUncheckedUpdateInput = {};
    if (dto.mode) data.mode = dto.mode;
    if (dto.dailyApplicationLimit !== undefined)
      data.dailyApplicationLimit = dto.dailyApplicationLimit;
    if (dto.dailySubmissionLimit !== undefined)
      data.dailySubmissionLimit = dto.dailySubmissionLimit;
    if (dto.autoSubmitConsent === true) {
      data.autoSubmitConsentAt = new Date();
      data.consentVersion = AUTO_SUBMIT_CONSENT_VERSION;
    } else if (dto.autoSubmitConsent === false) {
      data.autoSubmitConsentAt = null;
      data.consentVersion = null;
    }
    await this.prisma.smartApplySettings.upsert({
      where: { userId },
      create: { ...(data as Prisma.SmartApplySettingsUncheckedCreateInput), userId },
      update: data,
    });
    await this.audit.record({
      action: AuditAction.SMART_APPLY_SETTINGS_UPDATED,
      userId,
      requestId: ctx.requestId,
      metadata: {
        fields: Object.keys(dto),
        ...(dto.autoSubmitConsent !== undefined ? { consent: dto.autoSubmitConsent } : {}),
      },
    });
    return this.getSettings(userId);
  }

  // ── Prepare ──

  /** Starts (or restarts) Smart Apply for a job. Idempotent per user and job. */
  async prepare(
    userId: string,
    dto: PrepareSmartApplicationRequest,
    ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    const job = await this.prisma.job.findFirst({
      where: { id: dto.jobId, userId },
      select: {
        id: true,
        jobUrl: true,
        source: true,
        origin: true,
        selectedResumeVersionId: true,
        currentAnalysisId: true,
      },
    });
    if (!job) throw notFound('Job');

    const existing = await this.prisma.smartApplication.findUnique({
      where: { userId_jobId: { userId, jobId: job.id } },
    });
    if (existing) {
      if (
        existing.state === 'CANCELLED' ||
        existing.state === 'FAILED' ||
        existing.state === 'DISCOVERED'
      ) {
        await this.transition(
          existing.id,
          [existing.state],
          'PREPARING',
          'USER',
          'Preparation requested again.',
          {
            approvedAt: null,
            failureReason: null,
            cancelledAt: null,
            submissionMethod: null,
            providerKey: null,
          },
        );
        await this.syncTracker(userId, existing.applicationId, 'PREPARING', ctx);
        this.dispatcher.prepare(existing.id, userId);
      }
      return this.get(userId, existing.id);
    }

    const s = await this.settings(userId);
    const { applicationsToday } = await this.usage(userId);
    if (applicationsToday >= s.dailyApplicationLimit) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.DAILY_LIMIT_REACHED,
        `You have started ${applicationsToday} Smart Apply applications in the last 24 hours (your limit is ${s.dailyApplicationLimit}). Raise the limit in Smart Apply settings or try again later.`,
      );
    }

    // Provenance: the discovery that matches the job's current link (the employer's posting
    // when one was found), else the most recent one.
    const discoveries = await this.prisma.discoveredJob.findMany({
      where: { userId, jobId: job.id },
      select: { externalId: true, sourceUrl: true, source: { select: { key: true } } },
      orderBy: { lastSeenAt: 'desc' },
    });
    const matched = discoveries.find((d) => d.sourceUrl === job.jobUrl) ?? null;
    const discovery = matched ?? discoveries[0] ?? null;
    const sourceKey = discovery?.source.key ?? null;
    const url = safeUrl(job.jobUrl);
    // Provenance of the link only; the app never claims to have verified it further.
    const urlKind: ApplicationUrlKind | null = !url
      ? null
      : matched
        ? EMPLOYER_SOURCES.has(matched.source.key)
          ? 'EMPLOYER_POSTING'
          : 'LISTING_PAGE'
        : job.origin === 'MANUAL'
          ? 'USER_PROVIDED'
          : 'LISTING_PAGE';

    // The application: the user's existing one for this job, or a new one.
    let application = await this.prisma.application.findFirst({
      where: { userId, jobId: job.id, archivedAt: null },
      select: { id: true, status: true },
    });
    if (application && application.status !== 'SAVED' && application.status !== 'PREPARING') {
      throw conflict(
        ErrorCode.ALREADY_SUBMITTED,
        'You are already tracking an application for this job that was sent.',
        { applicationId: application.id },
      );
    }
    if (!application) {
      const resumeVersionId = dto.resumeVersionId ?? (await this.recommendedVersion(userId, job));
      if (!resumeVersionId) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          ErrorCode.RESUME_REQUIRED,
          'Choose the resume version to apply with (no recommendation is available for this job yet).',
        );
      }
      const created = await this.applications.create(
        userId,
        {
          jobId: job.id,
          resumeVersionId,
          status: 'PREPARING',
          source: job.source?.slice(0, 100) ?? null,
          applicationUrl: url,
        },
        ctx,
      );
      application = { id: created.id, status: 'PREPARING' };
    }
    await this.jobs.addToLibrary(userId, job.id);

    let smart: SmartRow;
    try {
      smart = await this.prisma.smartApplication.create({
        data: {
          userId,
          applicationId: application.id,
          jobId: job.id,
          state: 'DISCOVERED',
          sourceKey,
          sourceJobId: discovery?.externalId ?? null,
          officialApplicationUrl: url,
          applicationUrlKind: urlKind,
          events: {
            create: {
              fromState: null,
              toState: 'DISCOVERED',
              actor: 'SYSTEM',
              reason: sourceKey ? `Job found through ${sourceKey}.` : 'Job added by you.',
            },
          },
        },
      });
    } catch (error) {
      // A concurrent request created it first: return that one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.smartApplication.findFirst({
          where: { userId, jobId: job.id },
        });
        if (raced) return this.get(userId, raced.id);
      }
      throw error;
    }
    await this.transition(smart.id, ['DISCOVERED'], 'PREPARING', 'USER', 'Preparation requested.');
    if (application.status === 'SAVED') {
      await this.syncTracker(userId, application.id, 'PREPARING', ctx);
    }
    this.dispatcher.prepare(smart.id, userId);
    return this.get(userId, smart.id);
  }

  /**
   * Background preparation: materials, the employer's questions, answer resolution. Never
   * throws; a failure is stored on the application (FAILED, with a safe reason).
   */
  async runPreparation(smartApplicationId: string): Promise<void> {
    const smart = await this.prisma.smartApplication.findUnique({
      where: { id: smartApplicationId },
    });
    if (!smart || smart.state !== 'PREPARING') return;
    const { userId, applicationId } = smart;
    const ctx: RequestContext = {};
    const notes: string[] = [];
    try {
      await this.preparation.start(userId, applicationId, ctx);
      // Materials are built from the job's analysis: run it now if the job has none yet.
      const job = await this.prisma.job.findUniqueOrThrow({
        where: { id: smart.jobId },
        select: { currentAnalysisId: true },
      });
      if (!job.currentAnalysisId) {
        await this.jobAnalysis.analyzeNow(userId, smart.jobId).catch((error: unknown) => {
          this.logger.warn({ err: error, smartApplicationId }, 'Job analysis failed');
        });
      }
      const prep = await this.prisma.applicationPreparation.findUniqueOrThrow({
        where: { applicationId },
        select: { _count: { select: { coverLetters: true } } },
      });
      if (prep._count.coverLetters === 0) {
        try {
          await this.preparation.generateCoverLetter(userId, applicationId, 'GENERATE', ctx);
        } catch (error) {
          this.logger.warn({ err: error, smartApplicationId }, 'Cover letter not generated');
          notes.push('A cover letter could not be prepared automatically; you can write one.');
        }
      }
      try {
        const questions = await this.questionsReader.read(smart.sourceKey, smart.sourceJobId);
        if (questions && questions.length > 0) {
          await this.prisma.applicationQuestion.createMany({
            data: questions.map((q) => ({
              applicationId,
              question: q.question,
              questionType: q.questionType,
              isRequired: q.required,
              options: q.options,
              origin: q.origin,
              externalKey: q.externalKey,
              sensitivity: sensitivityOf(q.question, q.questionType),
            })),
            skipDuplicates: true,
          });
        }
      } catch {
        notes.push(
          'The employer’s application questions could not be loaded; check the official form for any further questions.',
        );
      }
      await this.resolveAnswers(userId, applicationId);
      const outstanding = await this.outstanding(applicationId);
      const next: SmartApplyState = outstanding > 0 ? 'NEEDS_USER_INPUT' : 'READY_FOR_REVIEW';
      const moved = await this.transition(
        smartApplicationId,
        ['PREPARING'],
        next,
        'SYSTEM',
        [
          outstanding > 0
            ? `${outstanding} required question${outstanding === 1 ? '' : 's'} need${outstanding === 1 ? 's' : ''} your answer.`
            : 'Prepared: ready for your review.',
          ...notes,
        ].join(' '),
        { preparedAt: new Date() },
        { tolerateConflict: true },
      );
      if (moved) await this.notifyState(userId, smartApplicationId, next, outstanding);
    } catch (error) {
      this.logger.error({ err: error, smartApplicationId }, 'Smart Apply preparation failed');
      await this.transition(
        smartApplicationId,
        ['PREPARING'],
        'FAILED',
        'SYSTEM',
        'Preparation could not be completed.',
        { failureReason: 'Preparation could not be completed. Try preparing it again.' },
        { tolerateConflict: true },
      ).catch(() => undefined);
    }
  }

  /** Re-run preparation (e.g. after answering, or after a failure). */
  async resume(userId: string, id: string, ctx: RequestContext): Promise<SmartApplicationDetail> {
    const smart = await this.owned(userId, id);
    const from: SmartApplyState[] = [
      'NEEDS_USER_INPUT',
      'READY_FOR_REVIEW',
      'AWAITING_USER_SUBMISSION',
      'FAILED',
      'CANCELLED',
    ];
    if (!from.includes(smart.state)) throw this.stateError(smart.state, 'PREPARING');
    await this.transition(id, from, 'PREPARING', 'USER', 'Preparation resumed.', {
      approvedAt: null,
      failureReason: null,
      cancelledAt: null,
    });
    await this.syncTracker(userId, smart.applicationId, 'PREPARING', ctx);
    this.dispatcher.prepare(id, userId);
    return this.get(userId, id);
  }

  // ── Read ──

  async list(
    userId: string,
    query: ListSmartApplicationsQueryDto,
  ): Promise<SmartApplicationListResponse> {
    const where: Prisma.SmartApplicationWhereInput = {
      userId,
      ...(query.state ? { state: { in: query.state } } : {}),
    };
    const order = query.order ?? 'desc';
    const orderBy: Prisma.SmartApplicationOrderByWithRelationInput[] =
      query.sort === 'matchScore'
        ? [{ application: { matchScore: { sort: order, nulls: 'last' } } }, { id: 'asc' }]
        : [{ [query.sort ?? 'updatedAt']: order }, { id: 'asc' }];
    const [total, rows] = await Promise.all([
      this.prisma.smartApplication.count({ where }),
      this.prisma.smartApplication.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: SUMMARY_INCLUDE,
      }),
    ]);
    const outstanding = await this.outstandingByApplication(rows.map((r) => r.applicationId));
    return {
      items: rows.map((r) => toSummary(r, outstanding.get(r.applicationId) ?? 0)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(userId: string, id: string): Promise<SmartApplicationDetail> {
    const row = await this.prisma.smartApplication.findFirst({
      where: { id, userId },
      include: {
        ...SUMMARY_INCLUDE,
        events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        attempts: { orderBy: { attemptNumber: 'asc' } },
      },
    });
    if (!row) throw notFound();
    const [questions, version, cover, recommendation, eligibility] = await Promise.all([
      this.questionsFor(row.id, row.applicationId, row.application.job),
      this.resumes.getVersionContent(userId, row.application.resumeVersionId),
      this.latestCoverLetter(row.applicationId),
      this.prisma.jobRecommendation.findFirst({
        where: { userId, jobId: row.jobId },
        select: { reason: true },
      }),
      this.eligibilityFor(row),
    ]);
    const outstanding = questions.filter((q) => q.required && !q.confirmed).length;
    return {
      ...toSummary(row, outstanding),
      officialApplicationUrl: row.officialApplicationUrl,
      applicationUrlKind: row.applicationUrlKind as ApplicationUrlKind | null,
      matchExplanation: recommendation?.reason ?? null,
      resume: {
        resumeId: version?.resumeId ?? '',
        resumeName: version?.resumeName ?? '',
        resumeVersionId: row.application.resumeVersionId,
        versionNumber: version?.versionNumber ?? 0,
      },
      coverLetter: cover,
      questions,
      eligibility,
      confirmationReference: row.confirmationReference,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      preparedAt: row.preparedAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      history: row.events.map(toEvent),
      attempts: row.attempts.map(toAttempt),
    };
  }

  async materials(userId: string, id: string): Promise<SmartApplicationMaterials> {
    const smart = await this.owned(userId, id);
    const app = await this.prisma.application.findUniqueOrThrow({
      where: { id: smart.applicationId },
      select: { resumeVersionId: true, job: { select: { title: true, companyName: true } } },
    });
    const [version, cover, questions] = await Promise.all([
      this.resumes.getVersionContent(userId, app.resumeVersionId),
      this.latestCoverLetter(smart.applicationId),
      this.questionsFor(smart.id, smart.applicationId, app.job),
    ]);
    return {
      smartApplicationId: smart.id,
      resume: {
        resumeId: version?.resumeId ?? '',
        resumeName: version?.resumeName ?? '',
        resumeVersionId: app.resumeVersionId,
        versionNumber: version?.versionNumber ?? 0,
        content: version?.content ?? null,
      },
      coverLetter: cover,
      answers: questions.map((q) => ({
        question: q.question,
        answer: q.answer,
        confirmed: q.confirmed,
        required: q.required,
      })),
      officialApplicationUrl: smart.officialApplicationUrl,
    };
  }

  /** Required questions waiting for the user, across all their active applications. */
  async inbox(userId: string): Promise<SmartApplyQuestion[]> {
    const rows = await this.prisma.applicationQuestion.findMany({
      where: {
        isRequired: true,
        status: { not: 'APPROVED' },
        application: {
          userId,
          smartApplication: { is: { state: { in: ANSWERABLE } } },
        },
      },
      include: {
        application: {
          select: {
            smartApplication: { select: { id: true } },
            job: { select: { title: true, companyName: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map((q) => toQuestion(q, q.application.smartApplication!.id, q.application.job));
  }

  async eligibility(userId: string, id: string): Promise<SubmissionEligibility> {
    return this.eligibilityFor(await this.owned(userId, id));
  }

  async submission(userId: string, id: string) {
    const detail = await this.get(userId, id);
    return {
      state: detail.state,
      submissionMethod: detail.submissionMethod,
      confirmation: detail.confirmation,
      confirmationReference: detail.confirmationReference,
      uncertain: detail.uncertain,
      submittedAt: detail.submittedAt,
      failureReason: detail.failureReason,
      attempts: detail.attempts,
    };
  }

  // ── Answers ──

  async answer(
    userId: string,
    id: string,
    questionId: string,
    dto: AnswerQuestionRequest,
    ctx: RequestContext,
  ): Promise<SmartApplyQuestion> {
    const smart = await this.owned(userId, id);
    if (!ANSWERABLE.includes(smart.state)) {
      throw conflict(
        ErrorCode.INVALID_STATE_TRANSITION,
        `Answers can’t be changed while the application is “${SMART_APPLY_STATE_LABELS[smart.state]}”.`,
      );
    }
    const q = await this.prisma.applicationQuestion.findFirst({
      where: { id: questionId, applicationId: smart.applicationId },
    });
    if (!q) throw notFound('Question');
    const answer = dto.answer.trim();
    if (!answer) throw invalid('answer', 'Write an answer.');
    if (answer.length > SMART_ANSWER_MAX_LENGTH)
      throw invalid('answer', `Keep the answer under ${SMART_ANSWER_MAX_LENGTH} characters.`);
    if (q.options.length > 0 && !q.options.includes(answer))
      throw invalid('answer', 'Choose one of the options the employer offers.');
    const limits = checkLimits(answer, { maxWords: q.maxWords, maxCharacters: q.maxCharacters });
    if (!limits.withinLimits)
      throw invalid(
        'answer',
        `The answer is over the limit (${limits.words} words, ${limits.characters} characters).`,
      );
    const sensitivity = sensitivityOf(q.question, q.questionType);
    const key = answerKeyOf(q.question, q.questionType, sensitivity);
    if (dto.saveForReuse) {
      if (!dto.confirm)
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.CONFIRMATION_REQUIRED,
          'Confirm the answer before saving it for reuse.',
        );
      if (sensitivity === 'DEMOGRAPHIC')
        throw invalid('saveForReuse', 'Demographic answers are never saved for reuse.');
      if (!key)
        throw invalid(
          'saveForReuse',
          'This answer is specific to this application and can’t be reused.',
        );
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      let profileAnswerId: string | null = null;
      if (dto.saveForReuse && key) {
        const saved = await tx.profileAnswer.upsert({
          where: { userId_answerKey: { userId, answerKey: key } },
          create: {
            userId,
            answerKey: key,
            questionType: q.questionType,
            label: q.question.slice(0, 500),
            answer,
            sensitivity,
            confirmedAt: now,
            validUntil: validUntil(q.questionType, now),
          },
          update: {
            answer,
            label: q.question.slice(0, 500),
            sensitivity,
            confirmedAt: now,
            validUntil: validUntil(q.questionType, now),
          },
          select: { id: true },
        });
        profileAnswerId = saved.id;
      }
      await tx.applicationQuestion.update({
        where: { id: q.id },
        data: {
          userAnswer: answer,
          status: dto.confirm ? 'APPROVED' : 'EDITED',
          approvedAt: dto.confirm ? now : null,
          prefilledFrom: null,
          sensitivity,
          profileAnswerId,
        },
      });
    });
    await this.audit.record({
      action: AuditAction.SMART_APPLY_ANSWER_CONFIRMED,
      userId,
      requestId: ctx.requestId,
      // Never the answer itself.
      metadata: {
        smartApplicationId: id,
        questionId,
        sensitivity,
        confirmed: dto.confirm,
        saved: Boolean(dto.saveForReuse),
      },
    });
    await this.afterAnswersChanged(smart);
    const updated = await this.prisma.applicationQuestion.findUniqueOrThrow({
      where: { id: q.id },
      include: { application: { select: { job: { select: { title: true, companyName: true } } } } },
    });
    return toQuestion(updated, id, updated.application.job);
  }

  async savedAnswers(userId: string): Promise<ProfileAnswerItem[]> {
    const rows = await this.prisma.profileAnswer.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      answerKey: r.answerKey,
      questionType: r.questionType,
      label: r.label,
      answer: r.answer,
      sensitivity: r.sensitivity as ProfileAnswerItem['sensitivity'],
      confirmedAt: r.confirmedAt.toISOString(),
      validUntil: r.validUntil?.toISOString() ?? null,
    }));
  }

  async deleteSavedAnswer(userId: string, id: string, ctx: RequestContext): Promise<void> {
    const { count } = await this.prisma.profileAnswer.deleteMany({ where: { id, userId } });
    if (count === 0) throw notFound('Saved answer');
    await this.audit.record({
      action: AuditAction.SMART_APPLY_SAVED_ANSWER_DELETED,
      userId,
      requestId: ctx.requestId,
      metadata: { profileAnswerId: id },
    });
  }

  // ── Review, approval, handoff ──

  async approve(userId: string, id: string, ctx: RequestContext): Promise<SmartApplicationDetail> {
    const smart = await this.owned(userId, id);
    if (smart.state !== 'READY_FOR_REVIEW')
      throw this.stateError(smart.state, 'AWAITING_USER_SUBMISSION');
    const outstanding = await this.outstanding(smart.applicationId);
    if (outstanding > 0) {
      throw conflict(
        ErrorCode.ANSWERS_REQUIRED,
        `Answer the ${outstanding} remaining required question${outstanding === 1 ? '' : 's'} first.`,
        { outstanding: String(outstanding) },
      );
    }
    const eligibility = await this.eligibilityFor({ ...smart, approvedAt: new Date() });
    if (eligibility.autoSubmitEligible) {
      await this.prisma.smartApplication.update({
        where: { id },
        data: {
          approvedAt: new Date(),
          providerKey: eligibility.providerKey,
          submissionMethod: 'PROVIDER_INTEGRATION',
        },
      });
    } else {
      await this.transition(
        id,
        ['READY_FOR_REVIEW'],
        'AWAITING_USER_SUBMISSION',
        'USER',
        eligibility.summary,
        {
          approvedAt: new Date(),
          submissionMethod: 'USER_HANDOFF',
          providerKey: null,
        },
      );
    }
    await this.audit.record({
      action: AuditAction.SMART_APPLY_APPROVED,
      userId,
      requestId: ctx.requestId,
      metadata: { smartApplicationId: id, method: eligibility.method },
    });
    return this.get(userId, id);
  }

  /** Submit on the official site instead (after approval, or after a failed submission). */
  async handoff(userId: string, id: string): Promise<SmartApplicationDetail> {
    const smart = await this.owned(userId, id);
    if (smart.state === 'READY_FOR_REVIEW' && !smart.approvedAt)
      throw conflict(ErrorCode.INVALID_STATE_TRANSITION, 'Approve the application first.');
    if (smart.state !== 'READY_FOR_REVIEW' && smart.state !== 'FAILED')
      throw this.stateError(smart.state, 'AWAITING_USER_SUBMISSION');
    await this.transition(
      id,
      ['READY_FOR_REVIEW', 'FAILED'],
      'AWAITING_USER_SUBMISSION',
      'USER',
      'You chose to submit on the official site.',
      { submissionMethod: 'USER_HANDOFF', approvedAt: smart.approvedAt ?? new Date() },
    );
    return this.get(userId, id);
  }

  // ── Submission ──

  /** Requests submission through an authorised integration. Safe to repeat with the same key. */
  async requestSubmission(
    userId: string,
    id: string,
    clientKey: string | undefined,
    ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    const key = clientKey ? `${userId}:${clientKey}` : `smart-apply:${id}`;
    const smart = await this.owned(userId, id);
    if (smart.idempotencyKey === key) return this.get(userId, id); // replay
    if (smart.state === 'SUBMITTED')
      throw conflict(ErrorCode.ALREADY_SUBMITTED, 'This application was already submitted.');
    if (smart.state === 'SUBMITTING')
      throw conflict(
        ErrorCode.SUBMISSION_IN_PROGRESS,
        'This application is already being submitted.',
      );
    if (smart.state !== 'READY_FOR_REVIEW' || !smart.approvedAt)
      throw conflict(
        ErrorCode.INVALID_STATE_TRANSITION,
        'Review and approve the application before submitting it.',
      );
    const eligibility = await this.eligibilityFor(smart);
    if (!eligibility.autoSubmitEligible) {
      throw conflict(ErrorCode.AUTO_SUBMIT_NOT_ALLOWED, eligibility.summary, {
        checks: eligibility.checks
          .filter((c) => !c.satisfied)
          .map((c) => c.code)
          .join(','),
      });
    }
    const provider = this.providers.find((p) => p.key === eligibility.providerKey)!;

    let attemptId: string;
    try {
      attemptId = await this.prisma.$transaction(async (tx) => {
        // One submission request per user at a time (the daily limit can't be raced past),
        // and the application row locked so concurrent requests see each other.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`smart-apply:${userId}`}))`;
        const [row] = await tx.$queryRaw<
          { state: SmartApplyState; idempotency_key: string | null }[]
        >`
          SELECT state::text AS state, idempotency_key FROM smart_applications
          WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
        if (!row) throw notFound();
        if (row.idempotency_key === key) return '';
        if (row.state === 'SUBMITTING')
          throw conflict(
            ErrorCode.SUBMISSION_IN_PROGRESS,
            'This application is already being submitted.',
          );
        if (row.state !== 'READY_FOR_REVIEW')
          throw conflict(
            ErrorCode.INVALID_STATE_TRANSITION,
            'This application can no longer be submitted.',
          );
        const s = await this.settings(userId, tx);
        const used = await this.submissionsToday(userId, tx);
        if (used >= s.dailySubmissionLimit) {
          throw new AppException(
            HttpStatus.TOO_MANY_REQUESTS,
            ErrorCode.DAILY_LIMIT_REACHED,
            `Your limit of ${s.dailySubmissionLimit} automatic submissions in 24 hours is reached.`,
          );
        }
        await tx.smartApplication.update({
          where: { id },
          data: {
            state: 'SUBMITTING',
            idempotencyKey: key,
            providerKey: provider.key,
            submissionMethod: 'PROVIDER_INTEGRATION',
            needsReconciliation: false,
            failureReason: null,
          },
        });
        await tx.smartApplyEvent.create({
          data: {
            smartApplicationId: id,
            fromState: 'READY_FOR_REVIEW',
            toState: 'SUBMITTING',
            actor: 'USER',
            reason: `Submission through ${provider.name} requested.`,
          },
        });
        const attempt = await tx.submissionAttempt.create({
          data: {
            smartApplicationId: id,
            userId,
            attemptNumber: 1,
            idempotencyKey: key,
            providerKey: provider.key,
          },
          select: { id: true },
        });
        return attempt.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw conflict(
          ErrorCode.CONFLICT,
          'This Idempotency-Key was already used for another request.',
        );
      }
      throw error;
    }
    if (attemptId) {
      await this.audit.record({
        action: AuditAction.SMART_APPLY_SUBMISSION_REQUESTED,
        userId,
        requestId: ctx.requestId,
        metadata: { smartApplicationId: id, providerKey: provider.key },
      });
      this.dispatcher.submit(attemptId, userId);
    }
    return this.get(userId, id);
  }

  /** Runs one submission attempt. Never throws; the outcome is stored. */
  async runAttempt(attemptId: string): Promise<void> {
    const attempt = await this.prisma.submissionAttempt.findUnique({
      where: { id: attemptId },
      include: { smartApplication: true },
    });
    if (!attempt || attempt.outcome !== 'PENDING') return;
    const smart = attempt.smartApplication;
    if (smart.state !== 'SUBMITTING') {
      await this.finishAttempt(
        attempt.id,
        'PERMANENT_FAILURE',
        'Not sent: the application is no longer waiting to be submitted.',
      );
      return;
    }
    const provider = this.providers.find((p) => p.key === attempt.providerKey);
    const target = targetOf(smart);
    if (!provider) {
      await this.finishAttempt(
        attempt.id,
        'PERMANENT_FAILURE',
        'Not sent: the submission integration is no longer available.',
      );
      await this.toFailed(
        smart,
        'The submission integration is no longer available on this server.',
      );
      return;
    }
    // Re-check consent and settings right before sending: they may have changed.
    const s = await this.settings(smart.userId);
    if (
      !this.autoSubmitEnabled ||
      s.mode !== 'HYBRID' ||
      !consentValid(s) ||
      !provider.supports(target)
    ) {
      await this.finishAttempt(
        attempt.id,
        'PERMANENT_FAILURE',
        'Not sent: automatic submission is no longer allowed (your consent, mode or the server setting changed).',
      );
      await this.transition(
        smart.id,
        ['SUBMITTING'],
        'AWAITING_USER_SUBMISSION',
        'SYSTEM',
        'Automatic submission is no longer allowed; submit on the official site.',
        { submissionMethod: 'USER_HANDOFF' },
        { tolerateConflict: true },
      );
      return;
    }

    let result: SubmissionResult;
    try {
      const request = await this.buildRequest(smart, attempt.idempotencyKey);
      result = await withTimeout((signal) => provider.submit(request, signal), SUBMIT_TIMEOUT_MS);
    } catch {
      // No reliable answer: it may have been received. Never resend blindly.
      result = {
        kind: 'AMBIGUOUS',
        message: 'No reliable response was received from the provider.',
      };
    }
    await this.applyResult(smart, attempt, result);
  }

  /** Due retries and reconciliations (called by the worker's timer). */
  async processDue(now = new Date()): Promise<{ retried: number; reconciled: number }> {
    let retried = 0;
    let reconciled = 0;
    const retries = await this.prisma.submissionAttempt.findMany({
      where: {
        outcome: 'RETRYABLE_FAILURE',
        nextAttemptAt: { lte: now },
        smartApplication: { state: 'SUBMITTING', needsReconciliation: false },
      },
      take: 20,
    });
    for (const a of retries) {
      const cleared = await this.prisma.submissionAttempt.updateMany({
        where: { id: a.id, nextAttemptAt: a.nextAttemptAt },
        data: { nextAttemptAt: null },
      });
      if (cleared.count === 0) continue; // another worker took it
      try {
        const next = await this.prisma.submissionAttempt.create({
          data: {
            smartApplicationId: a.smartApplicationId,
            userId: a.userId,
            attemptNumber: a.attemptNumber + 1,
            idempotencyKey: a.idempotencyKey,
            providerKey: a.providerKey,
          },
          select: { id: true },
        });
        this.dispatcher.submit(next.id, a.userId);
        retried++;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
          throw error;
      }
    }

    const ambiguous = await this.prisma.submissionAttempt.findMany({
      where: {
        outcome: 'AMBIGUOUS',
        nextAttemptAt: { lte: now },
        smartApplication: { state: 'SUBMITTING', needsReconciliation: true },
      },
      include: { smartApplication: true },
      take: 20,
    });
    for (const a of ambiguous) {
      const waited = now.getTime() - (a.finishedAt ?? a.startedAt).getTime();
      const delay = Math.min(MAX_RECONCILE_DELAY_MS, Math.max(this.retryBaseMs, waited));
      const claimed = await this.prisma.submissionAttempt.updateMany({
        where: { id: a.id, nextAttemptAt: a.nextAttemptAt },
        data: { nextAttemptAt: new Date(now.getTime() + delay) },
      });
      if (claimed.count === 0) continue;
      await this.reconcile(a.smartApplication, a);
      reconciled++;
    }
    return { retried, reconciled };
  }

  /** After a restart: resume preparations; in-flight attempts become ambiguous (never resent). */
  async recoverAfterRestart(): Promise<void> {
    const preparing = await this.prisma.smartApplication.findMany({
      where: { state: 'PREPARING' },
      select: { id: true, userId: true },
    });
    for (const p of preparing) this.dispatcher.prepare(p.id, p.userId);
    const inFlight = await this.prisma.submissionAttempt.findMany({
      where: { outcome: 'PENDING' },
      select: { id: true, smartApplicationId: true },
    });
    for (const a of inFlight) {
      await this.prisma.$transaction([
        this.prisma.submissionAttempt.update({
          where: { id: a.id },
          data: {
            outcome: 'AMBIGUOUS',
            message:
              'The server restarted during this submission; checking with the provider before doing anything else.',
            finishedAt: new Date(),
            nextAttemptAt: new Date(),
          },
        }),
        this.prisma.smartApplication.updateMany({
          where: { id: a.smartApplicationId, state: 'SUBMITTING' },
          data: { needsReconciliation: true },
        }),
      ]);
    }
    if (preparing.length + inFlight.length > 0) {
      this.logger.log(
        { preparing: preparing.length, inFlight: inFlight.length },
        'Smart Apply work recovered after restart',
      );
    }
  }

  /** The user reports that they submitted it themselves. Recorded as USER_REPORTED. */
  async reportManualSubmission(
    userId: string,
    id: string,
    dto: ManualSubmissionRequest,
    ctx: RequestContext,
  ): Promise<SmartApplicationDetail> {
    const smart = await this.owned(userId, id);
    if (smart.state === 'SUBMITTED')
      throw conflict(
        ErrorCode.ALREADY_SUBMITTED,
        'This application is already marked as submitted.',
      );
    const uncertain = smart.state === 'SUBMITTING' && smart.needsReconciliation;
    if (smart.state !== 'AWAITING_USER_SUBMISSION' && !uncertain) {
      throw conflict(
        ErrorCode.INVALID_STATE_TRANSITION,
        smart.state === 'SUBMITTING'
          ? 'The submission is still in progress; wait for its result.'
          : 'Review and approve the application, then submit it on the official site first.',
      );
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dto.submittedOn && dto.submittedOn > today)
      throw invalid('submittedOn', 'The date can’t be in the future.');
    await this.transition(
      id,
      ['AWAITING_USER_SUBMISSION', 'SUBMITTING'],
      'SUBMITTED',
      'USER',
      'You reported submitting this application on the official site (not verified by the app).',
      {
        confirmation: 'USER_REPORTED',
        submissionMethod: 'USER_HANDOFF',
        submittedAt: new Date(),
        needsReconciliation: false,
      },
    );
    await this.syncTracker(userId, smart.applicationId, 'APPLIED', ctx, dto.submittedOn, dto.note);
    await this.audit.record({
      action: AuditAction.SMART_APPLY_MANUAL_SUBMISSION,
      userId,
      requestId: ctx.requestId,
      metadata: { smartApplicationId: id },
    });
    return this.get(userId, id);
  }

  async cancel(userId: string, id: string, ctx: RequestContext): Promise<SmartApplicationDetail> {
    const smart = await this.owned(userId, id);
    if (!CANCELLABLE_STATES.includes(smart.state)) throw this.stateError(smart.state, 'CANCELLED');
    await this.transition(
      id,
      [...CANCELLABLE_STATES],
      'CANCELLED',
      'USER',
      'Cancelled by you before submission.',
      {
        cancelledAt: new Date(),
        approvedAt: null,
      },
    );
    await this.syncTracker(userId, smart.applicationId, 'SAVED', ctx);
    return this.get(userId, id);
  }

  // ── Internals ──

  private async applyResult(
    smart: SmartRow,
    attempt: { id: string; attemptNumber: number; providerKey: string },
    result: SubmissionResult,
  ): Promise<void> {
    const message = 'message' in result ? result.message.slice(0, 300) : null;
    const httpStatus = result.httpStatus ?? null;
    if (result.kind === 'CONFIRMED') {
      await this.finishAttempt(attempt.id, 'CONFIRMED', null, {
        providerReference: result.reference,
        httpStatus,
      });
      await this.toSubmitted(smart, result.reference);
    } else if (
      result.kind === 'REJECTED' &&
      result.retryable &&
      attempt.attemptNumber < this.maxAttempts
    ) {
      const delay = this.retryBaseMs * 2 ** (attempt.attemptNumber - 1);
      await this.finishAttempt(attempt.id, 'RETRYABLE_FAILURE', message, {
        httpStatus,
        nextAttemptAt: new Date(Date.now() + delay),
      });
    } else if (result.kind === 'REJECTED') {
      await this.finishAttempt(attempt.id, 'PERMANENT_FAILURE', message, { httpStatus });
      await this.toFailed(smart, message ?? 'The provider did not accept the application.');
    } else {
      await this.finishAttempt(attempt.id, 'AMBIGUOUS', message, {
        httpStatus,
        nextAttemptAt: new Date(Date.now() + this.retryBaseMs),
      });
      await this.prisma.smartApplication.update({
        where: { id: smart.id },
        data: { needsReconciliation: true },
      });
      await this.notifySubmission(smart.userId, smart.id, 'uncertain');
    }
    await this.audit.record({
      action: AuditAction.SMART_APPLY_SUBMISSION_ATTEMPTED,
      userId: smart.userId,
      metadata: {
        smartApplicationId: smart.id,
        attemptNumber: attempt.attemptNumber,
        providerKey: attempt.providerKey,
        outcome: result.kind,
      },
    });
  }

  private async reconcile(
    smart: SmartRow,
    attempt: { id: string; attemptNumber: number; idempotencyKey: string; providerKey: string },
  ): Promise<void> {
    const provider = this.providers.find((p) => p.key === attempt.providerKey);
    if (!provider) return; // stays uncertain; the user can report it themselves
    let outcome;
    try {
      outcome = await withTimeout(
        (signal) => provider.reconcile(attempt.idempotencyKey, targetOf(smart), signal),
        SUBMIT_TIMEOUT_MS,
      );
    } catch {
      return; // still unknown: try again later
    }
    if (outcome.kind === 'CONFIRMED') {
      await this.finishAttempt(
        attempt.id,
        'CONFIRMED',
        'Confirmed by the provider after checking.',
        {
          providerReference: outcome.reference,
          nextAttemptAt: null,
        },
      );
      await this.toSubmitted(smart, outcome.reference);
    } else if (outcome.kind === 'NOT_SUBMITTED') {
      await this.prisma.smartApplication.update({
        where: { id: smart.id },
        data: { needsReconciliation: false },
      });
      if (attempt.attemptNumber < this.maxAttempts) {
        await this.finishAttempt(
          attempt.id,
          'RETRYABLE_FAILURE',
          'The provider confirmed it did not receive this attempt.',
          {
            nextAttemptAt: new Date(),
          },
        );
      } else {
        await this.finishAttempt(
          attempt.id,
          'PERMANENT_FAILURE',
          'The provider confirmed it did not receive the application.',
          {
            nextAttemptAt: null,
          },
        );
        await this.toFailed(
          smart,
          'The application could not be submitted. You can submit it on the official site.',
        );
      }
    }
  }

  private async toSubmitted(smart: SmartRow, reference: string | null): Promise<void> {
    const moved = await this.transition(
      smart.id,
      ['SUBMITTING'],
      'SUBMITTED',
      'SYSTEM',
      reference
        ? `Confirmed by the provider (reference ${reference}).`
        : 'Confirmed by the provider.',
      {
        confirmation: 'PROVIDER_CONFIRMED',
        confirmationReference: reference,
        submissionMethod: 'PROVIDER_INTEGRATION',
        submittedAt: new Date(),
        needsReconciliation: false,
      },
      { tolerateConflict: true },
    );
    if (!moved) return;
    await this.syncTracker(smart.userId, smart.applicationId, 'APPLIED', {});
    await this.notifySubmission(smart.userId, smart.id, 'confirmed');
  }

  private async toFailed(smart: SmartRow, reason: string): Promise<void> {
    const moved = await this.transition(
      smart.id,
      ['SUBMITTING'],
      'FAILED',
      'SYSTEM',
      reason,
      { failureReason: reason, needsReconciliation: false },
      { tolerateConflict: true },
    );
    if (moved) await this.notifySubmission(smart.userId, smart.id, 'failed');
  }

  private finishAttempt(
    id: string,
    outcome: 'CONFIRMED' | 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE' | 'AMBIGUOUS',
    message: string | null,
    extra: {
      providerReference?: string | null;
      httpStatus?: number | null;
      nextAttemptAt?: Date | null;
    } = {},
  ) {
    return this.prisma.submissionAttempt.update({
      where: { id },
      data: { outcome, message, finishedAt: new Date(), ...extra },
    });
  }

  /**
   * Moves the application to `to` if its current state is in `from` and the move is legal.
   * Row-locked; records the history entry and an audit event. Returns false (or throws 409)
   * when the state had already changed.
   */
  private async transition(
    id: string,
    from: SmartApplyState[],
    to: SmartApplyState,
    actor: 'USER' | 'SYSTEM',
    reason: string,
    data: Prisma.SmartApplicationUpdateInput = {},
    opts: { tolerateConflict?: boolean } = {},
  ): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ state: SmartApplyState; user_id: string }[]>`
        SELECT state::text AS state, user_id FROM smart_applications WHERE id = ${id}::uuid FOR UPDATE`;
      if (!row) throw notFound();
      if (!from.includes(row.state) || !canTransition(row.state, to)) return { moved: false, row };
      await tx.smartApplication.update({ where: { id }, data: { ...data, state: to } });
      await tx.smartApplyEvent.create({
        data: {
          smartApplicationId: id,
          fromState: row.state,
          toState: to,
          actor,
          reason: reason.slice(0, 1000),
        },
      });
      return { moved: true, row };
    });
    if (!result.moved) {
      if (opts.tolerateConflict) return false;
      throw this.stateError(result.row.state, to);
    }
    await this.audit.record({
      action: AuditAction.SMART_APPLY_STATE_CHANGED,
      userId: result.row.user_id,
      metadata: { smartApplicationId: id, from: result.row.state, to, actor },
    });
    return true;
  }

  private stateError(state: SmartApplyState, to: SmartApplyState) {
    return conflict(
      ErrorCode.INVALID_STATE_TRANSITION,
      `An application that is “${SMART_APPLY_STATE_LABELS[state]}” can’t move to “${SMART_APPLY_STATE_LABELS[to]}”.`,
      { state },
    );
  }

  /** Keeps the application tracker in step; a status the user set themselves is respected. */
  private async syncTracker(
    userId: string,
    applicationId: string,
    status: 'SAVED' | 'PREPARING' | 'APPLIED',
    ctx: RequestContext,
    occurredOn?: string,
    note?: string,
  ): Promise<void> {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, userId },
      select: { status: true, archivedAt: true },
    });
    if (!app || app.archivedAt || app.status === status) return;
    // Only move between the pre-submission statuses, or from them to APPLIED.
    if (app.status !== 'SAVED' && app.status !== 'PREPARING') return;
    try {
      await this.applications.changeStatus(
        userId,
        applicationId,
        {
          status,
          ...(occurredOn ? { occurredOn } : {}),
          note: note ?? (status === 'APPLIED' ? 'Smart Apply' : undefined),
        },
        ctx,
      );
    } catch (error) {
      this.logger.warn({ err: error, applicationId, status }, 'Application tracker not updated');
    }
  }

  private async afterAnswersChanged(smart: SmartRow): Promise<void> {
    const outstanding = await this.outstanding(smart.applicationId);
    const current = await this.prisma.smartApplication.findUniqueOrThrow({
      where: { id: smart.id },
    });
    if (current.approvedAt) {
      // Answers changed after approval: approval no longer covers them.
      await this.prisma.smartApplication.update({
        where: { id: smart.id },
        data: { approvedAt: null },
      });
    }
    const next: SmartApplyState = outstanding > 0 ? 'NEEDS_USER_INPUT' : 'READY_FOR_REVIEW';
    if (current.state !== next) {
      await this.transition(
        smart.id,
        ANSWERABLE,
        next,
        'USER',
        outstanding > 0
          ? `${outstanding} required question${outstanding === 1 ? '' : 's'} still need${outstanding === 1 ? 's' : ''} an answer.`
          : current.state === 'AWAITING_USER_SUBMISSION'
            ? 'An answer changed after approval: review it again.'
            : 'All required questions are answered: ready for your review.',
        current.state === 'AWAITING_USER_SUBMISSION' ? { submissionMethod: null } : {},
        { tolerateConflict: true },
      );
    }
  }

  /** Fills unanswered questions from confirmed saved answers or profile facts (never guesses). */
  private async resolveAnswers(userId: string, applicationId: string): Promise<void> {
    const [questions, saved, details] = await Promise.all([
      this.prisma.applicationQuestion.findMany({ where: { applicationId } }),
      this.prisma.profileAnswer.findMany({ where: { userId } }),
      this.profile.getDetails(userId).catch(() => null),
    ]);
    const savedByKey = new Map(saved.map((s) => [s.answerKey, s]));
    const now = new Date();
    for (const q of questions) {
      const sensitivity = sensitivityOf(q.question, q.questionType);
      const unanswered = q.status !== 'APPROVED' && q.userAnswer === null;
      const resolution = unanswered
        ? resolveAnswer(
            { question: q.question, questionType: q.questionType, sensitivity, options: q.options },
            savedByKey,
            details,
            now,
          )
        : null;
      if (resolution) {
        const fits = checkLimits(resolution.answer, {
          maxWords: q.maxWords,
          maxCharacters: q.maxCharacters,
        }).withinLimits;
        const confirmed = resolution.confirmed && fits;
        await this.prisma.applicationQuestion.update({
          where: { id: q.id },
          data: {
            sensitivity,
            userAnswer: resolution.answer,
            prefilledFrom: resolution.prefilledFrom,
            profileAnswerId: resolution.profileAnswerId,
            status: confirmed ? 'APPROVED' : 'EDITED',
            approvedAt: confirmed ? now : null,
          },
        });
      } else if (q.sensitivity !== sensitivity) {
        await this.prisma.applicationQuestion.update({
          where: { id: q.id },
          data: { sensitivity },
        });
      }
    }
  }

  private outstanding(applicationId: string): Promise<number> {
    return this.prisma.applicationQuestion.count({
      where: { applicationId, isRequired: true, status: { not: 'APPROVED' } },
    });
  }

  private async outstandingByApplication(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const groups = await this.prisma.applicationQuestion.groupBy({
      by: ['applicationId'],
      where: { applicationId: { in: ids }, isRequired: true, status: { not: 'APPROVED' } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.applicationId, g._count._all]));
  }

  private async questionsFor(
    smartId: string,
    applicationId: string,
    job: { title: string; companyName: string },
  ): Promise<SmartApplyQuestion[]> {
    const rows = await this.prisma.applicationQuestion.findMany({
      where: { applicationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((q) => toQuestion(q, smartId, job));
  }

  private async latestCoverLetter(applicationId: string) {
    const cover = await this.prisma.coverLetterVersion.findFirst({
      where: { preparation: { applicationId } },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true, status: true, text: true },
    });
    return cover ?? null;
  }

  private async eligibilityFor(smart: SmartRow): Promise<SubmissionEligibility> {
    const target = targetOf(smart);
    const provider = this.providers.find((p) => p.supports(target)) ?? null;
    const [s, submissionsToday, outstanding] = await Promise.all([
      this.settings(smart.userId),
      this.submissionsToday(smart.userId),
      this.outstanding(smart.applicationId),
    ]);
    return evaluateEligibility({
      provider: provider ? { key: provider.key, name: provider.name } : null,
      providerReason: discoveryOnlyReason(smart.sourceKey),
      autoSubmitEnabled: this.autoSubmitEnabled,
      mode: s.mode,
      consentValid: consentValid(s),
      submissionsToday,
      dailySubmissionLimit: s.dailySubmissionLimit,
      outstandingQuestions: outstanding,
      approved: smart.approvedAt !== null,
    });
  }

  private async buildRequest(smart: SmartRow, idempotencyKey: string): Promise<SubmissionRequest> {
    const [details, app, cover, questions] = await Promise.all([
      this.profile.getDetails(smart.userId),
      this.prisma.application.findUniqueOrThrow({
        where: { id: smart.applicationId },
        select: { resumeVersionId: true, resumeVersion: { select: { file: true } } },
      }),
      this.latestCoverLetter(smart.applicationId),
      this.prisma.applicationQuestion.findMany({
        where: { applicationId: smart.applicationId, status: 'APPROVED' },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const file = app.resumeVersion.file;
    return {
      idempotencyKey,
      target: targetOf(smart),
      applicant: { fullName: details.fullName, email: details.email, phone: details.phone },
      resumeVersionId: app.resumeVersionId,
      loadResumeFile: async () => {
        if (!file) return null;
        const object = await this.storage.get(file.storageKey);
        const chunks: Buffer[] = [];
        for await (const chunk of object.body) chunks.push(Buffer.from(chunk as Uint8Array));
        return {
          fileName: file.originalFilename,
          mimeType: file.mimeType,
          bytes: Buffer.concat(chunks),
        };
      },
      coverLetter: cover?.text ?? null,
      answers: questions.map((q) => ({
        externalKey: q.externalKey,
        question: q.question,
        answer: q.userAnswer ?? '',
      })),
    };
  }

  private async recommendedVersion(
    userId: string,
    job: { id: string; selectedResumeVersionId: string | null; currentAnalysisId: string | null },
  ): Promise<string | null> {
    const rec = await this.prisma.jobRecommendation.findFirst({
      where: { userId, jobId: job.id },
      select: { recommendedResumeVersionId: true },
    });
    if (rec?.recommendedResumeVersionId) return rec.recommendedResumeVersionId;
    if (job.selectedResumeVersionId) return job.selectedResumeVersionId;
    if (!job.currentAnalysisId) return null;
    const analysis = await this.prisma.resumeRecommendation.findUnique({
      where: { analysisId: job.currentAnalysisId },
      select: { resumeVersionId: true },
    });
    return analysis?.resumeVersionId ?? null;
  }

  private async owned(userId: string, id: string): Promise<SmartRow> {
    const row = await this.prisma.smartApplication.findFirst({ where: { id, userId } });
    if (!row) throw notFound();
    return row;
  }

  private async settings(userId: string, db: Db = this.prisma) {
    const row = await db.smartApplySettings.findUnique({ where: { userId } });
    return (
      row ?? {
        userId,
        mode: 'PREPARE_ONLY' as const,
        dailyApplicationLimit: 10,
        dailySubmissionLimit: 3,
        autoSubmitConsentAt: null,
        consentVersion: null,
        notifyInputNeeded: true,
        notifySubmission: true,
        updatedAt: new Date(0),
      }
    );
  }

  private async usage(userId: string) {
    const since = new Date(Date.now() - DAY_MS);
    const [applicationsToday, submissionsToday] = await Promise.all([
      this.prisma.smartApplication.count({ where: { userId, createdAt: { gte: since } } }),
      this.submissionsToday(userId),
    ]);
    return { applicationsToday, submissionsToday };
  }

  /** Applications sent automatically in the last 24 hours (first attempts only). */
  private submissionsToday(userId: string, db: Db = this.prisma): Promise<number> {
    return db.submissionAttempt.count({
      where: { userId, attemptNumber: 1, startedAt: { gte: new Date(Date.now() - DAY_MS) } },
    });
  }

  private async notifyState(
    userId: string,
    id: string,
    state: SmartApplyState,
    outstanding: number,
  ) {
    const s = await this.settings(userId);
    if (state !== 'NEEDS_USER_INPUT' || !s.notifyInputNeeded) return;
    await this.notifications.notify({
      userId,
      type: 'SMART_APPLY_INPUT_NEEDED',
      title: 'An application needs your answers',
      body: `${outstanding} required question${outstanding === 1 ? '' : 's'} must be answered before the application can be reviewed.`,
      link: `/smart-apply/${id}`,
      data: { smartApplicationId: id },
      dedupKey: `smart-apply-input:${id}:${new Date().toISOString().slice(0, 13)}`,
    });
  }

  private async notifySubmission(
    userId: string,
    id: string,
    what: 'confirmed' | 'failed' | 'uncertain',
  ) {
    const s = await this.settings(userId);
    if (!s.notifySubmission) return;
    const text = {
      confirmed: ['Application submitted', 'The provider confirmed your application was received.'],
      failed: [
        'Application not submitted',
        'The submission failed. You can submit it on the official site.',
      ],
      uncertain: [
        'Submission result unknown',
        'We could not confirm whether your application was received. We are checking with the provider; please don’t resubmit yet.',
      ],
    }[what];
    await this.notifications.notify({
      userId,
      type: 'SMART_APPLY_SUBMISSION_UPDATE',
      title: text[0]!,
      body: text[1]!,
      link: `/smart-apply/${id}`,
      data: { smartApplicationId: id },
      dedupKey: `smart-apply-submission:${id}:${what}`,
    });
  }
}

export const SUMMARY_INCLUDE = {
  application: {
    select: {
      status: true,
      matchScore: true,
      resumeVersionId: true,
      job: { select: { id: true, title: true, companyName: true, location: true, source: true } },
    },
  },
  attempts: { orderBy: { attemptNumber: 'desc' as const }, take: 1 },
} satisfies Prisma.SmartApplicationInclude;

function consentValid(s: {
  autoSubmitConsentAt: Date | null;
  consentVersion: string | null;
}): boolean {
  return s.autoSubmitConsentAt !== null && s.consentVersion === AUTO_SUBMIT_CONSENT_VERSION;
}

function targetOf(smart: SmartRow): SubmissionTarget {
  return {
    sourceKey: smart.sourceKey,
    sourceJobId: smart.sourceJobId,
    jobUrl: smart.officialApplicationUrl,
  };
}

function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function toQuestion(
  q: Prisma.ApplicationQuestionGetPayload<object>,
  smartApplicationId: string,
  job: { title: string; companyName: string },
): SmartApplyQuestion {
  const sensitivity = q.sensitivity as SmartApplyQuestion['sensitivity'];
  return {
    id: q.id,
    applicationId: q.applicationId,
    smartApplicationId,
    question: q.question,
    questionType: q.questionType,
    required: q.isRequired,
    sensitivity,
    options: q.options,
    origin: q.origin ?? 'Added by you',
    answer: q.userAnswer,
    confirmed: q.status === 'APPROVED',
    prefilledFrom: q.prefilledFrom as SmartApplyQuestion['prefilledFrom'],
    reason: reasonFor({
      required: q.isRequired,
      origin: q.origin,
      sensitivity,
      questionType: q.questionType,
    }),
    job,
  };
}

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('timeout'));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
