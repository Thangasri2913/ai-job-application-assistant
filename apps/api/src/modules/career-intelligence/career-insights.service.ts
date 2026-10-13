import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  CAREER_INSIGHTS_DISCLAIMER,
  type CareerInsightItem,
  type CareerInsightsResponse,
  type InsightEvidence,
} from '@job-assist/shared';
import type { RequestContext } from '../../common/decorators/request-context.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import { ANALYTICS_VERSION } from './analytics/report.js';
import { CareerInsightsDispatcher } from './career-insights-dispatcher.js';
import { CareerIntelligenceService } from './career-intelligence.service.js';
import { buildFacts, type Fact, factsFingerprint, type InsightDraft } from './insights/facts.js';
import { CareerInsightsAi, INSIGHTS_PROMPT_VERSION } from './insights/insights-ai.js';
import { ruleInsights } from './insights/rules.js';

/** Insights are regenerated when the data changes, and at the latest after this long. */
export const INSIGHTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A run still RUNNING after this long is treated as abandoned. */
const STALE_RUN_MS = 10 * 60 * 1000;
const FAILED = 'The insights could not be generated. Please try again.';

type RunRow = Prisma.CareerInsightRunGetPayload<object>;
type InsightRow = Prisma.CareerInsightGetPayload<object>;

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const toItem = (i: InsightRow): CareerInsightItem => ({
  id: i.id,
  category: i.category,
  title: i.title,
  explanation: i.explanation,
  evidence: Array.isArray(i.evidence) ? (i.evidence as unknown as InsightEvidence[]) : [],
  confidence: i.confidence,
  recommendedAction: i.recommendedAction,
  source: i.sourceType,
  generatedAt: i.generatedAt.toISOString(),
});

/**
 * Evidence-based career insights, stored as snapshots ("runs"). A run is generated in the
 * background when the user's analytics change (or on Refresh); page loads never call the AI.
 */
@Injectable()
export class CareerInsightsService {
  private readonly logger = new Logger(CareerInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly analytics: CareerIntelligenceService,
    private readonly ai: CareerInsightsAi,
    private readonly dispatcher: CareerInsightsDispatcher,
  ) {}

  /** The latest insights. Starts a background refresh when the data changed since the last run. */
  async get(userId: string): Promise<CareerInsightsResponse> {
    const report = await this.analytics.report(userId);
    const facts = buildFacts(report);
    const fingerprint = factsFingerprint(facts);
    const hasData = report.totals.tracked > 0 || report.totals.analysedTargetJobs > 0;
    let [latest, completed] = await this.latestRuns(userId);

    const now = Date.now();
    const expired = completed?.expiresAt ? completed.expiresAt.getTime() < now : false;
    // Each fingerprint is attempted once automatically (a failure isn't retried in a loop).
    const needsRun = hasData && (latest?.dataFingerprint !== fingerprint || expired);
    if (needsRun && !this.isActive(latest)) {
      await this.start(userId, 'AUTO').catch((error: unknown) => {
        if (!(error instanceof AppException)) throw error;
      });
      [latest, completed] = await this.latestRuns(userId);
    }

    const insights = completed
      ? await this.prisma.careerInsight.findMany({
          where: { runId: completed.id, userId },
          orderBy: { sortOrder: 'asc' },
        })
      : [];
    return {
      run: latest
        ? {
            id: latest.id,
            status: latest.status,
            source: latest.source,
            note: latest.note,
            error: latest.error,
            generatedAt: latest.generatedAt?.toISOString() ?? null,
            expiresAt: latest.expiresAt?.toISOString() ?? null,
            createdAt: latest.createdAt.toISOString(),
          }
        : null,
      insights: insights.map(toItem),
      stale: completed !== null && (completed.dataFingerprint !== fingerprint || expired),
      generating: this.isActive(latest),
      aiEnabled: this.ai.enabled,
      disclaimer: CAREER_INSIGHTS_DISCLAIMER,
    };
  }

  /** Manual "Refresh insights" (also regenerates unchanged data). 409 while one is running. */
  async refresh(userId: string, ctx: RequestContext): Promise<CareerInsightsResponse> {
    await this.start(userId, 'MANUAL', ctx.requestId);
    return this.get(userId);
  }

  private async start(userId: string, trigger: 'AUTO' | 'MANUAL', requestId?: string) {
    const report = await this.analytics.report(userId);
    const fingerprint = factsFingerprint(buildFacts(report));
    const run = await this.prisma.$transaction(async (tx) => {
      // Lock the user so two requests can't both start a run.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const active = await tx.careerInsightRun.findFirst({
        where: { userId, status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (this.isActive(active)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.INSIGHTS_IN_PROGRESS,
          'Your insights are already being generated.',
        );
      }
      if (active) {
        await tx.careerInsightRun.update({
          where: { id: active.id },
          data: { status: 'FAILED', error: 'The generation was interrupted.' },
        });
      }
      return tx.careerInsightRun.create({
        data: {
          userId,
          trigger,
          dataFingerprint: fingerprint,
          analyticsVersion: ANALYTICS_VERSION,
          applicationsAnalysed: report.totals.submitted,
        },
      });
    });
    await this.audit.record({
      action: AuditAction.CAREER_INSIGHTS_REQUESTED,
      userId,
      requestId,
      metadata: { runId: run.id, trigger },
    });
    this.dispatcher.dispatch(run.id);
    return run;
  }

  /** Background work for one run. Never throws: failures are stored on the run. */
  async process(runId: string): Promise<void> {
    const run = await this.prisma.careerInsightRun.findUnique({ where: { id: runId } });
    if (!run || run.status === 'COMPLETED' || run.status === 'FAILED') return;
    await this.prisma.careerInsightRun.update({
      where: { id: runId },
      data: { status: 'RUNNING' },
    });
    try {
      const report = await this.analytics.report(run.userId);
      const facts = buildFacts(report);
      let drafts: InsightDraft[] = ruleInsights(facts);
      let source: 'AI' | 'RULES' = 'RULES';
      let note: string | null = this.ai.enabled
        ? null
        : 'AI is not configured on this server: insights are rule-based.';
      const ai = await this.ai.generate(run.userId, facts);
      if (ai?.status === 'VALID') {
        drafts = ai.insights;
        source = 'AI';
        note =
          ai.dropped > 0
            ? `${ai.dropped} AI insight${ai.dropped === 1 ? ' was' : 's were'} discarded because ${ai.dropped === 1 ? 'it' : 'they'} didn’t match the evidence.`
            : null;
      } else if (ai) {
        note = `${ai.reason} Showing rule-based insights instead.`;
      }

      const generatedAt = new Date();
      const expiresAt = new Date(generatedAt.getTime() + INSIGHTS_TTL_MS);
      const byId = new Map(facts.map((f) => [f.id, f]));
      await this.prisma.$transaction(async (tx) => {
        await tx.careerInsight.deleteMany({ where: { runId } }); // idempotent if re-processed
        await tx.careerInsight.createMany({
          data: drafts.map((d, sortOrder) => ({
            userId: run.userId,
            runId,
            sortOrder,
            category: d.category,
            title: d.title,
            explanation: d.explanation,
            evidence: toJson(evidenceFor(d, byId)),
            evidenceRefs: d.factIds,
            confidence: d.confidence,
            recommendedAction: d.recommendedAction,
            sourceType: source,
            generatedAt,
            expiresAt,
          })),
        });
        await tx.careerInsightRun.update({
          where: { id: runId },
          data: {
            status: 'COMPLETED',
            source,
            provider: source === 'AI' ? this.ai.provider : null,
            model: source === 'AI' ? `${this.ai.model ?? ''} (${INSIGHTS_PROMPT_VERSION})` : null,
            note,
            dataFingerprint: factsFingerprint(facts),
            applicationsAnalysed: report.totals.submitted,
            generatedAt,
            expiresAt,
          },
        });
      });
      await this.audit.record({
        action: AuditAction.CAREER_INSIGHTS_GENERATED,
        userId: run.userId,
        metadata: { runId, source, insights: drafts.length },
      });
    } catch (error) {
      this.logger.error({ err: error, runId }, 'Career insight generation failed');
      await this.prisma.careerInsightRun
        .update({ where: { id: runId }, data: { status: 'FAILED', error: FAILED } })
        .catch((e: unknown) =>
          this.logger.error({ err: e, runId }, 'Could not record the failed insight run'),
        );
    }
  }

  private latestRuns(userId: string): Promise<[RunRow | null, RunRow | null]> {
    return Promise.all([
      this.prisma.careerInsightRun.findFirst({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.careerInsightRun.findFirst({
        where: { userId, status: 'COMPLETED' },
        orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
  }

  private isActive(run: RunRow | null): boolean {
    return (
      run !== null &&
      (run.status === 'PENDING' || run.status === 'RUNNING') &&
      Date.now() - run.updatedAt.getTime() < STALE_RUN_MS
    );
  }
}

/** The stored evidence: the computed fact statements the insight cites (never AI text). */
function evidenceFor(draft: InsightDraft, facts: Map<string, Fact>): InsightEvidence[] {
  return draft.factIds
    .map((id) => facts.get(id))
    .filter((f): f is Fact => f !== undefined)
    .map((f) => ({ factId: f.id, statement: f.statement, sampleSize: f.sampleSize }));
}
