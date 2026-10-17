import type { ModuleRef } from '@nestjs/core';
import type { AppConfigService } from '../../config/config.module.js';
import { InProcessSmartApplyWorker } from './in-process-smart-apply-worker.js';
import type { SmartApplyService } from './smart-apply.service.js';

function setup(maxConcurrent: number) {
  let running = 0;
  let peak = 0;
  const order: string[] = [];
  const work = async (id: string) => {
    running++;
    peak = Math.max(peak, running);
    order.push(`start:${id}`);
    await new Promise((r) => setTimeout(r, 5));
    order.push(`end:${id}`);
    running--;
  };
  const service = {
    runPreparation: vi.fn(work),
    runAttempt: vi.fn(work),
    processDue: vi.fn().mockResolvedValue({ retried: 0, reconciled: 0 }),
    recoverAfterRestart: vi.fn().mockResolvedValue(undefined),
  };
  const moduleRef = { get: () => service } as unknown as ModuleRef;
  const config = {
    get: (key: string) => (key === 'SMART_APPLY_MAX_CONCURRENT' ? maxConcurrent : 30),
  } as unknown as AppConfigService;
  const worker = new InProcessSmartApplyWorker(moduleRef, config);
  return {
    worker,
    service: service as unknown as SmartApplyService & typeof service,
    order,
    peak: () => peak,
  };
}

describe('in-process Smart Apply worker', () => {
  it('respects the global concurrency limit and runs one user’s tasks one at a time', async () => {
    const { worker, order, peak } = setup(2);
    worker.prepare('a1', 'alice');
    worker.submit('a2', 'alice');
    worker.prepare('b1', 'bob');
    worker.prepare('c1', 'carol');
    await worker.drain();
    expect(peak()).toBe(2);
    // Alice's second task starts only after her first one ended.
    expect(order.indexOf('start:a2')).toBeGreaterThan(order.indexOf('end:a1'));
    expect(order.filter((o) => o.startsWith('end:'))).toHaveLength(4);
  });

  it('ignores a task already queued and stops taking work on shutdown', async () => {
    const { worker, service } = setup(1);
    worker.prepare('x', 'u1');
    worker.prepare('y', 'u1');
    worker.prepare('y', 'u1');
    await worker.drain();
    expect(service.runPreparation).toHaveBeenCalledTimes(2);
    await worker.onModuleDestroy();
    worker.prepare('z', 'u1');
    await worker.drain();
    expect(service.runPreparation).toHaveBeenCalledTimes(2);
  });

  it('recovers interrupted work on start and checks due work on each tick', async () => {
    const { worker, service } = setup(1);
    await worker.onApplicationBootstrap();
    expect(service.recoverAfterRestart).toHaveBeenCalled();
    await worker.tick(new Date('2026-10-13T00:00:00Z'));
    expect(service.processDue).toHaveBeenCalledWith(new Date('2026-10-13T00:00:00Z'));
    await worker.onModuleDestroy();
  });
});
