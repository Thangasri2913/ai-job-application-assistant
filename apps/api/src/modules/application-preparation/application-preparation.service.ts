import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ApplicationPreparationDetail,
  type ApplicationQuestionItem,
  checkLimits,
  type CoverLetterResponse,
  type CoverLetterVersionItem,
  fitToLimits,
  INSUFFICIENT_INFORMATION_ANSWER,
  matchLevel,
  parseAnswerLimits,
  type PreparationStatus,
  type ResumeSuggestionItem,
  type ResumeSuggestionsResponse,
  type SuggestionDecisionRequest,
  type TailoredResumeDraft,
} from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { buildDocx } from '../../common/documents/docx-writer.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { JobAnalysisService } from '../jobs/analysis/job-analysis.service.js';
import { ProfileService } from '../profile/profile.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { type AiOutcome, PreparationAi } from './ai/preparation-ai.js';
import type { PreparationContext } from './preparation-context.js';
import { PreparationContextLoader } from './preparation-context.loader.js';
import { classifyQuestion, ruleAnswer } from './rules/answer.rules.js';
import { templateCoverLetter } from './rules/cover-letter.template.js';
import {
  type DraftSuggestion,
  type ReorderTarget,
  ruleSuggestions,
} from './rules/resume-suggestions.rules.js';
import { applySuggestions } from './rules/tailored-draft.js';

/** A generation older than this is considered abandoned (e.g. the server restarted mid-call). */
const BUSY_TIMEOUT_MS = 5 * 60 * 1000;

const AI_OFF_NOTE =
  'AI is not configured on this server, so this was built only from your verified data.';
const aiNote = (outcome: AiOutcome<unknown> | null) =>
  outcome === null
    ? AI_OFF_NOTE
    : outcome.status === 'VALID'
      ? null
      : `${outcome.reason} This was built only from your verified data instead.`;

const notFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found.`);
const conflict = (code: ErrorCode, message: string) =>
  new AppException(HttpStatus.CONFLICT, code, message);
const toJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

type SuggestionRow = Prisma.ResumeSuggestionGetPayload<object>;
type CoverRow = Prisma.CoverLetterVersionGetPayload<object>;
type QuestionRow = Prisma.ApplicationQuestionGetPayload<object>;

const toSuggestion = (s: SuggestionRow): ResumeSuggestionItem => ({
  id: s.id,
  kind: s.kind,
  section: s.section,
  originalText: s.originalText,
  suggestedText: s.suggestedText,
  userText: s.userText,
  reason: s.reason,
  jobRequirement: s.jobRequirement,
  confidence: s.confidence === null ? null : s.confidence.toNumber(),
  source: s.source,
  status: s.status,
  decidedAt: s.decidedAt?.toISOString() ?? null,
  createdAt: s.createdAt.toISOString(),
});

const toCover = (c: CoverRow): CoverLetterVersionItem => ({
  id: c.id,
  versionNumber: c.versionNumber,
  source: c.source,
  generatedText: c.generatedText,
  text: c.text,
  status: c.status,
  note: c.note,
  notClaimed: c.notClaimed,
  approvedAt: c.approvedAt?.toISOString() ?? null,
  documentId: c.documentId,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

const toQuestion = (q: QuestionRow): ApplicationQuestionItem => ({
  id: q.id,
  question: q.question,
  questionType: q.questionType,
  maxWords: q.maxWords,
  maxCharacters: q.maxCharacters,
  suggestedAnswer: q.suggestedAnswer,
  answerSource: q.answerSource,
  insufficientInformation: q.insufficientInformation,
  missingInformation: q.missingInformation,
  assumptions: q.assumptions,
  note: q.note,
  userAnswer: q.userAnswer,
  status: q.status,
  approvedAt: q.approvedAt?.toISOString() ?? null,
  generatedAt: q.generatedAt?.toISOString() ?? null,
  createdAt: q.createdAt.toISOString(),
  updatedAt: q.updatedAt.toISOString(),
});

/**
 * AI-assisted preparation of one application: resume suggestions (never applied silently),
 * a tailored draft built from accepted suggestions, versioned cover letters and answers to
 * application questions. Everything is generated from the application's exact resume version
 * and the user's own profile, and becomes application-ready only after explicit approval.
 */
@Injectable()
export class ApplicationPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly applications: ApplicationsService,
    private readonly resumes: ResumesService,
    private readonly jobAnalysis: JobAnalysisService,
    private readonly profile: ProfileService,
    private readonly ai: PreparationAi,
    private readonly contextLoader: PreparationContextLoader,
  ) {}

  // ── Preparation ──

  /** Creates the preparation if needed (idempotent) and returns it. */
  async start(
    userId: string,
    applicationId: string,
    ctx: RequestContext,
  ): Promise<ApplicationPreparationDetail> {
    await this.ensure(userId, applicationId, ctx);
    return this.get(userId, applicationId);
  }

  async get(userId: string, applicationId: string): Promise<ApplicationPreparationDetail> {
    const target = await this.applications.getPreparationTarget(userId, applicationId);
    const prep = await this.prisma.applicationPreparation.findUnique({
      where: { applicationId: target.id },
    });
    if (!prep) throw notFound('Preparation');
    const [suggestionGroups, latestCover, questions, version, job] = await Promise.all([
      this.prisma.resumeSuggestion.groupBy({
        by: ['status'],
        where: { preparationId: prep.id, supersededAt: null },
        _count: { _all: true },
      }),
      this.prisma.coverLetterVersion.findFirst({
        where: { preparationId: prep.id },
        orderBy: { versionNumber: 'desc' },
      }),
      this.prisma.applicationQuestion.groupBy({
        by: ['status'],
        where: { applicationId },
        _count: { _all: true },
      }),
      this.resumes.getVersionContent(userId, prep.resumeVersionId),
      this.prisma.job.findFirstOrThrow({
        where: { id: prep.jobId, userId },
        select: { id: true, title: true, companyName: true },
      }),
    ]);
    const count = (groups: { status: string; _count: { _all: number } }[], status?: string) =>
      groups.filter((g) => !status || g.status === status).reduce((s, g) => s + g._count._all, 0);
    let match: ApplicationPreparationDetail['match'] = null;
    if (version?.content) {
      try {
        const m = await this.jobAnalysis.getMatchContext(
          userId,
          prep.jobId,
          prep.resumeVersionId,
          version.content,
          new Date(),
        );
        match = {
          score: m.match.score,
          level: matchLevel(m.match.score),
          strengths: m.match.strengths,
          gaps: m.match.gaps,
        };
      } catch {
        match = null; // job not analysed (yet)
      }
    }
    const { blockers } = await this.computeStatus(prep.id, applicationId, prep.approvedAt);
    return {
      id: prep.id,
      applicationId,
      status: prep.status,
      approvedAt: prep.approvedAt?.toISOString() ?? null,
      aiEnabled: this.ai.enabled,
      busyOperation:
        prep.busyOperation &&
        prep.busySince &&
        Date.now() - prep.busySince.getTime() < BUSY_TIMEOUT_MS
          ? prep.busyOperation
          : null,
      job,
      resume: {
        resumeId: version?.resumeId ?? '',
        resumeName: version?.resumeName ?? '',
        resumeVersionId: prep.resumeVersionId,
        versionNumber: version?.versionNumber ?? 0,
      },
      match,
      suggestions: {
        total: count(suggestionGroups),
        pending: count(suggestionGroups, 'PENDING'),
        accepted: count(suggestionGroups, 'ACCEPTED'),
        edited: count(suggestionGroups, 'EDITED'),
        rejected: count(suggestionGroups, 'REJECTED'),
      },
      coverLetter: latestCover
        ? {
            versionNumber: latestCover.versionNumber,
            status: latestCover.status,
            source: latestCover.source,
          }
        : null,
      questions: { total: count(questions), approved: count(questions, 'APPROVED') },
      blockers,
      createdAt: prep.createdAt.toISOString(),
      updatedAt: prep.updatedAt.toISOString(),
    };
  }

  /** Marks the preparation application-ready. Only possible when everything has been reviewed. */
  async approve(
    userId: string,
    applicationId: string,
    ctx: RequestContext,
  ): Promise<ApplicationPreparationDetail> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const { blockers } = await this.computeStatus(prep.id, applicationId, null);
    if (blockers.length > 0) {
      throw conflict(
        ErrorCode.PREPARATION_NOT_READY,
        `Not ready to approve: ${blockers.join('; ')}.`,
      );
    }
    await this.prisma.applicationPreparation.update({
      where: { id: prep.id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });
    await this.audit.record({
      action: AuditAction.PREPARATION_APPROVED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId },
    });
    return this.get(userId, applicationId);
  }

  // ── Resume suggestions ──

  async generateSuggestions(
    userId: string,
    applicationId: string,
    ctx: RequestContext,
  ): Promise<ResumeSuggestionsResponse> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    await this.withBusy(prep.id, 'resume-suggestions', async () => {
      const context = await this.loadContext(userId, applicationId);
      const rules = ruleSuggestions(context);
      const ai = await this.ai.analyzeResumeTailoring(context);
      const aiSuggestions: DraftSuggestion[] =
        ai?.status === 'VALID'
          ? ai.value.map((s) => ({
              kind: 'REWRITE',
              section: s.section,
              originalText: s.originalText,
              suggestedText: s.suggestedText,
              reason: s.reason,
              jobRequirement: s.jobRequirement,
              confidence: s.confidence,
              target: null,
            }))
          : [];
      const note =
        ai === null
          ? 'AI is not configured on this server, so suggestions come from your match analysis only (no rewrites).'
          : ai.status !== 'VALID'
            ? `${ai.reason} Suggestions come from your match analysis only.`
            : ai.dropped > 0
              ? `${ai.dropped} AI suggestion${ai.dropped === 1 ? ' was' : 's were'} discarded because ${ai.dropped === 1 ? 'it' : 'they'} added facts not in your resume.`
              : null;

      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.resumeSuggestion.findMany({
          where: { preparationId: prep.id, supersededAt: null },
        });
        // Undecided suggestions are replaced; the user's decisions are kept.
        await tx.resumeSuggestion.updateMany({
          where: { preparationId: prep.id, supersededAt: null, status: 'PENDING' },
          data: { supersededAt: new Date() },
        });
        const decided = existing.filter((s) => s.status !== 'PENDING');
        const key = (
          s: Pick<
            DraftSuggestion,
            'kind' | 'section' | 'originalText' | 'suggestedText' | 'jobRequirement'
          >,
        ) => [s.kind, s.section, s.originalText, s.suggestedText, s.jobRequirement].join('|');
        const seen = new Set(decided.map(key));
        let order = existing.reduce((m, s) => Math.max(m, s.sortOrder), 0);
        const rows = [
          ...aiSuggestions.map((s) => ({ ...s, source: 'AI' as const })),
          ...rules.map((s) => ({ ...s, source: 'RULES' as const })),
        ].filter((s) => !seen.has(key(s)) && (seen.add(key(s)), true));
        await tx.resumeSuggestion.createMany({
          data: rows.map((s) => ({
            preparationId: prep.id,
            sortOrder: ++order,
            kind: s.kind,
            section: s.section,
            originalText: s.originalText,
            suggestedText: s.suggestedText,
            reason: s.reason,
            jobRequirement: s.jobRequirement,
            confidence: s.confidence,
            source: s.source,
            target: s.target ? toJson(s.target) : Prisma.DbNull,
          })),
        });
        await tx.applicationPreparation.update({
          where: { id: prep.id },
          data: { suggestionsNote: note, suggestionsAt: new Date() },
        });
      });
      await this.audit.record({
        action: AuditAction.RESUME_SUGGESTIONS_GENERATED,
        userId,
        requestId: ctx.requestId,
        metadata: {
          applicationId,
          rules: rules.length,
          ai: aiSuggestions.length,
          aiStatus: ai?.status ?? 'DISABLED',
        },
      });
    });
    await this.refresh(prep.id, applicationId);
    return this.listSuggestions(userId, applicationId);
  }

  async listSuggestions(userId: string, applicationId: string): Promise<ResumeSuggestionsResponse> {
    const prep = await this.findPreparation(userId, applicationId);
    if (!prep) return { suggestions: [], note: null, generatedAt: null };
    const rows = await this.prisma.resumeSuggestion.findMany({
      where: { preparationId: prep.id, supersededAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      suggestions: rows.map(toSuggestion),
      note: prep.suggestionsNote,
      generatedAt: prep.suggestionsAt?.toISOString() ?? null,
    };
  }

  async decideSuggestion(
    userId: string,
    applicationId: string,
    suggestionId: string,
    dto: SuggestionDecisionRequest,
    ctx: RequestContext,
  ): Promise<ResumeSuggestionItem> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const s = await this.prisma.resumeSuggestion.findFirst({
      where: { id: suggestionId, preparationId: prep.id, supersededAt: null },
    });
    if (!s) throw notFound('Suggestion');
    const editable = s.kind === 'REWRITE' || (s.kind === 'REORDER' && s.section === 'EXPERIENCE');
    if (dto.action === 'EDIT' && !editable) {
      throw AppException.validation([
        { field: 'action', messages: ['This suggestion can’t be edited; accept or reject it.'] },
      ]);
    }
    const text = dto.text?.trim();
    if (dto.action === 'EDIT' && !text)
      throw AppException.validation([{ field: 'text', messages: ['Enter your wording.'] }]);
    const data: Prisma.ResumeSuggestionUpdateInput =
      dto.action === 'RESET'
        ? { status: 'PENDING', userText: null, decidedAt: null }
        : {
            status:
              dto.action === 'ACCEPT'
                ? 'ACCEPTED'
                : dto.action === 'REJECT'
                  ? 'REJECTED'
                  : 'EDITED',
            userText: dto.action === 'EDIT' ? text! : null,
            decidedAt: new Date(),
          };
    const updated = await this.prisma.resumeSuggestion.update({ where: { id: s.id }, data });
    const action =
      dto.action === 'ACCEPT'
        ? AuditAction.RESUME_SUGGESTION_ACCEPTED
        : dto.action === 'REJECT'
          ? AuditAction.RESUME_SUGGESTION_REJECTED
          : dto.action === 'EDIT'
            ? AuditAction.RESUME_SUGGESTION_EDITED
            : AuditAction.RESUME_SUGGESTION_RESET;
    await this.audit.record({
      action,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, suggestionId, kind: s.kind },
    });
    await this.refresh(prep.id, applicationId);
    return toSuggestion(updated);
  }

  /** The source version with accepted/edited suggestions applied. The original is never modified. */
  async tailoredDraft(userId: string, applicationId: string): Promise<TailoredResumeDraft> {
    const target = await this.applications.getPreparationTarget(userId, applicationId);
    const version = await this.resumes.getVersionContent(userId, target.resumeVersionId);
    if (!version?.content)
      throw conflict(
        ErrorCode.RESUME_CONTENT_MISSING,
        'The resume version used has no structured content.',
      );
    const prep = await this.findPreparation(userId, applicationId);
    const decided = prep
      ? await this.prisma.resumeSuggestion.findMany({
          where: {
            preparationId: prep.id,
            supersededAt: null,
            status: { in: ['ACCEPTED', 'EDITED'] },
          },
          orderBy: { sortOrder: 'asc' },
        })
      : [];
    const { content, applied } = applySuggestions(
      version.content,
      decided.map((s) => ({
        id: s.id,
        kind: s.kind,
        originalText: s.originalText,
        finalText: s.status === 'EDITED' ? s.userText : s.suggestedText,
        target: (s.target as ReorderTarget | null) ?? null,
      })),
    );
    return {
      applicationId,
      jobId: target.jobId,
      sourceResumeVersionId: target.resumeVersionId,
      sourceResumeName: version.resumeName,
      sourceVersionNumber: version.versionNumber,
      content,
      appliedSuggestionIds: applied,
    };
  }

  // ── Cover letter ──

  async generateCoverLetter(
    userId: string,
    applicationId: string,
    mode: 'GENERATE' | 'MANUAL',
    ctx: RequestContext,
  ): Promise<CoverLetterResponse> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    await this.withBusy(prep.id, 'cover-letter', async () => {
      let letter: {
        text: string;
        notClaimed: string[];
        source: 'AI' | 'TEMPLATE' | 'MANUAL';
        note: string | null;
      };
      if (mode === 'MANUAL') {
        letter = { text: '', notClaimed: [], source: 'MANUAL', note: null };
      } else {
        const context = await this.loadContext(userId, applicationId);
        const ai = await this.ai.generateCoverLetter(context);
        if (ai?.status === 'VALID') {
          letter = {
            text: ai.value.coverLetter,
            notClaimed: ai.value.notClaimed,
            source: 'AI',
            note: null,
          };
        } else {
          const t = templateCoverLetter(context);
          letter = { text: t.text, notClaimed: t.notClaimed, source: 'TEMPLATE', note: aiNote(ai) };
        }
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const last = await tx.coverLetterVersion.findFirst({
          where: { preparationId: prep.id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        return tx.coverLetterVersion.create({
          data: {
            preparationId: prep.id,
            versionNumber: (last?.versionNumber ?? 0) + 1,
            source: letter.source,
            generatedText: letter.text,
            text: letter.text,
            status: letter.source === 'MANUAL' ? 'EDITED' : 'GENERATED',
            note: letter.note,
            notClaimed: letter.notClaimed,
          },
        });
      });
      await this.audit.record({
        action: AuditAction.COVER_LETTER_GENERATED,
        userId,
        requestId: ctx.requestId,
        metadata: { applicationId, versionNumber: created.versionNumber, source: created.source },
      });
    });
    await this.refresh(prep.id, applicationId);
    return this.getCoverLetter(userId, applicationId);
  }

  async getCoverLetter(userId: string, applicationId: string): Promise<CoverLetterResponse> {
    const prep = await this.findPreparation(userId, applicationId);
    if (!prep) return { latest: null, versions: [] };
    const rows = await this.prisma.coverLetterVersion.findMany({
      where: { preparationId: prep.id },
      orderBy: { versionNumber: 'desc' },
    });
    const versions = rows.map(toCover);
    return { latest: versions[0] ?? null, versions };
  }

  /** Saves the user's edit of the latest version; any previous approval no longer applies. */
  async updateCoverLetter(
    userId: string,
    applicationId: string,
    text: string,
    ctx: RequestContext,
  ): Promise<CoverLetterResponse> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const latest = await this.latestCover(prep.id);
    await this.prisma.coverLetterVersion.update({
      where: { id: latest.id },
      data: { text, status: 'EDITED', approvedAt: null },
    });
    await this.audit.record({
      action: AuditAction.COVER_LETTER_EDITED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, versionNumber: latest.versionNumber },
    });
    await this.refresh(prep.id, applicationId);
    return this.getCoverLetter(userId, applicationId);
  }

  /** Approves the latest version and attaches it to the application as a DOCX document. */
  async approveCoverLetter(
    userId: string,
    applicationId: string,
    ctx: RequestContext,
  ): Promise<CoverLetterResponse> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const latest = await this.latestCover(prep.id);
    if (latest.status === 'APPROVED') return this.getCoverLetter(userId, applicationId);
    if (latest.text.trim().length < 50) {
      throw AppException.validation([
        {
          field: 'text',
          messages: ['Write the cover letter (at least 50 characters) before approving it.'],
        },
      ]);
    }
    // A re-approval replaces the document created for the earlier approval of this version.
    if (latest.documentId)
      await this.applications.removeDocument(userId, applicationId, latest.documentId, ctx);
    const name = `Cover letter v${latest.versionNumber}`;
    const doc = await this.applications.addGeneratedDocument(
      userId,
      applicationId,
      { buffer: buildDocx(latest.text), filename: `${name}.docx`, name, type: 'COVER_LETTER' },
      ctx,
    );
    await this.prisma.coverLetterVersion.update({
      where: { id: latest.id },
      data: { status: 'APPROVED', approvedAt: new Date(), documentId: doc.id },
    });
    await this.audit.record({
      action: AuditAction.COVER_LETTER_APPROVED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, versionNumber: latest.versionNumber, documentId: doc.id },
    });
    await this.refresh(prep.id, applicationId);
    return this.getCoverLetter(userId, applicationId);
  }

  // ── Application questions ──

  async listQuestions(userId: string, applicationId: string): Promise<ApplicationQuestionItem[]> {
    await this.applications.getPreparationTarget(userId, applicationId);
    const rows = await this.prisma.applicationQuestion.findMany({
      where: { applicationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toQuestion);
  }

  async addQuestion(
    userId: string,
    applicationId: string,
    dto: { question: string; maxWords?: number | null; maxCharacters?: number | null },
    ctx: RequestContext,
  ): Promise<ApplicationQuestionItem> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const detected = parseAnswerLimits(dto.question);
    const row = await this.prisma.applicationQuestion.create({
      data: {
        applicationId,
        question: dto.question,
        questionType: classifyQuestion(dto.question),
        maxWords: dto.maxWords !== undefined ? dto.maxWords : detected.maxWords,
        maxCharacters: dto.maxCharacters !== undefined ? dto.maxCharacters : detected.maxCharacters,
      },
    });
    await this.audit.record({
      action: AuditAction.APPLICATION_QUESTION_ADDED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, questionId: row.id, questionType: row.questionType },
    });
    await this.refresh(prep.id, applicationId);
    return toQuestion(row);
  }

  async generateAnswer(
    userId: string,
    applicationId: string,
    questionId: string,
    ctx: RequestContext,
  ): Promise<ApplicationQuestionItem> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const q = await this.ownedQuestion(applicationId, questionId);
    await this.withBusy(prep.id, 'answer', async () => {
      const context = await this.loadContext(userId, applicationId);
      const limits = { maxWords: q.maxWords, maxCharacters: q.maxCharacters };
      const ai = await this.ai.generateApplicationAnswer(context, q.question, limits);
      let result: {
        answer: string;
        source: 'AI' | 'RULES';
        insufficient: boolean;
        missing: string[];
        assumptions: string[];
        note: string | null;
      };
      if (ai?.status === 'VALID') {
        const v = ai.value;
        result =
          v.insufficientInformation || v.answer.trim() === ''
            ? {
                answer: INSUFFICIENT_INFORMATION_ANSWER,
                source: 'AI',
                insufficient: true,
                missing: v.missingInformation,
                assumptions: v.assumptions,
                note: null,
              }
            : {
                answer: v.answer,
                source: 'AI',
                insufficient: false,
                missing: v.missingInformation,
                assumptions: v.assumptions,
                note: null,
              };
      } else {
        const r = ruleAnswer(context, q.question, q.questionType);
        result = {
          answer: r.answer ?? INSUFFICIENT_INFORMATION_ANSWER,
          source: 'RULES',
          insufficient: r.answer === null,
          missing: r.missingInformation,
          assumptions: [],
          note:
            ai === null
              ? 'AI is not configured on this server; this answer uses only facts from your profile and resume.'
              : `${ai.reason} This answer uses only facts from your profile and resume.`,
        };
      }
      if (!result.insufficient) {
        const fitted = fitToLimits(result.answer, limits);
        if (fitted !== result.answer) {
          result = {
            ...result,
            answer: fitted,
            note: [result.note, 'Shortened to fit the limit — please review the ending.']
              .filter(Boolean)
              .join(' '),
          };
        }
      }
      await this.prisma.applicationQuestion.update({
        where: { id: q.id },
        data: {
          suggestedAnswer: result.answer,
          answerSource: result.source,
          insufficientInformation: result.insufficient,
          missingInformation: result.missing,
          assumptions: result.assumptions,
          note: result.note,
          generatedAt: new Date(),
          // A new suggestion never overwrites the user's own answer; it only revokes approval.
          status: q.userAnswer ? 'EDITED' : 'GENERATED',
          approvedAt: null,
        },
      });
      await this.audit.record({
        action: AuditAction.APPLICATION_QUESTION_GENERATED,
        userId,
        requestId: ctx.requestId,
        metadata: {
          applicationId,
          questionId,
          source: result.source,
          insufficient: result.insufficient,
        },
      });
    });
    await this.refresh(prep.id, applicationId);
    return toQuestion(await this.ownedQuestion(applicationId, questionId));
  }

  async updateQuestion(
    userId: string,
    applicationId: string,
    questionId: string,
    dto: { userAnswer?: string | null; maxWords?: number | null; maxCharacters?: number | null },
    ctx: RequestContext,
  ): Promise<ApplicationQuestionItem> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const q = await this.ownedQuestion(applicationId, questionId);
    const data: Prisma.ApplicationQuestionUpdateInput = {
      status: q.suggestedAnswer || dto.userAnswer ? 'EDITED' : 'PENDING',
      approvedAt: null,
    };
    if (dto.userAnswer !== undefined) data.userAnswer = dto.userAnswer?.trim() || null;
    if (dto.maxWords !== undefined) data.maxWords = dto.maxWords;
    if (dto.maxCharacters !== undefined) data.maxCharacters = dto.maxCharacters;
    const updated = await this.prisma.applicationQuestion.update({ where: { id: q.id }, data });
    await this.audit.record({
      action: AuditAction.APPLICATION_ANSWER_EDITED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, questionId },
    });
    await this.refresh(prep.id, applicationId);
    return toQuestion(updated);
  }

  /** Approves the final answer (the user's, or the accepted suggestion). It must fit the limits. */
  async approveAnswer(
    userId: string,
    applicationId: string,
    questionId: string,
    ctx: RequestContext,
  ): Promise<ApplicationQuestionItem> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const q = await this.ownedQuestion(applicationId, questionId);
    const final = q.userAnswer ?? (q.insufficientInformation ? null : q.suggestedAnswer);
    if (!final) {
      throw conflict(
        ErrorCode.ANSWER_REQUIRED,
        'Write your answer before approving it — there is not enough verified information for a suggestion.',
      );
    }
    const check = checkLimits(final, { maxWords: q.maxWords, maxCharacters: q.maxCharacters });
    if (!check.withinLimits) {
      throw AppException.validation([
        {
          field: 'userAnswer',
          messages: [
            `The answer is over the limit (${check.words} words, ${check.characters} characters). Shorten it before approving.`,
          ],
        },
      ]);
    }
    const updated = await this.prisma.applicationQuestion.update({
      where: { id: q.id },
      data: { userAnswer: final, status: 'APPROVED', approvedAt: new Date() },
    });
    await this.audit.record({
      action: AuditAction.APPLICATION_ANSWER_APPROVED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, questionId },
    });
    await this.refresh(prep.id, applicationId);
    return toQuestion(updated);
  }

  async deleteQuestion(
    userId: string,
    applicationId: string,
    questionId: string,
    ctx: RequestContext,
  ): Promise<void> {
    const prep = await this.ensure(userId, applicationId, ctx, { requireActive: true });
    const q = await this.ownedQuestion(applicationId, questionId);
    await this.prisma.applicationQuestion.delete({ where: { id: q.id } });
    await this.audit.record({
      action: AuditAction.APPLICATION_QUESTION_DELETED,
      userId,
      requestId: ctx.requestId,
      metadata: { applicationId, questionId },
    });
    await this.refresh(prep.id, applicationId);
  }

  // ── Internals ──

  private async findPreparation(userId: string, applicationId: string) {
    const target = await this.applications.getPreparationTarget(userId, applicationId);
    return this.prisma.applicationPreparation.findUnique({ where: { applicationId: target.id } });
  }

  /** Owner check, then the preparation (created on first use, tied to the application's exact version). */
  private async ensure(
    userId: string,
    applicationId: string,
    ctx: RequestContext,
    opts: { requireActive?: boolean } = {},
  ) {
    const target = await this.applications.getPreparationTarget(userId, applicationId);
    if (opts.requireActive && target.archivedAt) {
      throw conflict(ErrorCode.APPLICATION_ARCHIVED, 'Restore this application to prepare it.');
    }
    const existing = await this.prisma.applicationPreparation.findUnique({
      where: { applicationId: target.id },
    });
    if (existing) return existing;
    try {
      const created = await this.prisma.applicationPreparation.create({
        data: {
          applicationId: target.id,
          userId,
          jobId: target.jobId,
          resumeVersionId: target.resumeVersionId,
        },
      });
      await this.audit.record({
        action: AuditAction.PREPARATION_STARTED,
        userId,
        requestId: ctx.requestId,
        metadata: { applicationId, resumeVersionId: target.resumeVersionId },
      });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.applicationPreparation.findUniqueOrThrow({
          where: { applicationId: target.id },
        });
      }
      throw error;
    }
  }

  private loadContext(userId: string, applicationId: string): Promise<PreparationContext> {
    return this.contextLoader.load(userId, applicationId);
  }

  /** Runs `fn` while holding the preparation's generation slot; a concurrent request gets 409. */
  private async withBusy(
    preparationId: string,
    operation: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const staleBefore = new Date(Date.now() - BUSY_TIMEOUT_MS);
    const claimed = await this.prisma.applicationPreparation.updateMany({
      where: {
        id: preparationId,
        OR: [{ busyOperation: null }, { busySince: { lt: staleBefore } }],
      },
      data: { busyOperation: operation, busySince: new Date() },
    });
    if (claimed.count === 0) {
      throw conflict(
        ErrorCode.AI_GENERATION_IN_PROGRESS,
        'Something is already being generated for this application. Wait for it to finish.',
      );
    }
    try {
      await fn();
    } finally {
      await this.prisma.applicationPreparation.update({
        where: { id: preparationId },
        data: { busyOperation: null, busySince: null },
      });
    }
  }

  private async latestCover(preparationId: string) {
    const latest = await this.prisma.coverLetterVersion.findFirst({
      where: { preparationId },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latest) throw notFound('Cover letter');
    return latest;
  }

  private async ownedQuestion(applicationId: string, questionId: string) {
    const q = await this.prisma.applicationQuestion.findFirst({
      where: { id: questionId, applicationId },
    });
    if (!q) throw notFound('Question');
    return q;
  }

  private async computeStatus(
    preparationId: string,
    applicationId: string,
    approvedAt: Date | null,
  ): Promise<{ status: PreparationStatus; blockers: string[] }> {
    const [suggestions, pending, latest, questions, unapproved] = await Promise.all([
      this.prisma.resumeSuggestion.count({ where: { preparationId, supersededAt: null } }),
      this.prisma.resumeSuggestion.count({
        where: { preparationId, supersededAt: null, status: 'PENDING' },
      }),
      this.prisma.coverLetterVersion.findFirst({
        where: { preparationId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true, status: true },
      }),
      this.prisma.applicationQuestion.count({ where: { applicationId } }),
      this.prisma.applicationQuestion.count({
        where: { applicationId, status: { not: 'APPROVED' } },
      }),
    ]);
    const blockers: string[] = [];
    if (suggestions + questions === 0 && !latest)
      blockers.push('Generate resume suggestions, a cover letter or answers first');
    if (pending > 0)
      blockers.push(
        `${pending} resume suggestion${pending === 1 ? '' : 's'} still need${pending === 1 ? 's' : ''} a decision`,
      );
    if (latest && latest.status !== 'APPROVED')
      blockers.push(`Approve cover letter v${latest.versionNumber}`);
    if (unapproved > 0)
      blockers.push(
        `${unapproved} application answer${unapproved === 1 ? '' : 's'} still need${unapproved === 1 ? 's' : ''} approval`,
      );
    const hasMaterial = suggestions + questions > 0 || latest !== null;
    const status: PreparationStatus = !hasMaterial
      ? 'NOT_STARTED'
      : blockers.length > 0
        ? 'READY'
        : approvedAt
          ? 'APPROVED'
          : 'REVIEWED';
    return { status, blockers };
  }

  /** Re-derives the status after a change; any change that needs review again revokes approval. */
  private async refresh(preparationId: string, applicationId: string): Promise<void> {
    const prep = await this.prisma.applicationPreparation.findUniqueOrThrow({
      where: { id: preparationId },
      select: { approvedAt: true },
    });
    const { status } = await this.computeStatus(preparationId, applicationId, prep.approvedAt);
    await this.prisma.applicationPreparation.update({
      where: { id: preparationId },
      data: { status, ...(status !== 'APPROVED' ? { approvedAt: null } : {}) },
    });
  }
}
