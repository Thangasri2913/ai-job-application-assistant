import {
  type ApplicationPreparationDetail,
  MATCH_LEVEL_LABELS,
  MATCH_SCORE_NAME,
} from '@job-assist/shared';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { usePreparationAction } from '../hooks/usePreparation';
import { preparationApi } from '../services/preparation-api';
import { PreparationStatusBadge } from './ApprovalStatus';

/** Job, the exact resume version being prepared, the match, and the explicit approval step. */
export function PreparationHeader({ prep }: { prep: ApplicationPreparationDetail }) {
  const approve = usePreparationAction(prep.applicationId, () =>
    preparationApi.approve(prep.applicationId),
  );
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card aria-labelledby="prep-resume-heading">
        <CardHeader id="prep-resume-heading" title="Selected resume" />
        <p className="font-semibold">
          <Link
            to={`/resumes/${prep.resume.resumeId}`}
            className="hover:text-primary hover:underline"
          >
            {prep.resume.resumeName}
          </Link>{' '}
          <span className="font-normal text-muted">v{prep.resume.versionNumber}</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          The exact version used for this application. It is never modified: accepted suggestions go
          into a separate tailored draft.
        </p>
      </Card>
      <Card aria-labelledby="prep-match-heading">
        <CardHeader id="prep-match-heading" title="Match summary" />
        {prep.match ? (
          <>
            <p className="flex items-center gap-2">
              <span className="text-2xl font-semibold tabular-nums">{prep.match.score}%</span>
              <Badge>{MATCH_LEVEL_LABELS[prep.match.level]}</Badge>
            </p>
            <p className="text-xs text-muted">{MATCH_SCORE_NAME} of this version</p>
            {prep.match.gaps.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
                {prep.match.gaps.slice(0, 3).map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">
            The job hasn’t been analysed yet.{' '}
            <Link to={`/jobs/${prep.job.id}`} className="text-primary hover:underline">
              Analyse it
            </Link>{' '}
            to prepare this application.
          </p>
        )}
      </Card>
      <Card aria-labelledby="prep-status-heading">
        <CardHeader id="prep-status-heading" title="Status" />
        <PreparationStatusBadge status={prep.status} />
        {prep.blockers.length > 0 ? (
          <ul
            className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted"
            aria-label="Still to review"
          >
            {prep.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        {prep.status === 'REVIEWED' ? (
          <Button
            size="sm"
            className="mt-3"
            loading={approve.isPending}
            onClick={() => approve.mutate(undefined)}
          >
            Approve as application-ready
          </Button>
        ) : null}
        {approve.error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {errorMessage(approve.error)}
          </p>
        ) : null}
        {!prep.aiEnabled ? (
          <p className="mt-3 text-xs text-muted">
            AI isn’t configured on this server: drafts are built only from your verified data.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
