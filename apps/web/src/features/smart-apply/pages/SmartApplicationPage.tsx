import {
  APPLICATION_URL_KIND_LABELS,
  CANCELLABLE_STATES,
  MATCH_SCORE_NAME,
  SMART_APPLY_STATE_LABELS,
  smartApplyDisplay,
  SUBMISSION_CONFIRMATION_LABELS,
  type SmartApplicationDetail,
} from '@job-assist/shared';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { EligibilityPanel } from '../components/EligibilityPanel';
import { QuestionAnswerForm } from '../components/QuestionAnswerForm';
import { SmartApplyStatusBadge } from '../components/SmartApplyStatusBadge';
import { useSmartApplication, useSmartApplyAction } from '../hooks/useSmartApply';
import { smartApplyApi } from '../services/smart-apply-api';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ANSWERABLE = ['NEEDS_USER_INPUT', 'READY_FOR_REVIEW', 'AWAITING_USER_SUBMISSION'];

export function SmartApplicationPage() {
  const { id = '' } = useParams();
  const query = useSmartApplication(id);
  if (query.isPending) return <LoadingState label="Loading application" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <SmartApplicationView application={query.data} />;
}

function SmartApplicationView({ application: a }: { application: SmartApplicationDetail }) {
  const display = smartApplyDisplay(a);
  const approve = useSmartApplyAction(() => smartApplyApi.approve(a.id));
  const resume = useSmartApplyAction(() => smartApplyApi.resume(a.id));
  const cancel = useSmartApplyAction(() => smartApplyApi.cancel(a.id));
  const handoff = useSmartApplyAction(() => smartApplyApi.handoff(a.id));
  // One key per page view: a double click or network retry can't submit twice.
  const [submitKey] = useState(() => `web-${crypto.randomUUID()}`);
  const submit = useSmartApplyAction(() => smartApplyApi.submit(a.id, submitKey));
  const error = approve.error ?? resume.error ?? cancel.error ?? handoff.error ?? submit.error;
  const busy = [approve, resume, cancel, handoff, submit].some((m) => m.isPending);

  return (
    <>
      <PageHeader
        title={a.job.title}
        subtitle={[a.job.companyName, a.job.location].filter(Boolean).join(' · ')}
        actions={
          <Link to="/smart-apply" className={buttonClasses('ghost', 'md')}>
            All applications
          </Link>
        }
      />
      <div className="mb-5 grid gap-3">
        <div
          role="status"
          aria-label="Application status"
          className="flex flex-wrap items-center gap-2"
        >
          <SmartApplyStatusBadge application={a} />
          <span className="text-sm text-muted">{display.hint}</span>
        </div>
        {a.failureReason ? <Alert>{a.failureReason}</Alert> : null}
        {a.uncertain ? (
          <Alert>
            We could not confirm whether the provider received this application. We are checking and
            will not resend it. If you know it was received, you can report it below.
          </Alert>
        ) : null}
        {error ? <Alert>{errorMessage(error)}</Alert> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid min-w-0 gap-5 lg:col-span-2">
          {a.questions.length > 0 ? (
            <Card aria-labelledby="questions-title">
              <CardHeader
                id="questions-title"
                title="Questions"
                description={
                  a.outstandingQuestions > 0
                    ? `${a.outstandingQuestions} required answer${a.outstandingQuestions === 1 ? '' : 's'} missing`
                    : 'All required questions answered'
                }
              />
              <div className="grid gap-3">
                {a.questions.map((q) =>
                  ANSWERABLE.includes(a.state) ? (
                    <QuestionAnswerForm
                      key={`${q.id}-${q.answer ?? ''}-${q.confirmed}`}
                      question={q}
                    />
                  ) : (
                    <div key={q.id} className="rounded-lg border border-border p-3 text-sm">
                      <p className="font-medium">{q.question}</p>
                      <p className="mt-1 whitespace-pre-wrap text-muted">{q.answer ?? '—'}</p>
                    </div>
                  ),
                )}
              </div>
            </Card>
          ) : null}

          <Card aria-labelledby="materials-title">
            <CardHeader
              id="materials-title"
              title="Prepared materials"
              description="AI-prepared — review before using"
            />
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-muted">Resume</dt>
                <dd>
                  <Link
                    to={`/resumes/${a.resume.resumeId}`}
                    className="text-primary hover:underline"
                  >
                    {a.resume.resumeName} v{a.resume.versionNumber}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Cover letter</dt>
                <dd>
                  {a.coverLetter ? (
                    <details>
                      <summary className="cursor-pointer">
                        Version {a.coverLetter.versionNumber} ({a.coverLetter.status.toLowerCase()})
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap">{a.coverLetter.text}</p>
                    </details>
                  ) : (
                    'Not prepared'
                  )}
                </dd>
              </div>
            </dl>
            <Link
              to={`/applications/${a.applicationId}/preparation`}
              className={`${buttonClasses('ghost', 'sm')} mt-3`}
            >
              Edit materials in Application preparation
            </Link>
          </Card>

          <Card aria-labelledby="history-title">
            <CardHeader id="history-title" title="History" />
            <ol aria-label="History" className="grid gap-2 text-sm">
              {a.history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{SMART_APPLY_STATE_LABELS[h.toState]}</span>
                  <span className="text-muted">
                    {' '}
                    · {dateTime.format(new Date(h.createdAt))} ·{' '}
                    {h.actor === 'USER' ? 'You' : 'System'}
                  </span>
                  {h.reason ? <p className="text-muted">{h.reason}</p> : null}
                </li>
              ))}
            </ol>
            {a.attempts.length > 0 ? (
              <ul aria-label="Submission attempts" className="mt-3 grid gap-1 text-sm">
                {a.attempts.map((t) => (
                  <li key={t.id}>
                    Attempt {t.attemptNumber}: {t.outcome.toLowerCase().replace(/_/g, ' ')}
                    {t.providerReference ? ` · reference ${t.providerReference}` : ''}
                    {t.message ? ` — ${t.message}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card aria-labelledby="next-title">
            <CardHeader id="next-title" title="Next step" />
            <div className="grid gap-3 text-sm">
              {a.matchScore !== null ? (
                <p>
                  {MATCH_SCORE_NAME}: <strong>{a.matchScore}%</strong>
                  {a.matchExplanation ? (
                    <span className="block text-muted">{a.matchExplanation}</span>
                  ) : null}
                </p>
              ) : null}
              {a.state === 'READY_FOR_REVIEW' && !a.approvedAt ? (
                <Button disabled={busy} onClick={() => approve.mutate(undefined)}>
                  Approve application
                </Button>
              ) : null}
              {a.state === 'READY_FOR_REVIEW' &&
              a.approvedAt &&
              a.eligibility.autoSubmitEligible ? (
                <>
                  <Button disabled={busy} onClick={() => submit.mutate(undefined)}>
                    Submit through the authorised integration
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => handoff.mutate(undefined)}>
                    I’ll submit on the official site instead
                  </Button>
                </>
              ) : null}
              {a.state === 'AWAITING_USER_SUBMISSION' || a.uncertain ? (
                <ReportSubmitted application={a} />
              ) : null}
              {a.state === 'FAILED' ? (
                <>
                  <Button disabled={busy} onClick={() => handoff.mutate(undefined)}>
                    Submit on the official site
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => resume.mutate(undefined)}
                  >
                    Prepare again
                  </Button>
                </>
              ) : null}
              {a.state === 'CANCELLED' ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => resume.mutate(undefined)}
                >
                  Prepare again
                </Button>
              ) : null}
              {a.state === 'SUBMITTED' ? (
                <p>
                  {a.confirmation ? SUBMISSION_CONFIRMATION_LABELS[a.confirmation] : ''}
                  {a.submittedAt ? ` on ${formatDate(a.submittedAt)}` : ''}
                  {a.confirmationReference ? ` · reference ${a.confirmationReference}` : ''}
                </p>
              ) : null}
              {CANCELLABLE_STATES.includes(a.state) ? (
                <Button variant="ghost" disabled={busy} onClick={() => cancel.mutate(undefined)}>
                  Cancel application
                </Button>
              ) : null}
            </div>
          </Card>
          <Card aria-labelledby="eligibility-card">
            <h2 id="eligibility-card" className="sr-only">
              Submission
            </h2>
            <EligibilityPanel eligibility={a.eligibility} />
          </Card>
        </div>
      </div>
    </>
  );
}

/** Handoff: open the official page, submit there, then report it (labelled as user-reported). */
function ReportSubmitted({ application: a }: { application: SmartApplicationDetail }) {
  const [confirmed, setConfirmed] = useState(false);
  const report = useSmartApplyAction(() => smartApplyApi.reportSubmitted(a.id, { confirm: true }));
  return (
    <div className="grid gap-2">
      {a.officialApplicationUrl ? (
        <>
          <a
            href={a.officialApplicationUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonClasses('primary', 'md')}
          >
            <ExternalLink className="size-4" aria-hidden />
            Open the official application page
          </a>
          {a.applicationUrlKind ? (
            <p className="text-xs text-muted">
              {APPLICATION_URL_KIND_LABELS[a.applicationUrlKind]}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-muted">
          No application link is known for this job; apply through the employer.
        </p>
      )}
      <Checkbox
        label="I submitted this application myself on the official site"
        checked={confirmed}
        onChange={(e) => setConfirmed(e.target.checked)}
      />
      <Button
        variant="secondary"
        disabled={!confirmed || report.isPending}
        onClick={() => report.mutate(undefined)}
      >
        Mark as submitted
      </Button>
      {report.error ? <Alert>{errorMessage(report.error)}</Alert> : null}
    </div>
  );
}
