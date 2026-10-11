import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { AppConfigService } from '../../config/config.module.js';
import { PrismaService } from '../../database/prisma.service.js';
import { JobDiscoveryService } from './job-discovery.service.js';
import { nextRunAt } from './pipeline/schedule.js';

const BATCH = 25;

/**
 * Starts due alerts in-process (no queue is configured; see ADR-0018). Each tick claims an
 * alert by moving its nextRunAt forward with a compare-and-set, so two instances or
 * overlapping ticks never start the same scheduled run twice.
 */
@Injectable()
export class JobAlertScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobAlertScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: JobDiscoveryService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('JOB_ALERT_SCHEDULER_ENABLED', { infer: true })) return;
    const seconds = this.config.get('JOB_ALERT_SCHEDULER_INTERVAL_SECONDS', { infer: true });
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Starts every active alert whose next run is due. Returns how many runs started. */
  async tick(now = new Date()): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    let started = 0;
    try {
      const due = await this.prisma.jobSearchAlert.findMany({
        where: { isActive: true, nextRunAt: { lte: now } },
        orderBy: { nextRunAt: 'asc' },
        take: BATCH,
      });
      for (const alert of due) {
        const next = nextRunAt(
          {
            type: alert.scheduleType,
            time: alert.scheduleTime,
            days: alert.scheduleDays,
            timezone: alert.timezone,
          },
          now,
        );
        const claimed = await this.prisma.jobSearchAlert.updateMany({
          where: { id: alert.id, isActive: true, nextRunAt: alert.nextRunAt },
          data: { nextRunAt: next },
        });
        if (claimed.count === 0) continue;
        try {
          if (await this.discovery.startRun(alert.userId, alert.id, 'SCHEDULED')) started++;
        } catch (error) {
          this.logger.error(
            { err: error, alertId: alert.id },
            'Could not start a scheduled search',
          );
        }
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Job alert scheduler tick failed');
    } finally {
      this.ticking = false;
    }
    return started;
  }
}
