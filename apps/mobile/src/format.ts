import {
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
  type SmartApplyState,
} from '@job-assist/shared';
import type { Tone } from './theme';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '' : dateFormat.format(d);
}

/** "Today", "Yesterday", "3 days ago", else a date. */
export function relativeDay(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "boards.greenhouse.io" from a URL, for "Opens … in your browser". */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export const firstName = (fullName: string | null | undefined) =>
  fullName?.trim().split(/\s+/)[0] ?? '';

/** Tracker statuses: same colours as the web badges, plus what each one means. */
export const TRACKER_TONE: Record<ApplicationStatus, Tone> = {
  SAVED: 'neutral',
  PREPARING: 'neutral',
  APPLIED: 'primary',
  RECRUITER_SCREEN: 'primary',
  ASSESSMENT: 'warning',
  INTERVIEW: 'warning',
  TECHNICAL_INTERVIEW: 'warning',
  FINAL_INTERVIEW: 'warning',
  OFFER: 'success',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  NO_RESPONSE: 'neutral',
};

export const TRACKER_MEANING: Record<ApplicationStatus, string> = {
  SAVED: 'Saved for later; not applied yet.',
  PREPARING: 'Being prepared; not sent yet.',
  APPLIED: 'Sent to the employer.',
  RECRUITER_SCREEN: 'A recruiter is screening the application.',
  ASSESSMENT: 'An assessment or test is in progress.',
  INTERVIEW: 'Interviewing.',
  TECHNICAL_INTERVIEW: 'Technical interview stage.',
  FINAL_INTERVIEW: 'Final interview stage.',
  OFFER: 'You received an offer.',
  ACCEPTED: 'You accepted the offer.',
  REJECTED: 'The employer declined.',
  WITHDRAWN: 'You withdrew.',
  NO_RESPONSE: 'No response from the employer.',
};

export const trackerLabel = (s: ApplicationStatus) => APPLICATION_STATUS_LABELS[s];

/** Smart Apply progress: which step the state is on (null for failed or cancelled). */
export const SMART_STEPS = ['Prepare', 'Answer questions', 'Review', 'Submit', 'Done'];
export function smartStep(state: SmartApplyState): number | null {
  switch (state) {
    case 'DISCOVERED':
    case 'PREPARING':
      return 0;
    case 'NEEDS_USER_INPUT':
      return 1;
    case 'READY_FOR_REVIEW':
      return 2;
    case 'AWAITING_USER_SUBMISSION':
    case 'SUBMITTING':
      return 3;
    case 'SUBMITTED':
      return 4;
    default:
      return null;
  }
}
