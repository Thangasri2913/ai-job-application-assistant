import type { AppConfigService } from '../../config/config.module.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { JobAlertScheduler } from './job-alert-scheduler.js';
import type { JobDiscoveryService } from './job-discovery.service.js';

const NOW = new Date('2026-10-12T03:00:00Z');

const alert = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  userId: `user-${id}`,
  isActive: true,
  scheduleType: 'DAILY',
  scheduleTime: '08:00',
  scheduleDays: [],
  timezone: 'Asia/Kolkata',
  nextRunAt: new Date('2026-10-12T02:30:00Z'),
  ...overrides,
});

function setup(
  options: {
    enabled?: boolean;
    due?: ReturnType<typeof alert>[];
    claim?: (id: string) => number;
  } = {},
) {
  const findMany = vi.fn().mockResolvedValue(options.due ?? []);
  const updateMany = vi.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve({ count: options.claim ? options.claim(where.id) : 1 }),
  );
  const startRun = vi.fn().mockResolvedValue({ id: 'run' });
  const prisma = { jobSearchAlert: { findMany, updateMany } } as unknown as PrismaService;
  const discovery = { startRun } as unknown as JobDiscoveryService;
  const config = {
    get: (key: string) => (key === 'JOB_ALERT_SCHEDULER_ENABLED' ? (options.enabled ?? true) : 60),
  } as unknown as AppConfigService;
  return {
    scheduler: new JobAlertScheduler(prisma, discovery, config),
    findMany,
    updateMany,
    startRun,
  };
}

describe('JobAlertScheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('does not run when disabled', async () => {
    vi.useFakeTimers();
    const { scheduler, findMany } = setup({ enabled: false });
    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(findMany).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('checks for due alerts at the configured interval', async () => {
    vi.useFakeTimers();
    const { scheduler, findMany } = setup();
    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(findMany).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, nextRunAt: { lte: expect.any(Date) } } }),
    );
    scheduler.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('claims a due alert by moving its next run forward, then starts a scheduled search', async () => {
    const { scheduler, updateMany, startRun } = setup({ due: [alert('a1')] });
    expect(await scheduler.tick(NOW)).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', isActive: true, nextRunAt: new Date('2026-10-12T02:30:00Z') },
      // Next 08:00 in Kolkata after 08:30 local is tomorrow 02:30 UTC.
      data: { nextRunAt: new Date('2026-10-13T02:30:00Z') },
    });
    expect(startRun).toHaveBeenCalledWith('user-a1', 'a1', 'SCHEDULED');
  });

  it('does not start a search when another tick or instance already claimed the alert', async () => {
    const { scheduler, startRun } = setup({ due: [alert('a1')], claim: () => 0 });
    expect(await scheduler.tick(NOW)).toBe(0);
    expect(startRun).not.toHaveBeenCalled();
  });

  it('ignores an overlapping tick', async () => {
    const { scheduler, findMany } = setup({ due: [alert('a1')] });
    const [first, second] = await Promise.all([scheduler.tick(NOW), scheduler.tick(NOW)]);
    expect([first, second].sort()).toEqual([0, 1]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('takes an alert with an invalid schedule off the schedule without blocking the others', async () => {
    const { scheduler, updateMany, startRun } = setup({
      due: [alert('bad', { timezone: 'Mars/Olympus_Mons' }), alert('good')],
    });
    expect(await scheduler.tick(NOW)).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'bad', nextRunAt: new Date('2026-10-12T02:30:00Z') },
      data: { nextRunAt: null },
    });
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun).toHaveBeenCalledWith('user-good', 'good', 'SCHEDULED');
  });

  it('continues with other alerts when starting one search fails', async () => {
    const { scheduler, startRun } = setup({ due: [alert('a1'), alert('a2')] });
    startRun.mockRejectedValueOnce(new Error('boom'));
    expect(await scheduler.tick(NOW)).toBe(1);
    expect(startRun).toHaveBeenCalledTimes(2);
  });
});
