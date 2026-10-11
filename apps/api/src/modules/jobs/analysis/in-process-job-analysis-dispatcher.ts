import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../database/prisma.service.js';
import { JobAnalysisDispatcher } from './job-analysis-dispatcher.js';
import { JobAnalysisService } from './job-analysis.service.js';

/**
 * In-process implementation, like resume parsing: runs after the response is sent; status
 * lives in the database, and runs left unfinished by a restart are re-queued at startup.
 */
@Injectable()
export class InProcessJobAnalysisDispatcher
  extends JobAnalysisDispatcher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InProcessJobAnalysisDispatcher.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    // Resolved lazily: JobAnalysisService itself depends on this dispatcher.
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  private get analysis(): JobAnalysisService {
    return this.moduleRef.get(JobAnalysisService, { strict: false });
  }

  dispatch(analysisId: string): void {
    const job = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.analysis.process(analysisId))
      .catch((error: unknown) =>
        this.logger.error({ err: error, analysisId }, 'Job analysis crashed'),
      )
      .finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }

  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.prisma.jobAnalysis.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'PENDING' },
    });
    const pending = await this.prisma.jobAnalysis.findMany({
      where: { status: 'PENDING' },
      select: { id: true },
    });
    if (pending.length > 0)
      this.logger.log(`Re-queuing ${pending.length} pending job analysis run(s)`);
    for (const { id } of pending) this.dispatch(id);
  }

  async onModuleDestroy(): Promise<void> {
    await this.drain();
  }
}
