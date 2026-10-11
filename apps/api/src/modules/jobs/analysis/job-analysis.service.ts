import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  JOB_REQUIREMENT_TYPES,
  type JobAnalysisResult,
  type JobMatchesResponse,
  type JobRecommendationResponse,
  type ResumeContent,
} from '@job-assist/shared';
import type { RequestContext } from '../../../common/decorators/request-context.decorator.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { AuditAction } from '../../audit/audit-actions.js';
import { AuditService } from '../../audit/audit.service.js';
import { ProfileService } from '../../profile/profile.service.js';
import { ResumesService } from '../../resumes/resumes.service.js';
import {
  readExcluded,
  toAnalysisResult,
  toMatchItem,
  toRecommendationItem,
} from '../job.mapper.js';
import { jobNotFound } from '../jobs.service.js';
import { scoreMatch } from '../matching/match-scorer.js';
import { subjectFromProfile, subjectFromResume } from '../matching/match-subjects.js';
import { rankMatches, recommendationReasons } from '../matching/recommendation.js';
import { SCORING_VERSION, SCORING_WEIGHTS } from '../matching/scoring-config.js';
import { type AiJobAnalysisResult, JobAiAnalyzer } from './job-ai-analyzer.js';
import { JobAnalysisDispatcher } from './job-analysis-dispatcher.js';
import {
  analyzeJobText,
  type DeterministicJobAnalysis,
  type DraftRequirement,
  isInsufficient,
  JOB_ANALYZER_VERSION,
} from './job-analyzer.js';

const INSUFFICIENT =
  'We couldn’t find any skills, responsibilities or experience requirements in this description. Paste the full job description and analyse it again.';
const FAILED = 'The analysis could not be completed. Please try again.';

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Combines the rule-based analysis with grounded AI findings. The application decides; AI only adds evidence-backed items. */
export function mergeAnalyses(
  base: DeterministicJobAnalysis,
  ai: AiJobAnalysisResult | null,
): DeterministicJobAnalysis & { aiSummary: string | null } {
  if (!ai || ai.status !== 'VALID') return { ...base, aiSummary: null };
  const merged = new Map(base.requirements.map((r) => [`${r.type}|${r.normalizedName}`, r]));
  for (const r of ai.requirements) {
    const key = `${r.type}|${r.normalizedName}`;
    const existing = merged.get(key);
    // An explicit, quoted AI statement may settle an importance the rules could only infer.
    if (!existing || (existing.origin === 'INFERRED' && r.origin === 'EXPLICIT'))
      merged.set(key, r);
  }
  return {
    ...base,
    requirements: [...merged.values()],
    keywords: [...new Set([...base.keywords, ...ai.keywords])],
    seniority: base.seniority ?? ai.seniority,
    seniorityOrigin: base.seniority ? base.seniorityOrigin : ai.seniority ? 'INFERRED' : null,
    employmentType: base.employmentType ?? ai.employmentType,
    confidence: Math.round(((base.confidence + ai.confidence) / 2) * 100) / 100,
    aiSummary: ai.summary,
  };
}

const TYPE_ORDER = new Map(JOB_REQUIREMENT_TYPES.map((t, i) => [t, i]));
function orderRequirements(list: DraftRequirement[]): DraftRequirement[] {
  return list
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        TYPE_ORDER.get(a.r.type)! - TYPE_ORDER.get(b.r.type)! ||
        Number(a.r.importance === 'PREFERRED') - Number(b.r.importance === 'PREFERRED') ||
        a.i - b.i,
    )
    .map(({ r }) => r);
}

/**
 * Runs and serves job analyses: requirements extraction, deterministic comparison against
 * the career profile and every active resume version, and the resulting recommendation.
 */
@Injectable()
export class JobAnalysisService {
  private readonly logger = new Logger(JobAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: JobAiAnalyzer,
    private readonly profile: ProfileService,
    private readonly resumes: ResumesService,
    private readonly dispatcher: JobAnalysisDispatcher,
  ) {}

  /** Queues a new analysis run. 409 if the job is archived or a run is already in progress. */
  async start(userId: string, jobId: string, ctx: RequestContext) {
    const run = await this.createRun(userId, jobId);
    await this.audit.record({
      action: AuditAction.JOB_ANALYSIS_STARTED,
      userId,
      requestId: ctx.requestId,
      metadata: { jobId, analysisId: run.id },
    });
    this.dispatcher.dispatch(run.id);
    return { analysisId: run.id, status: run.status, createdAt: run.createdAt.toISOString() };
  }

  /**
   * Runs a full analysis now and waits for it (job discovery runs in the background
   * already). Same run, matching and recommendation as `start`.
   */
  async analyzeNow(userId: string, jobId: string): Promise<string> {
    const run = await this.createRun(userId, jobId);
    await this.audit.record({
      action: AuditAction.JOB_ANALYSIS_STARTED,
      userId,
      metadata: { jobId, analysisId: run.id, trigger: 'discovery' },
    });
    await this.process(run.id);
    return run.id;
  }

  private createRun(userId: string, jobId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the job row so two concurrent requests can't both start a run.
      const [job] = await tx.$queryRaw<{ id: string; status: string; content_hash: string }[]>`
        SELECT id, status::text AS status, content_hash FROM jobs
        WHERE id = ${jobId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
      if (!job) throw jobNotFound();
      if (job.status === 'ARCHIVED') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.JOB_ARCHIVED,
          'Restore this job before analysing it.',
        );
      }
      const active = await tx.jobAnalysis.findFirst({
        where: { jobId, status: { in: ['PENDING', 'RUNNING'] } },
        select: { id: true },
      });
      if (active) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.ANALYSIS_IN_PROGRESS,
          'This job is already being analysed.',
        );
      }
      return tx.jobAnalysis.create({
        data: { jobId, analyzerVersion: JOB_ANALYZER_VERSION, jobContentHash: job.content_hash },
        select: { id: true, status: true, createdAt: true },
      });
    });
  }

  /** Background work for one run. Never throws: failures are stored on the run. */
  async process(analysisId: string): Promise<void> {
    const run = await this.prisma.jobAnalysis.findUnique({
      where: { id: analysisId },
      include: { job: true },
    });
    if (!run || run.status === 'COMPLETED' || run.status === 'FAILED') return;
    const { job } = run;
    const now = new Date();
    await this.prisma.jobAnalysis.update({
      where: { id: analysisId },
      data: { status: 'RUNNING', startedAt: now, jobContentHash: job.contentHash },
    });

    try {
      const deterministic = analyzeJobText({
        title: job.title,
        description: job.normalizedDescription,
      });
      const ai = await this.ai.analyze({
        title: job.title,
        companyName: job.companyName,
        description: job.normalizedDescription,
      });
      const analysis = mergeAnalyses(deterministic, ai);
      const aiFields = {
        aiStatus: ai?.status ?? 'DISABLED',
        aiNote: ai && ai.status !== 'VALID' ? ai.reason : null,
        aiProvider: ai?.provider ?? null,
        aiPromptVersion: ai?.promptVersion ?? null,
        aiExtraction: ai && ai.status === 'VALID' ? toJson(ai) : Prisma.DbNull,
      };
      if (isInsufficient(analysis)) {
        await this.fail(analysisId, job.userId, job.id, INSUFFICIENT, aiFields);
        return;
      }

      const requirements = orderRequirements(analysis.requirements);
      const [profile, { candidates, excluded }] = await Promise.all([
        this.profile.getProfile(job.userId),
        this.resumes.listMatchCandidates(job.userId),
      ]);
      const matchJob = { title: job.title, requirements, keywords: analysis.keywords };
      const ranked = rankMatches(
        candidates.map((c) => ({
          resumeVersionId: c.versionId,
          resumeName: c.resumeName,
          isDefault: c.isDefault,
          activatedAt: c.activatedAt,
          candidate: c,
          scored: scoreMatch(matchJob, subjectFromResume(c.content, now)),
        })),
      );
      const profileScore = scoreMatch(matchJob, subjectFromProfile(profile, now));
      const { reasons, gaps } = recommendationReasons(ranked);

      const recommendation = await this.prisma.$transaction(async (tx) => {
        await tx.jobAnalysis.update({
          where: { id: analysisId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            summary: analysis.summary,
            aiSummary: analysis.aiSummary,
            seniority: analysis.seniority,
            seniorityOrigin: analysis.seniorityOrigin,
            employmentType: analysis.employmentType,
            keywords: analysis.keywords,
            confidence: analysis.confidence,
            excludedResumes: toJson(excluded),
            ...aiFields,
          },
        });
        await tx.jobRequirement.createMany({
          data: requirements.map((r, sortOrder) => ({ analysisId, sortOrder, ...r })),
        });
        const common = {
          analysisId,
          jobId: job.id,
          userId: job.userId,
          scoringVersion: SCORING_VERSION,
        };
        const scoreColumns = (s: typeof profileScore) => ({
          overallScore: s.overallScore,
          skillScore: s.scores.skills,
          experienceScore: s.scores.experience,
          responsibilityScore: s.scores.responsibilities,
          projectScore: s.scores.projects,
          educationScore: s.scores.education,
          keywordScore: s.scores.keywords,
          strengths: s.strengths,
          gaps: s.gaps,
          evidence: toJson(s.evidence),
        });
        await tx.matchAnalysis.create({
          data: {
            ...common,
            subjectType: 'PROFILE',
            subjectKey: 'profile',
            ...scoreColumns(profileScore),
          },
        });
        let bestMatchId: string | null = null;
        for (const [index, m] of ranked.entries()) {
          const row = await tx.matchAnalysis.create({
            data: {
              ...common,
              subjectType: 'RESUME_VERSION',
              subjectKey: m.resumeVersionId,
              resumeVersionId: m.resumeVersionId,
              resumeId: m.candidate.resumeId,
              resumeName: m.resumeName,
              versionNumber: m.candidate.versionNumber,
              isDefaultResume: m.isDefault,
              rank: index + 1,
              ...scoreColumns(m.scored),
            },
            select: { id: true },
          });
          if (index === 0) bestMatchId = row.id;
        }
        const best = ranked[0];
        const created =
          best && bestMatchId
            ? await tx.resumeRecommendation.create({
                data: {
                  analysisId,
                  jobId: job.id,
                  matchAnalysisId: bestMatchId,
                  resumeVersionId: best.resumeVersionId,
                  score: best.scored.overallScore,
                  reasons,
                  gaps,
                },
              })
            : null;
        await tx.job.update({ where: { id: job.id }, data: { currentAnalysisId: analysisId } });
        return created;
      });

      await this.audit.record({
        action: AuditAction.JOB_ANALYSIS_COMPLETED,
        userId: job.userId,
        metadata: {
          jobId: job.id,
          analysisId,
          requirementCount: requirements.length,
          aiStatus: aiFields.aiStatus,
        },
      });
      await this.audit.record({
        action: AuditAction.MATCH_ANALYSIS_CREATED,
        userId: job.userId,
        metadata: {
          jobId: job.id,
          analysisId,
          resumesCompared: ranked.length,
          resumesExcluded: excluded.length,
        },
      });
      if (recommendation) {
        await this.audit.record({
          action: AuditAction.RESUME_RECOMMENDED,
          userId: job.userId,
          metadata: {
            jobId: job.id,
            analysisId,
            resumeVersionId: recommendation.resumeVersionId ?? '',
            score: recommendation.score,
          },
        });
      }
    } catch (error) {
      this.logger.error({ err: error, analysisId }, 'Job analysis failed');
      await this.fail(analysisId, job.userId, job.id, FAILED).catch((e: unknown) =>
        this.logger.error({ err: e, analysisId }, 'Could not record the failed analysis'),
      );
    }
  }

  private async fail(
    analysisId: string,
    userId: string,
    jobId: string,
    message: string,
    extra: Prisma.JobAnalysisUpdateInput = {},
  ): Promise<void> {
    await this.prisma.jobAnalysis.update({
      where: { id: analysisId },
      data: { ...extra, status: 'FAILED', error: message, completedAt: new Date() },
    });
    await this.audit.record({
      action: AuditAction.JOB_ANALYSIS_FAILED,
      userId,
      metadata: { jobId, analysisId, insufficient: message === INSUFFICIENT },
    });
  }

  // ── Reads ──

  private async currentAnalysisId(
    userId: string,
    jobId: string,
  ): Promise<{ analysisId: string; contentHash: string }> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
      select: { currentAnalysisId: true, contentHash: true },
    });
    if (!job) throw jobNotFound();
    if (!job.currentAnalysisId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.ANALYSIS_NOT_AVAILABLE,
        'This job hasn’t been analysed yet.',
      );
    }
    return { analysisId: job.currentAnalysisId, contentHash: job.contentHash };
  }

  /**
   * Job facts, stored requirements and the deterministic match for one resume version — the
   * context for preparing an application. Uses the stored match from the current analysis
   * when it compared this version, otherwise scores the version now (same rules, no AI).
   */
  async getMatchContext(
    userId: string,
    jobId: string,
    resumeVersionId: string,
    content: ResumeContent,
    now: Date,
  ) {
    const { analysisId } = await this.currentAnalysisId(userId, jobId);
    const [job, analysis, stored] = await Promise.all([
      this.prisma.job.findFirstOrThrow({
        where: { id: jobId, userId },
        select: { id: true, title: true, companyName: true, normalizedDescription: true },
      }),
      this.prisma.jobAnalysis.findUniqueOrThrow({
        where: { id: analysisId },
        include: { requirements: true },
      }),
      this.prisma.matchAnalysis.findFirst({ where: { analysisId, userId, resumeVersionId } }),
    ]);
    const requirements = [...analysis.requirements]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        type: r.type,
        name: r.name,
        normalizedName: r.normalizedName,
        importance: r.importance,
        minYears: r.minYears,
      }));
    const match = stored
      ? {
          score: stored.overallScore,
          strengths: stored.strengths,
          gaps: stored.gaps,
          evidence: toMatchItem(stored).evidence,
        }
      : (() => {
          const scored = scoreMatch(
            { title: job.title, requirements, keywords: analysis.keywords },
            subjectFromResume(content, now),
          );
          return {
            score: scored.overallScore,
            strengths: scored.strengths,
            gaps: scored.gaps,
            evidence: scored.evidence,
          };
        })();
    return {
      job: {
        id: job.id,
        title: job.title,
        companyName: job.companyName,
        description: job.normalizedDescription,
        requirements,
        keywords: analysis.keywords,
      },
      match,
    };
  }

  /**
   * The stored result of the job's current analysis in the shape job discovery needs:
   * every compared resume version (ranked) with its required-skill coverage, and the
   * recommendation. Null when the job has no completed analysis.
   */
  async getMatchSummary(userId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, userId },
      select: { currentAnalysisId: true },
    });
    if (!job) throw jobNotFound();
    if (!job.currentAnalysisId) return null;
    const analysisId = job.currentAnalysisId;
    const [rows, recommendation] = await Promise.all([
      this.prisma.matchAnalysis.findMany({
        where: { analysisId, userId, subjectType: 'RESUME_VERSION' },
        orderBy: [{ rank: 'asc' }],
      }),
      this.prisma.resumeRecommendation.findUnique({ where: { analysisId } }),
    ]);
    return {
      analysisId,
      resumes: rows.map((row) => {
        const item = toMatchItem(row);
        const required = item.evidence.skills.filter((e) => e.importance === 'REQUIRED');
        return {
          resumeId: item.resumeId,
          resumeVersionId: item.resumeVersionId,
          resumeName: item.resumeName,
          versionNumber: item.versionNumber,
          isDefaultResume: item.isDefaultResume,
          score: item.overallScore,
          scores: item.scores,
          strengths: item.strengths,
          gaps: item.gaps,
          requiredSkills: {
            matched: required.filter((e) => e.status !== 'MISSING').map((e) => e.skill),
            missing: required.filter((e) => e.status === 'MISSING').map((e) => e.skill),
            /** MATCH = 1, PARTIAL = 0.5; null when the job lists no required skills. */
            coverage:
              required.length > 0
                ? required.reduce(
                    (sum, e) => sum + (e.status === 'MATCH' ? 1 : e.status === 'PARTIAL' ? 0.5 : 0),
                    0,
                  ) / required.length
                : null,
          },
        };
      }),
      recommendation: recommendation
        ? {
            resumeVersionId: recommendation.resumeVersionId,
            score: recommendation.score,
            reasons: recommendation.reasons,
            gaps: recommendation.gaps,
          }
        : null,
    };
  }

  async getAnalysis(userId: string, jobId: string): Promise<JobAnalysisResult> {
    const { analysisId, contentHash } = await this.currentAnalysisId(userId, jobId);
    const analysis = await this.prisma.jobAnalysis.findUniqueOrThrow({
      where: { id: analysisId },
      include: { requirements: true },
    });
    return toAnalysisResult(analysis, contentHash);
  }

  async getMatches(userId: string, jobId: string): Promise<JobMatchesResponse> {
    const { analysisId } = await this.currentAnalysisId(userId, jobId);
    const [analysis, rows, current] = await Promise.all([
      this.prisma.jobAnalysis.findUniqueOrThrow({
        where: { id: analysisId },
        select: { excludedResumes: true },
      }),
      this.prisma.matchAnalysis.findMany({
        where: { analysisId, userId },
        orderBy: [{ rank: 'asc' }],
      }),
      this.resumes.listMatchCandidates(userId),
    ]);
    const resumes = rows.filter((m) => m.subjectType === 'RESUME_VERSION').map(toMatchItem);
    const compared = new Set(resumes.map((m) => m.resumeVersionId));
    const now = new Set(current.candidates.map((c) => c.versionId));
    return {
      analysisId,
      weights: SCORING_WEIGHTS,
      profile: rows.filter((m) => m.subjectType === 'PROFILE').map(toMatchItem)[0] ?? null,
      resumes,
      excluded: readExcluded(analysis.excludedResumes),
      // New uploads/reviews or archived resumes since this run: re-analyse to compare them.
      stale: compared.size !== now.size || [...now].some((id) => !compared.has(id)),
    };
  }

  async getRecommendation(userId: string, jobId: string): Promise<JobRecommendationResponse> {
    const { analysisId } = await this.currentAnalysisId(userId, jobId);
    const [recommendation, analysis] = await Promise.all([
      this.prisma.resumeRecommendation.findUnique({
        where: { analysisId },
        include: { matchAnalysis: true },
      }),
      this.prisma.jobAnalysis.findUniqueOrThrow({
        where: { id: analysisId },
        select: { excludedResumes: true },
      }),
    ]);
    if (recommendation)
      return { recommendation: toRecommendationItem(recommendation), reason: null };
    const excluded = readExcluded(analysis.excludedResumes);
    return {
      recommendation: null,
      reason:
        excluded.length > 0
          ? 'None of your active resumes could be compared yet. Review an uploaded resume, then analyse again.'
          : 'You have no active resumes to compare. Add a resume, then analyse again.',
    };
  }
}
