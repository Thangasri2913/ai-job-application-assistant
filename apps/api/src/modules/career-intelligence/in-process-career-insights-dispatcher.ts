import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service.js';
import { CareerInsightsDispatcher } from './career-insights-dispatcher.js';
import { CareerInsightsService } from './career-insights.service.js';

/**
 * In-process implementation, like job analysis: status lives in the database, and runs left
 * unfinished by a restart are re-queued at startup (processing a run is idempotent).
 */
@Injectable()
export class InProcessCareerInsightsDispatcher
  extends CareerInsightsDispatcher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InProcessCareerInsightsDispatcher.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    // Resolved lazily: CareerInsightsService itself depends on this dispatcher.
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  private get insights(): CareerInsightsService {
    return this.moduleRef.get(CareerInsightsService, { strict: false });
  }

  dispatch(runId: string): void {
    const job = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.insights.process(runId))
      .catch((error: unknown) =>
        this.logger.error({ err: error, runId }, 'Career insight generation crashed'),
      )
      .finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }

  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.prisma.careerInsightRun.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'PENDING' },
    });
    const pending = await this.prisma.careerInsightRun.findMany({
      where: { status: 'PENDING' },
      select: { id: true },
    });
    if (pending.length > 0) this.logger.log(`Re-queuing ${pending.length} career insight run(s)`);
    for (const { id } of pending) this.dispatch(id);
  }

  async onModuleDestroy(): Promise<void> {
    await this.drain();
  }
}
