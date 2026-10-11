import { INTERVIEW_SESSION_TYPE_LABELS } from '@job-assist/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card } from '../../../shared/ui/Card';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { InterviewReportView } from '../components/InterviewReportView';
import { MockInterview } from '../components/MockInterview';
import { PracticeQuestion } from '../components/PracticeQuestion';
import {
  useCompleteInterview,
  useInterviewReport,
  useInterviewSession,
  useSessionAction,
} from '../hooks/useInterviews';
import { interviewsApi } from '../services/interviews-api';

export function InterviewSessionPage() {
  const { sessionId = '' } = useParams();
  const session = useInterviewSession(sessionId);
  const completed = session.data?.status === 'COMPLETED';
  const report = useInterviewReport(sessionId, completed);
  const generate = useSessionAction(sessionId, () => interviewsApi.generate(sessionId));
  const start = useSessionAction(sessionId, () => interviewsApi.start(sessionId));
  const complete = useCompleteInterview(sessionId);
  const [index, setIndex] = useState(0);

  if (session.isPending) return <LoadingState label="Loading interview" />;
  if (session.isError)
    return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;
  const s = session.data;
  const closed = s.status === 'COMPLETED' || s.status === 'ABANDONED';
  const q = s.questions[Math.min(index, s.questions.length - 1)];
  const answered = s.questions.filter((x) => x.answers.length > 0).length;

  return (
    <>
      <PageHeader
        title={INTERVIEW_SESSION_TYPE_LABELS[s.type]}
        subtitle={`${s.job.title} · ${s.job.companyName} · ${s.resume.resumeName} v${s.resume.versionNumber}`}
        actions={
          <Link
            to={`/applications/${s.applicationId}/interviews`}
            className={buttonClasses('secondary', 'md')}
          >
            Interview preparation
          </Link>
        }
      />
      {s.questionsNote ? <p className="mb-4 text-sm text-muted">{s.questionsNote}</p> : null}

      {s.questions.length === 0 ? (
        <Card>
          <p className="mb-3 text-sm">Questions haven’t been generated for this session yet.</p>
          <Button
            loading={generate.isPending}
            disabled={closed}
            onClick={() => generate.mutate(undefined)}
          >
            Generate questions
          </Button>
          {generate.isPending ? (
            <span className="ml-2 text-sm text-muted">Generating questions…</span>
          ) : null}
          {generate.error ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {errorMessage(generate.error)}
            </p>
          ) : null}
        </Card>
      ) : s.status === 'CREATED' ? (
        <Card>
          <p className="mb-3 text-sm">{s.questions.length} questions are ready.</p>
          <Button loading={start.isPending} onClick={() => start.mutate(undefined)}>
            {s.isMock ? 'Start mock interview' : 'Start preparation'}
          </Button>
        </Card>
      ) : s.isMock && !closed ? (
        <Card aria-label="Mock interview">
          <MockInterview session={s} />
        </Card>
      ) : (
        <div className="grid gap-6">
          {completed ? (
            report.data ? (
              <InterviewReportView report={report.data} />
            ) : (
              <LoadingState label="Loading report" />
            )
          ) : null}
          {s.status === 'ABANDONED' ? (
            <p className="text-sm text-muted">
              This session was abandoned. Start a new session to practise again.
            </p>
          ) : null}
          <Card aria-label="Questions">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                Question {index + 1} of {s.questions.length} · {answered} answered
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={index >= s.questions.length - 1}
                  onClick={() => setIndex((i) => i + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
            {q ? (
              <PracticeQuestion key={q.id} sessionId={s.id} question={q} closed={closed} />
            ) : null}
          </Card>
          {!closed ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={answered === 0}
                loading={complete.isPending}
                onClick={() => complete.mutate()}
              >
                Finish session
              </Button>
              {complete.isPending ? (
                <span className="text-sm text-muted">Generating final report…</span>
              ) : null}
              {complete.error ? (
                <p role="alert" className="text-sm text-danger">
                  {errorMessage(complete.error)}
                </p>
              ) : null}
            </div>
          ) : null}
          {completed ? <Badge tone="success">Completed — this session is read-only</Badge> : null}
        </div>
      )}
    </>
  );
}
