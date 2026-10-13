import { EMPLOYMENT_TYPE_LABELS, MATCH_SCORE_NAME } from '@job-assist/shared';
import { Archive, ArchiveRestore, ExternalLink, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { Dialog } from '../../../shared/ui/Dialog';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { JobApplicationPanel } from '../../applications/components/JobApplicationPanel';
import { RecommendationContext } from '../../job-discovery/components/RecommendationContext';
import { SampleDataNotice } from '../../job-discovery/components/SampleDataNotice';
import { attributionForJob } from '../../job-discovery/components/source-attribution';
import { SourceAttribution } from '../../job-discovery/components/SourceAttribution';
import { useRecommendation } from '../../job-discovery/hooks/useDiscovery';
import { AnalysisStatus } from '../components/AnalysisStatus';
import { JobForm } from '../components/JobForm';
import { JobRequirements } from '../components/JobRequirements';
import { JobSummary } from '../components/JobSummary';
import { MatchEvidence } from '../components/MatchEvidence';
import { MatchScore } from '../components/MatchScore';
import { ResumeComparison } from '../components/ResumeComparison';
import { ResumeRecommendation } from '../components/ResumeRecommendation';
import {
  isAnalysing,
  useJob,
  useJobAction,
  useJobAnalysis,
  useJobMatches,
  useJobRecommendation,
} from '../hooks/useJobs';
import { jobsApi } from '../services/jobs-api';

export function JobDetailsPage() {
  const { jobId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Opened from a job alert recommendation: show why, and preselect its resume version.
  const fromRecommendation = useRecommendation(searchParams.get('recommendation'));
  const alertRecommendation =
    fromRecommendation.data?.job.id === jobId ? fromRecommendation.data : null;
  const job = useJob(jobId);
  const analysis = useJobAnalysis(job.data);
  const matches = useJobMatches(job.data);
  const recommendation = useJobRecommendation(job.data);
  const analyze = useJobAction(() => jobsApi.analyze(jobId));
  const toggleArchive = useJobAction(() =>
    job.data?.status === 'ARCHIVED' ? jobsApi.restore(jobId) : jobsApi.archive(jobId),
  );
  const remove = useJobAction(() => jobsApi.remove(jobId));
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  if (job.isPending) return <LoadingState label="Loading job" />;
  if (job.isError) return <ErrorState error={job.error} onRetry={() => void job.refetch()} />;
  const j = job.data;
  const archived = j.status === 'ARCHIVED';
  const running = isAnalysing(j.latestAnalysis?.status);
  const best = matches.data?.resumes[0] ?? null;

  return (
    <>
      <PageHeader
        title={j.title}
        subtitle={[j.companyName, j.location].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={analyze.isPending}
              disabled={running || archived}
              onClick={() => analyze.mutate(undefined)}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              {j.latestAnalysis ? 'Re-analyse' : 'Analyse'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={toggleArchive.isPending}
              onClick={() => toggleArchive.mutate(undefined)}
            >
              {archived ? (
                <ArchiveRestore className="size-3.5" aria-hidden />
              ) : (
                <Archive className="size-3.5" aria-hidden />
              )}
              {archived ? 'Restore' : 'Archive'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete
            </Button>
          </>
        }
      />

      {j.isSampleData ? (
        <div className="mb-5">
          <SampleDataNotice />
        </div>
      ) : null}
      {analyze.error || toggleArchive.error ? (
        <div className="mb-5">
          <Alert>{errorMessage(analyze.error ?? toggleArchive.error)}</Alert>
        </div>
      ) : null}
      <AnalysisStatus
        job={j}
        stale={matches.data?.stale ?? false}
        analyzing={analyze.isPending}
        onAnalyze={() => analyze.mutate(undefined)}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card aria-labelledby="match-heading">
            <CardHeader id="match-heading" title="Match overview" description={MATCH_SCORE_NAME} />
            {!j.currentAnalysisId ? (
              <p className="text-sm text-muted">
                Results appear here once the job has been analysed.
              </p>
            ) : matches.isPending ? (
              <LoadingState />
            ) : matches.isError ? (
              <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
            ) : best ? (
              <>
                <p className="mb-4 text-sm text-muted">
                  Best of your resumes:{' '}
                  <span className="font-medium text-fg">{best.resumeName}</span>. This compares the
                  posting with what your resume states; it is not a prediction of hiring or ATS
                  results.
                </p>
                <MatchScore
                  score={best.overallScore}
                  level={best.level}
                  scores={best.scores}
                  weights={matches.data.weights}
                />
              </>
            ) : (
              <p className="text-sm text-muted">
                No resume could be compared. See the career profile comparison below.
              </p>
            )}
          </Card>

          {j.currentAnalysisId && matches.data ? (
            <Card aria-labelledby="comparison-heading">
              <CardHeader
                id="comparison-heading"
                title="Resume comparison"
                description={`${matches.data.resumes.length} compared`}
              />
              {matches.data.resumes.length > 0 ? (
                <ResumeComparison
                  matches={matches.data.resumes}
                  recommendedVersionId={
                    recommendation.data?.recommendation?.resumeVersionId ?? null
                  }
                />
              ) : (
                <p className="text-sm text-muted">
                  You have no reviewed active resumes.{' '}
                  <Link to="/resumes" className="text-primary hover:underline">
                    Add or review a resume
                  </Link>
                  .
                </p>
              )}
              {matches.data.excluded.length > 0 ? (
                <div className="mt-4 border-t border-border pt-3 text-sm">
                  <p className="font-medium">Not compared</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                    {matches.data.excluded.map((e) => (
                      <li key={e.resumeId}>
                        <Link to={`/resumes/${e.resumeId}`} className="text-fg hover:underline">
                          {e.resumeName}
                        </Link>{' '}
                        — {e.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : null}

          {matches.data?.profile ? (
            <Card aria-labelledby="profile-heading">
              <CardHeader
                id="profile-heading"
                title="Your career profile"
                description={`${matches.data.profile.overallScore}% · how your whole profile compares`}
              />
              <MatchEvidence match={matches.data.profile} />
            </Card>
          ) : null}

          <Card aria-labelledby="overview-heading">
            <CardHeader
              id="overview-heading"
              title="Job overview"
              description={`Added ${formatDate(j.createdAt)}`}
            />
            <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Company</dt>
              <dd>{j.companyName}</dd>
              {j.location ? (
                <>
                  <dt className="text-muted">Location</dt>
                  <dd>{j.location}</dd>
                </>
              ) : null}
              {j.employmentType ? (
                <>
                  <dt className="text-muted">Employment</dt>
                  <dd>{EMPLOYMENT_TYPE_LABELS[j.employmentType]}</dd>
                </>
              ) : null}
              {j.source ? (
                <>
                  <dt className="text-muted">Source</dt>
                  <dd>{j.source}</dd>
                </>
              ) : null}
              {j.jobUrl ? (
                <>
                  <dt className="text-muted">Posting</dt>
                  <dd>
                    <a
                      href={j.jobUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open original <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                    {attributionForJob(j) ? (
                      <span className="ml-2">
                        <SourceAttribution attribution={attributionForJob(j)!} />
                      </span>
                    ) : null}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted">Status</dt>
              <dd>
                <Badge tone={archived ? 'neutral' : 'success'}>
                  {archived ? 'Archived' : 'Active'}
                </Badge>
              </dd>
            </dl>
            <button
              type="button"
              aria-expanded={showDescription}
              onClick={() => setShowDescription((v) => !v)}
              className="text-sm text-primary hover:underline"
            >
              {showDescription ? 'Hide description' : 'Show full description'}
            </button>
            {showDescription ? (
              <pre className="mt-3 max-h-[28rem] overflow-auto rounded-lg bg-surface-muted p-3 font-sans text-sm whitespace-pre-wrap">
                {j.description}
              </pre>
            ) : null}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {alertRecommendation ? (
            <Card aria-labelledby="why-heading">
              <CardHeader id="why-heading" title="Why this job was recommended" />
              <RecommendationContext recommendation={alertRecommendation} />
            </Card>
          ) : null}
          <Card aria-labelledby="application-heading">
            <CardHeader id="application-heading" title="Application" />
            <JobApplicationPanel
              job={j}
              matches={matches.data}
              preferredVersionId={alertRecommendation?.resume?.resumeVersionId ?? null}
            />
          </Card>
          {j.currentAnalysisId ? (
            <Card aria-labelledby="recommendation-heading">
              <CardHeader id="recommendation-heading" title="Recommended resume" />
              {recommendation.isPending || matches.isPending ? (
                <LoadingState />
              ) : recommendation.isError ? (
                <ErrorState
                  error={recommendation.error}
                  onRetry={() => void recommendation.refetch()}
                />
              ) : (
                <ResumeRecommendation
                  job={j}
                  recommendation={recommendation.data.recommendation}
                  reason={recommendation.data.reason}
                  matches={matches.data?.resumes ?? []}
                />
              )}
            </Card>
          ) : null}
          {j.currentAnalysisId ? (
            <Card aria-labelledby="analysis-heading">
              <CardHeader id="analysis-heading" title="Job analysis" />
              {analysis.isPending ? (
                <LoadingState />
              ) : analysis.isError ? (
                <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />
              ) : (
                <div className="grid gap-5">
                  <JobSummary analysis={analysis.data} />
                  <JobRequirements requirements={analysis.data.requirements} />
                </div>
              )}
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit job" size="lg">
        {editing ? (
          <JobForm
            initial={{
              title: j.title,
              companyName: j.companyName,
              description: j.description,
              jobUrl: j.jobUrl ?? '',
              location: j.location ?? '',
              employmentType: j.employmentType ?? '',
              source: j.source ?? '',
            }}
            onSubmit={async (request) => {
              await jobsApi.update(jobId, request);
              await job.refetch();
              setEditing(false);
            }}
            actions={({ submitting }) => (
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={submitting}>
                  Save changes
                </Button>
              </div>
            )}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${j.title}”?`}
        confirmLabel="Delete job"
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(undefined, { onSuccess: () => void navigate('/jobs', { replace: true }) })
        }
      >
        The job and its analyses are deleted permanently. Your resumes are not affected.
      </ConfirmDialog>
    </>
  );
}
