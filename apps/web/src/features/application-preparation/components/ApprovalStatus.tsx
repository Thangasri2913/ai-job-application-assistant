import {
  type CoverLetterStatus,
  GENERATION_SOURCE_LABELS,
  type GenerationSource,
  type PreparationStatus,
  type QuestionStatus,
  type SuggestionStatus,
} from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const PREPARATION: Record<PreparationStatus, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  READY: { label: 'Needs your review', tone: 'warning' },
  REVIEWED: { label: 'Reviewed — ready to approve', tone: 'primary' },
  APPROVED: { label: 'Approved · application-ready', tone: 'success' },
};

const CONTENT: Record<
  CoverLetterStatus | QuestionStatus | SuggestionStatus,
  { label: string; tone: Tone }
> = {
  PENDING: { label: 'Awaiting review', tone: 'warning' },
  GENERATED: { label: 'Not reviewed yet', tone: 'warning' },
  EDITED: { label: 'User edited', tone: 'primary' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'neutral' },
  APPROVED: { label: 'User approved', tone: 'success' },
};

export function PreparationStatusBadge({ status }: { status: PreparationStatus }) {
  return <Badge tone={PREPARATION[status].tone}>{PREPARATION[status].label}</Badge>;
}

/** Where content came from and what the user did with it: generated → edited → approved. */
export function ContentStatus({
  source,
  status,
}: {
  source: GenerationSource | null;
  status: CoverLetterStatus | QuestionStatus | SuggestionStatus;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" aria-label="Content status">
      {source ? (
        <Badge tone={source === 'AI' ? 'primary' : 'neutral'}>
          {GENERATION_SOURCE_LABELS[source]}
        </Badge>
      ) : null}
      <Badge tone={CONTENT[status].tone}>{CONTENT[status].label}</Badge>
    </span>
  );
}
