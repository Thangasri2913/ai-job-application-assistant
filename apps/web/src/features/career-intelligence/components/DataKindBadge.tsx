import { Badge } from '../../../shared/ui/Badge';

/** Labels a section as facts counted from the user's records, or as recommendations. */
export function DataKindBadge({ kind }: { kind: 'observed' | 'recommendation' }) {
  return kind === 'observed' ? (
    <Badge tone="neutral">Observed data</Badge>
  ) : (
    <Badge tone="primary">Recommendation</Badge>
  );
}
