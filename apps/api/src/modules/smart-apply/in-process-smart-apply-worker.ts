import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppConfigService } from '../../config/config.module.js';
import { SmartApplyDispatcher } from './smart-apply-dispatcher.js';
import { SmartApplyService } from './smart-apply.service.js';

interface Task {
  kind: 'prepare' | 'submit';
  id: string;
  userId: string;
}

/**
 * In-process worker, following the job-discovery and analysis dispatchers (no Redis/queue):
 * - at most SMART_APPLY_MAX_CONCURRENT tasks run at once (global limit), and one user's
 *   tasks run one after another;
 * - a timer picks up due retries (exponential backoff) and reconciliations;
 * - after a restart, preparations resume and in-flight submissions are treated as
 *   ambiguous (reconciled with the provider, never resent blindly);
 * - on shutdown it stops taking work and waits for running tasks.
 * Limitation: work only progresses while the API process is running (a sleeping free-tier
 * host pauses it); state is in PostgreSQL, so nothing is lost or duplicated.
 */
@Injectable()
export class InProcessSmartApplyWorker
  extends SmartApplyDispatcher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('SmartApplyWorker');
  private readonly queue: Task[] = [];
  private readonly running = new Set<Promise<void>>();
  private readonly busyUsers = new Set<string>();
  private readonly maxConcurrent: number;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;
  private stopping = false;
  /** Counters since start, logged and available for diagnostics. */
  readonly metrics = { prepared: 0, attempts: 0, retried: 0, reconciled: 0, errors: 0 };

  constructor(
    private readonly moduleRef: ModuleRef,
    config: AppConfigService,
  ) {
    super();
    this.maxConcurrent = config.get('SMART_APPLY_MAX_CONCURRENT', { infer: true });
    this.intervalMs = config.get('SMART_APPLY_WORKER_INTERVAL_SECONDS', { infer: true }) * 1000;
  }

  private get service(): SmartApplyService {
    return this.moduleRef.get(SmartApplyService, { strict: false });
  }

  prepare(smartApplicationId: string, userId: string): void {
    this.enqueue({ kind: 'prepare', id: smartApplicationId, userId });
  }

  submit(attemptId: string, userId: string): void {
    this.enqueue({ kind: 'submit', id: attemptId, userId });
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.running.size > 0) {
      if (this.running.size > 0) await Promise.allSettled([...this.running]);
      else this.pump();
    }
  }

  /** Runs due retries/reconciliations now (the timer calls this; tests may too). */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking || this.stopping) return;
    this.ticking = true;
    try {
      const { retried, reconciled } = await this.service.processDue(now);
      this.metrics.retried += retried;
      this.metrics.reconciled += reconciled;
      if (retried + reconciled > 0)
        this.logger.log(
          { due: { retried, reconciled }, totals: this.metrics },
          'Smart Apply due work',
        );
    } catch (error) {
      this.metrics.errors++;
      this.logger.error({ err: error }, 'Smart Apply tick failed');
    } finally {
      this.ticking = false;
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.service.recoverAfterRestart();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    this.queue.length = 0; // queued work resumes from the database after restart
    await Promise.allSettled([...this.running]);
  }

  private enqueue(task: Task): void {
    if (this.stopping) return;
    if (this.queue.some((t) => t.kind === task.kind && t.id === task.id)) return;
    this.queue.push(task);
    this.pump();
  }

  private pump(): void {
    while (this.running.size < this.maxConcurrent) {
      const index = this.queue.findIndex((t) => !this.busyUsers.has(t.userId));
      if (index === -1) return;
      const [task] = this.queue.splice(index, 1);
      this.busyUsers.add(task!.userId);
      const run = new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => this.execute(task!))
        .catch((error: unknown) => {
          this.metrics.errors++;
          this.logger.error(
            { err: error, task: task!.kind, id: task!.id },
            'Smart Apply task crashed',
          );
        })
        .finally(() => {
          this.running.delete(run);
          this.busyUsers.delete(task!.userId);
          this.pump();
        });
      this.running.add(run);
    }
  }

  private async execute(task: Task): Promise<void> {
    if (task.kind === 'prepare') {
      await this.service.runPreparation(task.id);
      this.metrics.prepared++;
    } else {
      await this.service.runAttempt(task.id);
      this.metrics.attempts++;
    }
  }
}
