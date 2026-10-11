import { isValidTimeZone, nextRunAt, zonedTimeToUtc } from './schedule.js';

describe('alert schedules (time-zone aware)', () => {
  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
  });

  it('converts local wall-clock time to UTC', () => {
    expect(zonedTimeToUtc(2026, 10, 12, 8, 0, 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-12T02:30:00.000Z',
    );
    expect(zonedTimeToUtc(2026, 1, 15, 9, 0, 'America/New_York').toISOString()).toBe(
      '2026-01-15T14:00:00.000Z',
    );
    expect(zonedTimeToUtc(2026, 7, 15, 9, 0, 'America/New_York').toISOString()).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('runs daily at the local time, today if still ahead, otherwise tomorrow', () => {
    const daily = { type: 'DAILY' as const, time: '08:00', days: [], timezone: 'Asia/Kolkata' };
    // 07:00 IST → today 08:00 IST.
    expect(nextRunAt(daily, new Date('2026-10-11T01:30:00Z')).toISOString()).toBe(
      '2026-10-11T02:30:00.000Z',
    );
    // 08:30 IST → tomorrow.
    expect(nextRunAt(daily, new Date('2026-10-11T03:00:00Z')).toISOString()).toBe(
      '2026-10-12T02:30:00.000Z',
    );
    // Exactly at the run time → the next day (strictly after).
    expect(nextRunAt(daily, new Date('2026-10-11T02:30:00Z')).toISOString()).toBe(
      '2026-10-12T02:30:00.000Z',
    );
  });

  it('runs weekly / on custom days in the local calendar', () => {
    // 2026-10-11 is a Sunday.
    const weekly = { type: 'WEEKLY' as const, time: '09:30', days: [1], timezone: 'UTC' };
    expect(nextRunAt(weekly, new Date('2026-10-11T12:00:00Z')).toISOString()).toBe(
      '2026-10-12T09:30:00.000Z',
    );
    const custom = { type: 'CUSTOM' as const, time: '07:00', days: [3, 5], timezone: 'UTC' };
    expect(nextRunAt(custom, new Date('2026-10-14T08:00:00Z')).toISOString()).toBe(
      '2026-10-16T07:00:00.000Z',
    );
    // Local Monday 00:30 in Kolkata is still Sunday in UTC.
    const kolkataMonday = {
      type: 'WEEKLY' as const,
      time: '00:30',
      days: [1],
      timezone: 'Asia/Kolkata',
    };
    expect(nextRunAt(kolkataMonday, new Date('2026-10-11T12:00:00Z')).toISOString()).toBe(
      '2026-10-11T19:00:00.000Z',
    );
  });

  it('handles daylight-saving transitions', () => {
    // US DST starts 2026-03-08: 09:00 EST before, 09:00 EDT after.
    const ny = { type: 'DAILY' as const, time: '09:00', days: [], timezone: 'America/New_York' };
    expect(nextRunAt(ny, new Date('2026-03-07T15:00:00Z')).toISOString()).toBe(
      '2026-03-08T13:00:00.000Z',
    );
  });
});
