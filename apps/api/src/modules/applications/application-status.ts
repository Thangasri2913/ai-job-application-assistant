import {
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  type ApplicationStatus,
} from '@job-assist/shared';

/**
 * Statuses reachable from `current`: the forward moves in APPLICATION_TRANSITIONS plus the
 * immediately previous status (so a mistaken change can be corrected). A correction is a
 * new history entry; earlier entries are never rewritten.
 */
export function allowedNextStatuses(
  current: ApplicationStatus,
  previous: ApplicationStatus | null,
): ApplicationStatus[] {
  const allowed = new Set<ApplicationStatus>(APPLICATION_TRANSITIONS[current]);
  if (previous && previous !== current) allowed.add(previous);
  // Keep pipeline order for display.
  return APPLICATION_STATUSES.filter((s) => allowed.has(s));
}

const TODAY = () => new Date().toISOString().slice(0, 10);

/** `appliedAt` must be a real past (or today's) date. */
export function isValidAppliedDate(value: string, today: string = TODAY()): boolean {
  return value <= today;
}
