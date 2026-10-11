import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { ResumeParsingService } from './resume-parsing.service.js';

/**
 * Schedules resume parsing outside the request. Callers only see this abstraction, so it
 * can be replaced by a BullMQ-backed implementation (ADR-0005) without touching them.
 */
export abstract class ParsingDispatcher {
  abstract dispatch(versionId: string): void;
  /** Resolves when all currently scheduled work has finished (tests, shutdown). */
  abstract drain(): Promise<void>;
}

/**
 * In-process implementation: runs parsing on the event loop after the response is sent.
 * Status lives in the database (PENDING → PROCESSING → COMPLETED/FAILED), and work left
 * unfinished by a restart is re-queued at startup.
 */
@Injectable()
export class InProcessParsingDispatcher
  extends ParsingDispatcher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InProcessParsingDispatcher.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly parsing: ResumeParsingService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  dispatch(versionId: string): void {
    const job = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.parsing.process(versionId))
      .catch((error: unknown) =>
        this.logger.error({ err: error, versionId }, 'Parsing job crashed'),
      )
      .finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }

  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  async onApplicationBootstrap(): Promise<void> {
    // A crash/restart may leave versions mid-parse; put them back in the queue.
    await this.prisma.resumeVersion.updateMany({
      where: { parseStatus: 'PROCESSING' },
      data: { parseStatus: 'PENDING' },
    });
    const pending = await this.prisma.resumeVersion.findMany({
      where: { parseStatus: 'PENDING' },
      select: { id: true },
    });
    if (pending.length > 0)
      this.logger.log(`Re-queuing ${pending.length} pending resume parse job(s)`);
    for (const { id } of pending) this.dispatch(id);
  }

  async onModuleDestroy(): Promise<void> {
    await this.drain();
  }
}
