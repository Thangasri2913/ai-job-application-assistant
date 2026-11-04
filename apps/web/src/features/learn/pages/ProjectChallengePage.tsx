import { LEARNING_DIFFICULTY_LABELS, type ProjectStatus } from '@job-assist/shared';
import { PROJECT_STATUS_LABELS } from '../format';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { BackLink, NotFound, TextList } from '../components/LearnCommon';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { useProjectChallenge, useUpdateProjectProgress } from '../hooks/useLearn';

export function ProjectChallengePage() {
  const { challengeId = '' } = useParams();
  const query = useProjectChallenge(challengeId);
  const update = useUpdateProjectProgress(challengeId);
  // Local edits until saved; null means "use what the server has".
  const [checked, setChecked] = useState<string[] | null>(null);
  const [saved, setSaved] = useState('');

  const back = <BackLink to="/learn/projects" label="All projects" />;
  if (query.isPending) return <LoadingState label="Loading project" />;
  if (query.isError)
    return (
      <>
        {back}
        {query.error instanceof ApiError && query.error.status === 404 ? (
          <NotFound what="Project challenge" />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </>
    );

  const c = query.data;
  const ticked = checked ?? c.progress.checkedItemIds;
  const acceptanceDone = c.acceptanceCriteria.filter((a) => ticked.includes(a.id)).length;
  const allAccepted = acceptanceDone === c.acceptanceCriteria.length;
  const dirty = checked !== null;

  const save = (status: ProjectStatus) => {
    if (update.isPending) return;
    update.mutate(
      { status, checkedItemIds: ticked },
      {
        onSuccess: (detail) => {
          setChecked(null);
          setSaved(
            detail.progress.status === 'COMPLETED'
              ? 'Saved. Project marked complete (self-reported).'
              : detail.progress.status === 'IN_PROGRESS'
                ? 'Progress saved.'
                : 'Project reset to not started.',
          );
        },
      },
    );
  };
  const toggle = (id: string, on: boolean) => {
    setSaved('');
    setChecked(on ? [...new Set([...ticked, id])] : ticked.filter((x) => x !== id));
  };
  const nextStatus: ProjectStatus = c.progress.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';

  return (
    <div className="max-w-3xl">
      {back}
      <PageHeader title={c.title} subtitle={c.summary} />
      <div className="mb-6 flex flex-wrap gap-1.5">
        <Badge>{LEARNING_DIFFICULTY_LABELS[c.difficulty]}</Badge>
        <Badge>About {c.estimatedHours} hours</Badge>
        <Badge
          tone={
            c.progress.status === 'COMPLETED'
              ? 'success'
              : c.progress.status === 'IN_PROGRESS'
                ? 'primary'
                : 'neutral'
          }
        >
          {PROJECT_STATUS_LABELS[c.progress.status]}
        </Badge>
        <ProvenanceBadge provenance={c.provenance} />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Objective" />
          <p className="text-sm">{c.objective}</p>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Expected outcome</h3>
          <p className="text-sm">{c.expectedOutcome}</p>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Before you start</h3>
          <TextList items={c.prerequisites} />
          <h3 className="mb-1 mt-4 text-sm font-semibold">Related courses</h3>
          <p className="text-sm">
            {c.courseIds.map((id, i) => (
              <span key={id}>
                {i > 0 ? ', ' : ''}
                <Link
                  to={`/learn/courses/${id}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {id.replace(/-/g, ' ')}
                </Link>
              </span>
            ))}
          </p>
        </Card>
        <Card>
          <CardHeader title="Requirements" />
          <TextList items={c.requirements} />
        </Card>
        <Card>
          <CardHeader title="Suggested steps" />
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {c.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader title="Test cases to try" />
          <TextList items={c.testCases} />
        </Card>

        <Card aria-labelledby="project-progress">
          <h2 id="project-progress" className="mb-1 text-base font-semibold">
            Your progress
          </h2>
          <p className="mb-3 text-sm text-muted">
            Tick what you have done. This is self-reported and saved to your account; it is not
            checked or verified by JobAssist.
            {c.progress.updatedAt ? ` Last saved ${formatDate(c.progress.updatedAt)}.` : ''}
          </p>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              Acceptance criteria ({acceptanceDone} of {c.acceptanceCriteria.length})
            </legend>
            <ProgressBar
              value={(acceptanceDone / c.acceptanceCriteria.length) * 100}
              label="Acceptance criteria ticked"
            />
            <ul className="mt-3 space-y-2">
              {c.acceptanceCriteria.map((a) => (
                <li key={a.id}>
                  <Checkbox
                    label={a.text}
                    checked={ticked.includes(a.id)}
                    onChange={(e) => toggle(a.id, e.target.checked)}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold">Self-review</legend>
            <ul className="space-y-2">
              {c.selfReview.map((a) => (
                <li key={a.id}>
                  <Checkbox
                    label={a.text}
                    checked={ticked.includes(a.id)}
                    onChange={(e) => toggle(a.id, e.target.checked)}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {c.progress.status === 'NOT_STARTED' && !dirty ? (
              <Button loading={update.isPending} onClick={() => save('IN_PROGRESS')}>
                Start this project
              </Button>
            ) : (
              <Button
                loading={update.isPending}
                disabled={!dirty}
                onClick={() => save(allAccepted ? nextStatus : 'IN_PROGRESS')}
              >
                Save progress
              </Button>
            )}
            {c.progress.status !== 'COMPLETED' ? (
              <Button
                variant="secondary"
                disabled={!allAccepted || update.isPending}
                aria-describedby="complete-hint"
                onClick={() => save('COMPLETED')}
              >
                Mark project complete
              </Button>
            ) : null}
            {c.progress.status !== 'NOT_STARTED' ? (
              <Button
                variant="ghost"
                disabled={update.isPending}
                onClick={() => save('NOT_STARTED')}
              >
                Reset
              </Button>
            ) : null}
          </div>
          {c.progress.status !== 'COMPLETED' ? (
            <p id="complete-hint" className="mt-2 text-xs text-muted">
              {allAccepted
                ? 'All acceptance criteria are ticked — you can mark the project complete.'
                : `Tick all ${c.acceptanceCriteria.length} acceptance criteria to mark the project complete.`}
            </p>
          ) : null}
          <p role="status" aria-live="polite" className="mt-2 text-sm text-success empty:hidden">
            {saved}
          </p>
          {update.isError ? (
            <div className="mt-2">
              <Alert>{errorMessage(update.error)}</Alert>
            </div>
          ) : null}
        </Card>

        {c.extensions.length ? (
          <Card>
            <CardHeader title="Optional extensions" />
            <TextList items={c.extensions} />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
