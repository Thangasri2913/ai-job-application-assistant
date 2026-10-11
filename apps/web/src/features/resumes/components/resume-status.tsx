import type { ParseStatus, ResumeSummary, ResumeVersionSummary } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { isParsing } from '../hooks/useResumes';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

/** User-facing wording for a version's parsing state. */
const PARSE_STATUS_DISPLAY: Record<ParseStatus, { label: string; tone: Tone }> = {
  NOT_APPLICABLE: { label: 'No file to parse', tone: 'neutral' },
  PENDING: { label: 'Processing…', tone: 'primary' },
  PROCESSING: { label: 'Processing…', tone: 'primary' },
  NEEDS_REVIEW: { label: 'Review required', tone: 'warning' },
  COMPLETED: { label: 'Reviewed', tone: 'success' },
  FAILED: { label: 'Couldn’t read file', tone: 'danger' },
};

export function ParseStatusBadge({ status }: { status: ParseStatus }) {
  const { label, tone } = PARSE_STATUS_DISPLAY[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** What the user should know about the newest version, if it needs attention; otherwise "Ready". */
export function VersionAttention({ resume }: { resume: ResumeSummary }) {
  const latest = resume.latestVersion;
  if (!latest) return null;
  if (latest.status !== 'DRAFT')
    return resume.currentVersion ? <Badge tone="success">Ready</Badge> : null;
  if (
    isParsing(latest.parseStatus) ||
    latest.parseStatus === 'NEEDS_REVIEW' ||
    latest.parseStatus === 'FAILED'
  ) {
    return <ParseStatusBadge status={latest.parseStatus} />;
  }
  return <Badge tone="warning">Draft – not current</Badge>;
}

export function VersionStatusBadge({ version }: { version: ResumeVersionSummary }) {
  if (version.status === 'ACTIVE') return <Badge tone="success">Current</Badge>;
  if (version.status === 'DRAFT') return <Badge tone="warning">Draft</Badge>;
  return <Badge>Superseded</Badge>;
}

/**
 * Where a version's structured information came from: extracted from the file by the parser,
 * interpreted by AI (validated, still unconfirmed), and whether the user has confirmed it.
 */
export function ProvenanceBadges({ version }: { version: ResumeVersionSummary }) {
  const extracted =
    version.hasFile &&
    (version.parseStatus === 'NEEDS_REVIEW' || version.parseStatus === 'COMPLETED');
  return (
    <span className="inline-flex flex-wrap gap-1.5" aria-label="Information source">
      {version.source === 'PROFILE' ? <Badge>From your profile</Badge> : null}
      {extracted ? <Badge>Extracted from file</Badge> : null}
      {version.hasAiExtraction ? <Badge tone="primary">AI interpreted</Badge> : null}
      {version.contentConfirmedAt ? (
        <Badge tone="success">Confirmed by you</Badge>
      ) : extracted ? (
        <Badge tone="warning">Not confirmed yet</Badge>
      ) : null}
    </span>
  );
}
