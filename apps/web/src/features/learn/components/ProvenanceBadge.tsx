import { CONTENT_ORIGIN_LABELS, type ContentProvenance } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { formatDate } from '../../../shared/ui/format';

/** Says who wrote a piece of content and whether a person has reviewed it. */
export function ProvenanceBadge({ provenance }: { provenance: ContentProvenance }) {
  const origin = CONTENT_ORIGIN_LABELS[provenance.origin];
  return provenance.review.status === 'REVIEWED' ? (
    <Badge tone="success">
      {origin} · Reviewed by {provenance.review.reviewedBy} on{' '}
      {formatDate(provenance.review.reviewedAt)}
    </Badge>
  ) : (
    <Badge tone="warning">{origin} · Not yet reviewed</Badge>
  );
}
