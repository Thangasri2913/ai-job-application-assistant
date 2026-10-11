import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service.js';
import { JobDiscoveryService } from './job-discovery.service.js';
import { JobSearchDispatcher } from './job-search-dispatcher.js';

/**
 * In-process implementation, like job analysis. Runs for the same user execute one after
 * another (so two alerts never race on the same postings). Runs still RUNNING after a
 * restart are re-queued; the pipeline is idempotent, so resuming them is safe.
 */
@Injectable()
export class InProcessJobSearchDispatcher
  extends JobSearchDispatcher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InProcessJobSearchDispatcher.name);
  private readonly inFlight = new Set<Promise<void>>();
  private readonly perUser = new Map<string, Promise<void>>();

  constructor(
    // Resolved lazily: JobDiscoveryService itself depends on this dispatcher.
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  private get discovery(): JobDiscoveryService {
    return this.moduleRef.get(JobDiscoveryService, { strict: false });
  }

  dispatch(runId: string, userId: string): void {
    const previous = this.perUser.get(userId) ?? Promise.resolve();
    const job = previous
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => this.discovery.processRun(runId))
      .catch((error: unknown) => this.logger.error({ err: error, runId }, 'Job search crashed'))
      .finally(() => {
        this.inFlight.delete(job);
        if (this.perUser.get(userId) === job) this.perUser.delete(userId);
      });
    this.perUser.set(userId, job);
    this.inFlight.add(job);
  }

  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  async onApplicationBootstrap(): Promise<void> {
    const running = await this.prisma.jobSearchRun.findMany({
      where: { status: 'RUNNING' },
      select: { id: true, userId: true },
    });
    if (running.length > 0) this.logger.log(`Re-queuing ${running.length} job search run(s)`);
    for (const { id, userId } of running) this.dispatch(id, userId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.drain();
  }
}
