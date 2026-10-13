import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { JobSearchSourceResult, JobSearchStrategy } from '@job-assist/shared';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { analyzeJobText, isInsufficient } from '../jobs/analysis/job-analyzer.js';
import { JobAnalysisService } from '../jobs/analysis/job-analysis.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { scoreMatch } from '../jobs/matching/match-scorer.js';
import { subjectFromResume } from '../jobs/matching/match-subjects.js';
import { rankMatches } from '../jobs/matching/recommendation.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProfileService } from '../profile/profile.service.js';
import type { MatchCandidate } from '../resumes/resumes.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { findDuplicate } from './pipeline/dedup.js';
import {
  type AlertCriteria,
  type CriteriaResult,
  evaluateCriteria,
  type NormalizedPosting,
  normalizePosting,
} from './pipeline/normalize.js';
import { explainRecommendation, rankScore } from './pipeline/ranking.js';
import { buildSearchStrategy, type ProfileTerms } from './pipeline/search-strategy.js';
import { JobSearchDispatcher } from './job-search-dispatcher.js';
import { JobSourceError } from './sources/job-source-adapter.js';
import { type ActiveSource, JobSourceRegistry } from './sources/job-source-registry.js';

/** Postings requested from each source per run. */
export const RESULTS_PER_SOURCE = 50;
/** New jobs added (and fully analysed) per run; the rest wait for the next run. */
export const MAX_NEW_JOBS_PER_RUN = 15;
const SOURCE_TIMEOUT_MS = 20_000;
/** A RUNNING run older than this is considered abandoned. */
export const STALE_RUN_MS = 30 * 60 * 1000;

const NO_SOURCES =
  'No job sources are configured on this server, so alerts can’t find jobs yet. Development sample data is never used in production; a supported job source must be configured.';
const NO_RESUMES =
  'None of your active resumes could be compared. Add and review a resume to get recommendations.';
const SOURCE_FAILED =
  'The job source could not be reached. It will be tried again on the next run.';

type AlertRow = Prisma.JobSearchAlertGetPayload<object>;

interface Found {
  source: ActiveSource;
  posting: NormalizedPosting;
  criteria: CriteriaResult;
}

interface Counters {
  jobsDiscovered: number;
  jobsFound: number;
  jobsCreated: number;
  jobsSkipped: number;
  belowThreshold: number;
  recommendationsCreated: number;
  duplicates: number;
  jobsAnalyzed: number;
}

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * The discovery pipeline (ADR-0018). Run Now and the scheduler both call `startRun`; the
 * dispatcher then calls `processRun`:
 *
 * search sources → normalise → apply alert criteria → de-duplicate → screen with the job
 * analysis engine against every active resume → add jobs that pass the threshold and run
 * the full job analysis → recommend → one notification per run.
 *
 * Idempotent: postings are keyed by (user, source, external id), jobs by content hash,
 * recommendations by (user, job) and notifications by run, so a retried run never
 * duplicates anything.
 */
@Injectable()
export class JobDiscoveryService {
  private readonly logger = new Logger(JobDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: JobSourceRegistry,
    private readonly jobs: JobsService,
    private readonly analysis: JobAnalysisService,
    private readonly resumes: ResumesService,
    private readonly notifications: NotificationsService,
    private readonly dispatcher: JobSearchDispatcher,
    private readonly profile: ProfileService,
  ) {}

  /**
   * Creates a run for the alert and queues it. A manual run while one is in progress is a
   * 409; a scheduled one is skipped (null).
   */
  async startRun(
    userId: string,
    alertId: string,
    trigger: 'MANUAL' | 'SCHEDULED',
    requestId?: string,
  ): Promise<{ id: string } | null> {
    const run = await this.prisma.$transaction(async (tx) => {
      // Lock the alert so concurrent Run Now / scheduler calls can't both start a run.
      const [alert] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM job_search_alerts
        WHERE id = ${alertId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
      if (!alert)
        throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Job alert not found.');
      const running = await tx.jobSearchRun.findFirst({
        where: { alertId, status: 'RUNNING' },
        select: { id: true, startedAt: true },
      });
      if (running && Date.now() - running.startedAt.getTime() < STALE_RUN_MS) {
        if (trigger === 'SCHEDULED') return null;
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.JOB_SEARCH_IN_PROGRESS,
          'A search for this alert is already running.',
          undefined,
          { runId: running.id },
        );
      }
      if (running) {
        await tx.jobSearchRun.update({
          where: { id: running.id },
          data: {
            status: 'FAILED',
            errorMessage: 'The search was interrupted.',
            completedAt: new Date(),
          },
        });
      }
      return tx.jobSearchRun.create({
        data: { alertId, userId, trigger },
        select: { id: true },
      });
    });
    if (!run) return null;
    await this.audit.record({
      action: AuditAction.JOB_SEARCH_STARTED,
      userId,
      requestId,
      metadata: { alertId, runId: run.id, trigger },
    });
    this.dispatcher.dispatch(run.id, userId);
    return run;
  }

  /** Background work for one run. Never throws: failures are stored on the run. */
  async processRun(runId: string): Promise<void> {
    const run = await this.prisma.jobSearchRun.findUnique({
      where: { id: runId },
      include: { alert: true },
    });
    if (!run || run.status !== 'RUNNING') return;
    const { alert, userId } = run;
    const counters: Counters = {
      jobsDiscovered: 0,
      jobsFound: 0,
      jobsCreated: 0,
      jobsSkipped: 0,
      belowThreshold: 0,
      recommendationsCreated: 0,
      duplicates: 0,
      jobsAnalyzed: 0,
    };
    let sourceResults: JobSearchSourceResult[] = [];
    let strategy: JobSearchStrategy | null = null;
    try {
      const sources = await this.registry.active();
      this.logger.log(
        {
          runId,
          alertId: alert.id,
          trigger: run.trigger,
          sources: sources.map((s) => s.adapter.descriptor.key),
        },
        'Job search started',
      );
      if (sources.length === 0) {
        this.logger.warn(
          { runId, alertId: alert.id },
          'Job search failed: no job sources configured',
        );
        await this.finish(run.id, alert, 'FAILED', counters, [], { errorMessage: NO_SOURCES });
        return;
      }
      strategy = buildSearchStrategy(alert, await this.profileTerms(userId));
      const searched = await this.search(sources, strategy);
      sourceResults = searched.results;
      const found = searched.found;
      counters.jobsFound = found.length;
      counters.jobsDiscovered = sourceResults.reduce((n, r) => n + (r.returned ?? 0), 0);
      const failedSources = sourceResults.filter((r) => r.status === 'FAILED').length;
      const status =
        failedSources === 0 ? 'COMPLETED' : failedSources === sources.length ? 'FAILED' : 'PARTIAL';
      if (status === 'FAILED') {
        await this.finish(run.id, alert, 'FAILED', counters, sourceResults, {
          errorMessage: 'No job source could be searched. The alert will try again later.',
          strategy,
        });
        return;
      }

      const { candidates } = await this.resumes.listMatchCandidates(userId);
      if (candidates.length === 0) {
        counters.jobsSkipped = found.length;
        await this.finish(run.id, alert, status, counters, sourceResults, {
          note: NO_RESUMES,
          strategy,
        });
        return;
      }

      const note = await this.process(run.id, alert, found, candidates, counters);
      await this.finish(run.id, alert, status, counters, sourceResults, {
        note,
        errorMessage: status === 'PARTIAL' ? 'Some job sources could not be searched.' : null,
        strategy,
      });
    } catch (error) {
      this.logger.error({ err: error, runId }, 'Job search failed');
      await this.finish(run.id, alert, 'FAILED', counters, sourceResults, {
        errorMessage: 'The search could not be completed. Please try again.',
        strategy,
      }).catch((e: unknown) =>
        this.logger.error({ err: e, runId }, 'Could not record the failed search'),
      );
    }
  }

  /** The Career Profile terms a search strategy may use; null if the profile can't be read. */
  private async profileTerms(userId: string): Promise<ProfileTerms | null> {
    try {
      return await this.profile.getDetails(userId);
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'Career Profile unavailable for the search');
      return null;
    }
  }

  /**
   * Queries every source; one failing source never stops the others. Postings from
   * employers' own job boards come first, so when a job search service lists the same job
   * the employer's original posting is the one kept.
   */
  private async search(
    sources: ActiveSource[],
    strategy: JobSearchStrategy,
  ): Promise<{ found: Found[]; results: JobSearchSourceResult[] }> {
    const criteria: AlertCriteria = {
      keywords: strategy.keywords,
      locations: strategy.locations,
      remotePreference: strategy.remotePreference,
      employmentTypes: strategy.employmentTypes,
      experienceLevel: strategy.experienceLevel,
    };
    const found: Found[] = [];
    const results: JobSearchSourceResult[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      const d = source.adapter.descriptor;
      const result: JobSearchSourceResult = {
        sourceKey: d.key,
        sourceName: d.name,
        isDevelopment: d.isDevelopment,
        status: 'OK',
        returned: 0,
        found: 0,
        error: null,
      };
      try {
        const raws = await withTimeout((signal) =>
          source.adapter.searchJobs({ ...criteria, limit: RESULTS_PER_SOURCE }, signal),
        );
        result.returned = raws.length;
        for (const raw of raws.slice(0, RESULTS_PER_SOURCE)) {
          let posting: NormalizedPosting;
          try {
            posting = normalizePosting(source.adapter.normalizeJob(raw));
          } catch {
            continue; // An unusable posting is skipped, not fatal.
          }
          const key = `${source.id}|${posting.externalId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const check = evaluateCriteria(criteria, posting);
          if (!check.matches) continue;
          found.push({ source, posting, criteria: check });
          result.found++;
        }
        await this.registry.recordHealth(source.id, null);
        this.logger.log(
          { source: d.key, returned: raws.length, matchedCriteria: result.found },
          'Job source searched',
        );
      } catch (error) {
        const message = error instanceof JobSourceError ? error.message : SOURCE_FAILED;
        // Log the source and run context only: never credentials or raw provider output.
        this.logger.warn({ source: d.key, reason: message }, 'Job source search failed');
        result.status = 'FAILED';
        result.error = message;
        await this.registry.recordHealth(source.id, message);
      }
      results.push(result);
    }
    const order = (f: Found) => (f.source.adapter.descriptor.postingOrigin === 'EMPLOYER' ? 0 : 1);
    found.sort((a, b) => order(a) - order(b));
    return { found, results };
  }

  /** De-duplicate, screen, add, analyse and recommend. Returns a note for the run, if any. */
  private async process(
    runId: string,
    alert: AlertRow,
    found: Found[],
    candidates: MatchCandidate[],
    counters: Counters,
  ): Promise<string | null> {
    const userId = alert.userId;
    const now = new Date();
    const [known, userJobs, recommended] = await Promise.all([
      this.prisma.discoveredJob.findMany({
        where: {
          userId,
          OR: found.map((f) => ({ sourceId: f.source.id, externalId: f.posting.externalId })),
        },
      }),
      this.jobs.listForDuplicateCheck(userId),
      this.prisma.jobRecommendation.findMany({ where: { userId }, select: { jobId: true } }),
    ]);
    const knownByKey = new Map(known.map((k) => [`${k.sourceId}|${k.externalId}`, k]));
    const recommendedJobIds = new Set(recommended.map((r) => r.jobId));
    // Within a run, a posting listed by two sources is handled once.
    const handledJobIds = new Set<string>();
    // Names of job search services in this run, whose copies an employer posting replaces.
    const aggregators = new Set(
      found
        .map((f) => f.source.adapter.descriptor)
        .filter((d) => d.postingOrigin === 'AGGREGATOR')
        .map((d) => d.name),
    );
    let limitReached = false;

    for (const { source, posting, criteria } of found) {
      const existing = knownByKey.get(`${source.id}|${posting.externalId}`);
      const record = (data: {
        outcome: 'RECOMMENDED' | 'BELOW_THRESHOLD' | 'DUPLICATE' | 'ANALYSIS_FAILED';
        jobId?: string | null;
        screeningScore?: number | null;
      }) => this.recordDiscovery(userId, alert.id, source.id, posting, data);

      // Already recommended or matched to a job the user has (or deleted): nothing to do.
      if (existing && (existing.outcome === 'RECOMMENDED' || existing.outcome === 'DUPLICATE')) {
        await this.prisma.discoveredJob.update({
          where: { id: existing.id },
          data: { lastSeenAt: now },
        });
        if (existing.outcome === 'DUPLICATE') counters.duplicates++;
        counters.jobsSkipped++;
        continue;
      }

      let jobId = existing?.jobId ?? null;
      if (!jobId) {
        const duplicate = findDuplicate(
          {
            canonicalUrl: posting.canonicalUrl,
            dedupKey: posting.dedupKey,
            companyName: posting.companyName,
            title: posting.title,
            location: posting.location,
            description: posting.description,
          },
          userJobs,
        );
        if (duplicate) {
          const ownLeftover =
            duplicate.job.origin === 'DISCOVERED' &&
            !duplicate.job.inLibrary &&
            !recommendedJobIds.has(duplicate.job.id) &&
            !handledJobIds.has(duplicate.job.id);
          if (!ownLeftover) {
            // The user already has this job (added manually or recommended earlier).
            if (
              source.adapter.descriptor.postingOrigin === 'EMPLOYER' &&
              posting.sourceUrl &&
              duplicate.job.origin === 'DISCOVERED' &&
              duplicate.job.source !== null &&
              aggregators.has(duplicate.job.source)
            ) {
              // Prefer the employer's original posting over a job search service's copy.
              const upgraded = {
                jobUrl: posting.sourceUrl,
                source: source.adapter.descriptor.name,
              };
              await this.jobs.useOriginalPosting(userId, duplicate.job.id, upgraded);
              Object.assign(duplicate.job, upgraded);
            }
            await record({ outcome: 'DUPLICATE', jobId: duplicate.job.id });
            counters.duplicates++;
            counters.jobsSkipped++;
            continue;
          }
          // A job an interrupted run created but never finished: continue with it.
          jobId = duplicate.job.id;
        }
      }

      if (!jobId) {
        const screening = screen(posting, candidates, alert.resumeMode, now);
        if (screening === null || screening < alert.minimumMatchScore) {
          await record({ outcome: 'BELOW_THRESHOLD', screeningScore: screening });
          counters.belowThreshold++;
          counters.jobsSkipped++;
          continue;
        }
        if (counters.jobsCreated >= MAX_NEW_JOBS_PER_RUN) {
          limitReached = true; // Not recorded: the next run considers it again.
          counters.jobsSkipped++;
          continue;
        }
        const created = await this.jobs.createDiscovered(userId, {
          title: posting.title,
          companyName: posting.companyName,
          description: posting.description,
          jobUrl: posting.sourceUrl,
          location: posting.location,
          employmentType: posting.employmentType,
          source: source.adapter.descriptor.name,
          isSampleData: source.adapter.descriptor.isDevelopment,
        });
        jobId = created.id;
        if (created.created) {
          counters.jobsCreated++;
          userJobs.push({
            id: jobId,
            title: posting.title,
            companyName: posting.companyName,
            location: posting.location,
            jobUrl: posting.sourceUrl,
            normalizedDescription: posting.description,
            origin: 'DISCOVERED',
            inLibrary: false,
            currentAnalysisId: null,
            source: source.adapter.descriptor.name,
          });
        }
      }
      handledJobIds.add(jobId);

      // The full, stored analysis: same engine as a manually added job (plus AI if enabled).
      let summary = await this.analysis.getMatchSummary(userId, jobId);
      if (!summary) {
        try {
          await this.analysis.analyzeNow(userId, jobId);
        } catch (error) {
          if (!(error instanceof AppException)) throw error;
        }
        summary = await this.analysis.getMatchSummary(userId, jobId);
      }
      const chosen = summary
        ? alert.resumeMode === 'DEFAULT_RESUME'
          ? (summary.resumes.find((r) => r.isDefaultResume) ?? summary.resumes[0])
          : summary.resumes[0]
        : undefined;
      if (!summary || !chosen) {
        await record({ outcome: 'ANALYSIS_FAILED', jobId });
        counters.jobsSkipped++;
        continue;
      }
      counters.jobsAnalyzed++;
      if (chosen.score < alert.minimumMatchScore) {
        await record({ outcome: 'BELOW_THRESHOLD', jobId, screeningScore: chosen.score });
        counters.belowThreshold++;
        counters.jobsSkipped++;
        continue;
      }

      const discovered = await record({
        outcome: 'RECOMMENDED',
        jobId,
        screeningScore: chosen.score,
      });
      const explanation = explainRecommendation({
        matchScore: chosen.score,
        resumeName: chosen.resumeName,
        versionNumber: chosen.versionNumber,
        resumesCompared: summary.resumes.length,
        requiredMatched: chosen.requiredSkills.matched,
        requiredMissing: chosen.requiredSkills.missing,
        criteriaMatched: criteria.matched,
        postedAt: posting.postedAt,
        strengths: chosen.strengths,
        now,
      });
      const { count } = await this.prisma.jobRecommendation.createMany({
        data: [
          {
            userId,
            jobId,
            alertId: alert.id,
            runId,
            discoveredJobId: discovered.id,
            matchScore: chosen.score,
            recommendedResumeVersionId: chosen.resumeVersionId,
            resumeId: chosen.resumeId,
            resumeName: chosen.resumeName,
            versionNumber: chosen.versionNumber,
            rank: rankScore({
              matchScore: chosen.score,
              requiredCoverage: chosen.requiredSkills.coverage,
              skillScore: chosen.scores.skills,
              experienceScore: chosen.scores.experience,
              postedAt: posting.postedAt,
              criteriaFit: criteria.fit,
              now,
            }),
            reason: explanation.reason,
            reasons: explanation.reasons,
            gaps: chosen.gaps.slice(0, 5),
            requiredSkillsMatched: chosen.requiredSkills.matched,
            requiredSkillsMissing: chosen.requiredSkills.missing,
          },
        ],
        skipDuplicates: true,
      });
      if (count === 1) {
        counters.recommendationsCreated++;
        recommendedJobIds.add(jobId);
        await this.audit.record({
          action: AuditAction.JOB_RECOMMENDATION_CREATED,
          userId,
          metadata: { jobId, alertId: alert.id, runId, matchScore: chosen.score },
        });
      } else {
        counters.jobsSkipped++;
      }
    }
    return limitReached
      ? `Only ${MAX_NEW_JOBS_PER_RUN} new jobs are added per run; the rest will be considered next time.`
      : null;
  }

  private recordDiscovery(
    userId: string,
    alertId: string,
    sourceId: string,
    p: NormalizedPosting,
    data: {
      outcome: 'RECOMMENDED' | 'BELOW_THRESHOLD' | 'DUPLICATE' | 'ANALYSIS_FAILED';
      jobId?: string | null;
      screeningScore?: number | null;
    },
  ) {
    const fields = {
      sourceUrl: p.sourceUrl,
      canonicalUrl: p.canonicalUrl,
      dedupKey: p.dedupKey,
      title: p.title,
      companyName: p.companyName,
      location: p.location,
      workMode: p.workMode,
      postedAt: p.postedAt,
      discoveredFrom: p.discoveredFrom ?? null,
      outcome: data.outcome,
      jobId: data.jobId ?? null,
      screeningScore: data.screeningScore ?? null,
      lastSeenAt: new Date(),
    };
    return this.prisma.discoveredJob.upsert({
      where: {
        userId_sourceId_externalId: { userId, sourceId, externalId: p.externalId },
      },
      create: { userId, sourceId, externalId: p.externalId, alertId, ...fields },
      update: fields,
      select: { id: true },
    });
  }

  private async finish(
    runId: string,
    alert: AlertRow,
    status: 'COMPLETED' | 'FAILED' | 'PARTIAL',
    counters: Counters,
    sourceResults: JobSearchSourceResult[],
    extra: {
      errorMessage?: string | null;
      note?: string | null;
      strategy?: JobSearchStrategy | null;
    },
  ): Promise<void> {
    const completedAt = new Date();
    const updated = await this.prisma.jobSearchRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
      data: {
        status,
        ...counters,
        sourceResults: toJson(sourceResults),
        ...(extra.strategy ? { searchStrategy: toJson(extra.strategy) } : {}),
        errorMessage: extra.errorMessage ?? null,
        note: extra.note ?? null,
        completedAt,
      },
    });
    if (updated.count === 0) return; // Already finished (e.g. marked interrupted).
    this.logger.log({ runId, alertId: alert.id, status, ...counters }, 'Job search finished');
    const run = await this.prisma.jobSearchRun.findUniqueOrThrow({
      where: { id: runId },
      select: { trigger: true },
    });
    await this.prisma.jobSearchAlert.updateMany({
      where: { id: alert.id },
      data: { lastRunAt: completedAt },
    });
    await this.audit.record({
      action: AuditAction.JOB_SEARCH_FINISHED,
      userId: alert.userId,
      metadata: { alertId: alert.id, runId, status, ...counters },
    });

    // One notification per run, never one per job; the run id makes it idempotent.
    if (counters.recommendationsCreated > 0) {
      const n = counters.recommendationsCreated;
      await this.notifications.notify({
        userId: alert.userId,
        type: 'NEW_RECOMMENDATIONS',
        title: `${n} new job recommendation${n === 1 ? '' : 's'}`,
        body: `Your alert “${alert.name}” found ${n} job${n === 1 ? '' : 's'} matching at least ${alert.minimumMatchScore}%.`,
        link: `/recommendations?alertId=${alert.id}`,
        data: { alertId: alert.id, runId, count: n },
        dedupKey: `run:${runId}`,
      });
    } else if (status === 'FAILED' && run.trigger === 'SCHEDULED') {
      // At most one failure notice per alert per day.
      await this.notifications.notify({
        userId: alert.userId,
        type: 'ALERT_RUN_FAILED',
        title: 'A job alert could not run',
        body: `Your alert “${alert.name}” could not search for jobs. It will try again at its next scheduled time.`,
        link: `/job-alerts/${alert.id}/runs`,
        data: { alertId: alert.id, runId },
        dedupKey: `alert-failed:${alert.id}:${completedAt.toISOString().slice(0, 10)}`,
      });
    }
  }
}

/**
 * Screening score of a posting with the same analysis and scoring engine as a job the user
 * adds: the best of all active resumes, or the default resume. Null if the description has
 * nothing to compare.
 */
export function screen(
  posting: NormalizedPosting,
  candidates: MatchCandidate[],
  mode: 'BEST_MATCH' | 'DEFAULT_RESUME',
  now: Date,
): number | null {
  const analysis = analyzeJobText({ title: posting.title, description: posting.description });
  if (isInsufficient(analysis) || candidates.length === 0) return null;
  const job = {
    title: posting.title,
    requirements: analysis.requirements,
    keywords: analysis.keywords,
  };
  const ranked = rankMatches(
    candidates.map((c) => ({
      resumeVersionId: c.versionId,
      resumeName: c.resumeName,
      isDefault: c.isDefault,
      activatedAt: c.activatedAt,
      scored: scoreMatch(job, subjectFromResume(c.content, now)),
    })),
  );
  const chosen =
    mode === 'DEFAULT_RESUME' ? (ranked.find((r) => r.isDefault) ?? ranked[0]) : ranked[0];
  return chosen?.scored.overallScore ?? null;
}

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new JobSourceError('The job source did not respond in time.'));
        }, SOURCE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
