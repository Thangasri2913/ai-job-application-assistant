import { type JobAlertItem, WEEKDAY_LABELS } from '@job-assist/shared';

/** "Every day at 08:00 (Asia/Kolkata)". */
export function scheduleSummary(alert: JobAlertItem): string {
  const { type, time, days, timezone } = alert.schedule;
  const dayList = days.map((d) => WEEKDAY_LABELS[d]).join(', ');
  const when = type === 'DAILY' ? 'Every day' : type === 'WEEKLY' ? `Every ${dayList}` : dayList;
  return `${when} at ${time} (${timezone})`;
}

/** The browser's IANA time zone: the default for a new alert's schedule. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
