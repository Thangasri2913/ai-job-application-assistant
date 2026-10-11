import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const TONE: Record<ApplicationStatus, Tone> = {
  SAVED: 'neutral',
  PREPARING: 'neutral',
  APPLIED: 'primary',
  RECRUITER_SCREEN: 'primary',
  ASSESSMENT: 'warning',
  INTERVIEW: 'warning',
  FINAL_INTERVIEW: 'warning',
  OFFER: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  NO_RESPONSE: 'neutral',
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={TONE[status]}>{APPLICATION_STATUS_LABELS[status]}</Badge>;
}
