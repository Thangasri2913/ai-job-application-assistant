import type { JobAlertItem, JobSourceItem } from '@job-assist/shared';

/** A source whose most recent search failed (it is retried on the next run). */
export function isSourceFailing(s: JobSourceItem): boolean {
  if (!s.isEnabled || !s.lastFailureAt) return false;
  return !s.lastSuccessAt || s.lastFailureAt > s.lastSuccessAt;
}

/** Whether some job sources are temporarily unavailable right now. */
export function sourcesUnavailable(
  sources: JobSourceItem[] | undefined,
  alerts: JobAlertItem[] | undefined,
): boolean {
  if (sources?.some(isSourceFailing)) return true;
  return alerts?.some((a) => a.lastRun?.status === 'PARTIAL') ?? false;
}
