import { type ApplicationDetail, SUBMITTED_STATUSES } from '@job-assist/shared';
import { Archive, ArchiveRestore, ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { controlClasses } from '../../../shared/ui/field-styles';
import { formatDate, formatDay } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ApplicationDocuments } from '../components/ApplicationDocuments';
import { ApplicationNotes } from '../components/ApplicationNotes';
import { ApplicationStatusSelector } from '../components/ApplicationStatusSelector';
import { ApplicationTimeline } from '../components/ApplicationTimeline';
import {
  useApplication,
  useApplicationAction,
  useApplicationDocuments,
  useApplicationNotes,
  useApplicationTimeline,
} from '../hooks/useApplications';
import { applicationsApi } from '../services/applications-api';

const today = () => new Date().toISOString().slice(0, 10);

/** Recommended vs used: they can differ, and both are kept for later analysis. */
function ResumeUsed({ a }: { a: ApplicationDetail }) {
  const used = a.resumeUsed;
  const rec = a.recommendedAtCreation;
  const differs = rec?.resumeVersionId && rec.resumeVersionId !== used.resumeVersionId;
  return (
    <div className="grid gap-3 text-sm">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Resume used</p>
        <p className="text-base font-semibold">
          <Link to={`/resumes/${used.resumeId}`} className="hover:text-primary hover:underline">
            {used.resumeName}
          </Link>{' '}
          <span className="font-normal text-muted">Version {used.versionNumber}</span>
        </p>
        <p className="text-muted">Version created {formatDate(used.versionCreatedAt)}</p>
        <p className="mt-1">This exact version is stored with the application and never changes.</p>
        {used.newerVersionExists ? (
          <p className="mt-1 text-muted">
            <Badge tone="warning">Newer version exists</Badge> The resume has been updated since;
            this application still uses version {used.versionNumber}.
          </p>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted">AI recommended</dt>
        <dd>
          {rec?.resumeName
            ? `${rec.resumeName} v${rec.versionNumber}${rec.score !== null ? ` · ${rec.score}%` : ''}`
            : 'No recommendation when created'}
          {differs ? <span className="text-muted"> (you chose a different resume)</span> : null}
        </dd>
        <dt className="text-muted">Compatibility of resume used</dt>
        <dd>
          {a.matchScoreAtCreation !== null
            ? `${a.matchScoreAtCreation}% when created`
            : 'Not compared'}
        </dd>
      </dl>
    </div>
  );
}

function ImportantDates({ a }: { a: ApplicationDetail }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(a.appliedAt ?? today());
  const save = useApplicationAction(() => applicationsApi.update(a.id, { appliedAt: value }));
  const d = a.importantDates;
  const canEdit = !a.archivedAt && SUBMITTED_STATUSES.includes(a.status);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted">Created</dt>
      <dd>{formatDate(d.createdAt)}</dd>
      <dt className="text-muted">Applied</dt>
      <dd>
        {editing ? (
          <span className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Date applied"
              max={today()}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={controlClasses(false, 'h-8 w-auto')}
            />
            <Button
              size="sm"
              loading={save.isPending}
              onClick={() => save.mutate(undefined, { onSuccess: () => setEditing(false) })}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <>
            {d.appliedAt ? formatDay(d.appliedAt) : 'Not yet'}
            {canEdit ? (
              <button
                type="button"
                className="ml-2 text-primary hover:underline"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            ) : null}
          </>
        )}
        {save.error ? <span className="block text-danger">{errorMessage(save.error)}</span> : null}
      </dd>
      {d.firstInterviewAt ? (
        <>
          <dt className="text-muted">First interview stage</dt>
          <dd>{formatDate(d.firstInterviewAt)}</dd>
        </>
      ) : null}
      {d.offerAt ? (
        <>
          <dt className="text-muted">Offer</dt>
          <dd>{formatDate(d.offerAt)}</dd>
        </>
      ) : null}
      {d.closedAt ? (
        <>
          <dt className="text-muted">Closed</dt>
          <dd>{formatDate(d.closedAt)}</dd>
        </>
      ) : null}
      <dt className="text-muted">Last updated</dt>
      <dd>{formatDate(d.lastUpdatedAt)}</dd>
    </dl>
  );
}

export function ApplicationDetailsPage() {
  const { applicationId = '' } = useParams();
  const navigate = useNavigate();
  const application = useApplication(applicationId);
  const timeline = useApplicationTimeline(applicationId);
  const notes = useApplicationNotes(applicationId);
  const documents = useApplicationDocuments(applicationId);
  const toggleArchive = useApplicationAction(() =>
    application.data?.archivedAt
      ? applicationsApi.restore(applicationId)
      : applicationsApi.archive(applicationId),
  );
  const remove = useApplicationAction(() => applicationsApi.remove(applicationId));
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (application.isPending) return <LoadingState label="Loading application" />;
  if (application.isError)
    return <ErrorState error={application.error} onRetry={() => void application.refetch()} />;
  const a = application.data;

  return (
    <>
      <PageHeader
        title={a.jobTitle}
        subtitle={`${a.companyName}${a.source ? ` · via ${a.source}` : ''}`}
        actions={
          <>
            {!a.archivedAt ? (
              <Link
                to={`/applications/${a.id}/preparation`}
                className={buttonClasses('primary', 'sm')}
              >
                Prepare application
              </Link>
            ) : null}
            {!a.archivedAt ? (
              <Link
                to={`/applications/${a.id}/interviews`}
                className={buttonClasses('secondary', 'sm')}
              >
                Interview preparation
              </Link>
            ) : null}
            {a.applicationUrl ? (
              <a
                href={a.applicationUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-muted"
              >
                Application page <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              loading={toggleArchive.isPending}
              onClick={() => toggleArchive.mutate(undefined)}
            >
              {a.archivedAt ? (
                <ArchiveRestore className="size-3.5" aria-hidden />
              ) : (
                <Archive className="size-3.5" aria-hidden />
              )}
              {a.archivedAt ? 'Restore' : 'Archive'}
            </Button>
            {a.archivedAt ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete permanently
              </Button>
            ) : null}
          </>
        }
      />
      {a.archivedAt ? (
        <div className="mb-5">
          <Alert tone="success">
            Archived on {formatDate(a.archivedAt)}. Its history is kept; restore it to make changes.
          </Alert>
        </div>
      ) : null}
      {toggleArchive.error ? (
        <div className="mb-5">
          <Alert>{errorMessage(toggleArchive.error)}</Alert>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card aria-labelledby="resume-heading">
            <CardHeader id="resume-heading" title="Resume" />
            <ResumeUsed a={a} />
          </Card>
          <Card aria-labelledby="timeline-heading">
            <CardHeader id="timeline-heading" title="Timeline" />
            {timeline.isPending ? (
              <LoadingState />
            ) : timeline.isError ? (
              <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />
            ) : (
              <ApplicationTimeline events={timeline.data} />
            )}
          </Card>
          <Card aria-labelledby="notes-heading">
            <CardHeader id="notes-heading" title="Notes" />
            {notes.isPending ? (
              <LoadingState />
            ) : notes.isError ? (
              <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />
            ) : (
              <ApplicationNotes applicationId={a.id} notes={notes.data} />
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="status-heading">
            <CardHeader id="status-heading" title="Status" />
            <ApplicationStatusSelector application={a} />
            {a.rejectionReason ? (
              <p className="mt-3 text-sm text-muted">Rejection reason: {a.rejectionReason}</p>
            ) : null}
          </Card>
          <Card aria-labelledby="job-heading">
            <CardHeader id="job-heading" title="Job" />
            <p className="text-sm">
              <Link
                to={`/jobs/${a.job.id}`}
                className="font-medium hover:text-primary hover:underline"
              >
                {a.job.title}
              </Link>
            </p>
            <p className="text-sm text-muted">
              {[a.job.companyName, a.job.location].filter(Boolean).join(' · ')}
            </p>
            {a.job.jobUrl ? (
              <a
                href={a.job.jobUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Original posting <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </Card>
          <Card aria-labelledby="dates-heading">
            <CardHeader id="dates-heading" title="Important dates" />
            <ImportantDates key={a.appliedAt ?? 'none'} a={a} />
          </Card>
          <Card aria-labelledby="documents-heading">
            <CardHeader id="documents-heading" title="Documents" />
            {documents.isPending ? (
              <LoadingState />
            ) : documents.isError ? (
              <ErrorState error={documents.error} onRetry={() => void documents.refetch()} />
            ) : (
              <ApplicationDocuments application={a} documents={documents.data} />
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this application permanently?"
        confirmLabel="Delete application"
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => void navigate('/applications', { replace: true }),
          })
        }
      >
        Its status history, notes and documents are deleted. The job and your resumes are not
        affected.
      </ConfirmDialog>
    </>
  );
}
