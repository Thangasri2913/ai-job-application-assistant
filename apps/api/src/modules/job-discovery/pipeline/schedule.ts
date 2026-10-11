import type { AlertScheduleType } from '@job-assist/shared';

export interface ScheduleSpec {
  type: AlertScheduleType;
  /** "HH:mm", local to `timezone`. */
  time: string;
  /** Weekdays (0 = Sunday) for WEEKLY/CUSTOM. */
  days: number[];
  timezone: string;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(date: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** Offset of `timezone` from UTC at `date`, in milliseconds (positive east of UTC). */
function offsetMs(date: Date, timezone: string): number {
  const p = zonedParts(date, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** The instant a local wall-clock time occurs in `timezone` (DST gaps resolve forward). */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMs(new Date(guess), timezone);
  let instant = guess - first;
  const second = offsetMs(new Date(instant), timezone);
  if (second !== first) instant = guess - second;
  return new Date(instant);
}

/** Weekdays the schedule runs on. */
export function scheduleDays(spec: ScheduleSpec): number[] {
  return spec.type === 'DAILY' ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(spec.days)].sort();
}

/** The first scheduled time strictly after `after`, interpreted in the schedule's time zone. */
export function nextRunAt(spec: ScheduleSpec, after: Date): Date {
  const days = scheduleDays(spec);
  const [hour, minute] = spec.time.split(':').map(Number) as [number, number];
  const local = zonedParts(after, spec.timezone);
  for (let i = 0; i <= 8; i++) {
    const date = new Date(Date.UTC(local.year, local.month - 1, local.day + i));
    if (!days.includes(date.getUTCDay())) continue;
    const candidate = zonedTimeToUtc(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      hour,
      minute,
      spec.timezone,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new Error('Schedule has no run days.');
}
