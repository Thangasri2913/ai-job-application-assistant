import { smartApplyDisplay, type SmartApplicationSummary } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { Spinner } from '../../../shared/ui/Spinner';

/**
 * The application's status. Only a provider-confirmed submission is shown as success; a
 * user-reported one is labelled as such.
 */
export function SmartApplyStatusBadge({
  application,
}: {
  application: Pick<SmartApplicationSummary, 'state' | 'confirmation' | 'uncertain'>;
}) {
  const display = smartApplyDisplay(application);
  return (
    <Badge tone={display.tone}>
      {display.kind === 'PREPARING' || display.kind === 'SUBMITTING' ? (
        <Spinner className="mr-1 size-3" label="In progress" />
      ) : null}
      {display.label}
    </Badge>
  );
}
