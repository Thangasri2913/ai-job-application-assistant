import type { JobDetail, JobMatchesResponse } from '@job-assist/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { useResumeList } from '../../resumes/hooks/useResumes';
import { ApplicationStatusBadge } from './application-status';
import { CreateApplicationDialog } from './CreateApplicationDialog';
import type { ResumeVersionOption } from './ResumeVersionSelector';

/**
 * The job's application: what is being tracked, or a way to start tracking it. The product
 * records applications; it never submits them.
 */
export function JobApplicationPanel({
  job,
  matches,
  preferredVersionId,
}: {
  job: JobDetail;
  matches: JobMatchesResponse | undefined;
  /** Version recommended by a job alert; preselected over the analysis recommendation. */
  preferredVersionId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const resumes = useResumeList({ status: 'ACTIVE' });
  const recommendedId = preferredVersionId ?? job.recommendation?.resumeVersionId ?? null;

  const options = useMemo<ResumeVersionOption[]>(() => {
    const scores = new Map(
      (matches?.resumes ?? []).map((m) => [m.resumeVersionId, m.overallScore]),
    );
    return (resumes.data ?? [])
      .filter((r) => r.currentVersion)
      .map((r) => ({
        resumeVersionId: r.currentVersion!.id,
        resumeName: r.name,
        versionNumber: r.currentVersion!.versionNumber,
        score: scores.get(r.currentVersion!.id) ?? null,
        recommended: r.currentVersion!.id === recommendedId,
        isDefault: r.isDefault,
      }))
      .sort(
        (a, b) =>
          Number(b.recommended) - Number(a.recommended) ||
          (b.score ?? -1) - (a.score ?? -1) ||
          a.resumeName.localeCompare(b.resumeName),
      );
  }, [resumes.data, matches, recommendedId]);

  if (job.application) {
    return (
      <div className="grid gap-2 text-sm">
        <p className="flex items-center gap-2">
          <ApplicationStatusBadge status={job.application.status} />
          <span>
            {job.application.resumeName}{' '}
            <span className="text-muted">v{job.application.versionNumber}</span>
          </span>
        </p>
        <Link
          to={`/applications/${job.application.id}`}
          className={buttonClasses('secondary', 'sm')}
        >
          View application
        </Link>
      </div>
    );
  }

  const selectedId = job.selectedResume?.resumeVersionId;
  const initial =
    options.find((o) => o.recommended)?.resumeVersionId ??
    options.find((o) => o.resumeVersionId === selectedId)?.resumeVersionId ??
    options.find((o) => o.isDefault)?.resumeVersionId ??
    options[0]?.resumeVersionId ??
    '';

  return (
    <div className="grid gap-2 text-sm">
      <p className="text-muted">
        No application yet. Apply on the employer’s site, then track it here (or track it while you
        prepare).
      </p>
      {resumes.isPending ? (
        <LoadingState />
      ) : (
        <div>
          <Button size="sm" disabled={job.status === 'ARCHIVED'} onClick={() => setOpen(true)}>
            Track application
          </Button>
        </div>
      )}
      {open ? (
        <CreateApplicationDialog
          open={open}
          onClose={() => setOpen(false)}
          job={job}
          options={options}
          initialVersionId={initial}
        />
      ) : null}
    </div>
  );
}
