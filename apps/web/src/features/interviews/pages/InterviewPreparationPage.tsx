import {
  type InterviewDifficulty,
  type InterviewFocus,
  type InterviewQuestionCount,
  type InterviewSessionType,
  MATCH_LEVEL_LABELS,
} from '@job-assist/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { InterviewHistoryList } from '../components/InterviewHistoryList';
import { InterviewSetup } from '../components/InterviewSetup';
import { interviewKeys, useApplicationInterviews, useInterviewFocus } from '../hooks/useInterviews';
import { interviewsApi } from '../services/interviews-api';

const PRACTICE_TYPE: Record<InterviewFocus, InterviewSessionType> = {
  MIXED: 'PREPARATION',
  TECHNICAL: 'TECHNICAL',
  BEHAVIORAL: 'BEHAVIORAL',
  HR: 'HR',
};

/** Interview preparation for one application: what to expect, then practice or a mock interview. */
export function InterviewPreparationPage() {
  const { applicationId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const focus = useInterviewFocus(applicationId);
  const sessions = useApplicationInterviews(applicationId);
  const [pendingMode, setPendingMode] = useState<'PRACTICE' | 'MOCK' | null>(null);
  const start = useMutation({
    mutationFn: async (v: {
      mode: 'PRACTICE' | 'MOCK';
      focus: InterviewFocus;
      difficulty: InterviewDifficulty;
      questionCount: InterviewQuestionCount;
    }) => {
      setPendingMode(v.mode);
      const type: InterviewSessionType =
        v.mode === 'MOCK' ? 'MOCK_INTERVIEW' : PRACTICE_TYPE[v.focus];
      const created = await interviewsApi.create(applicationId, {
        type,
        focus: v.focus,
        difficulty: v.difficulty,
        questionCount: v.questionCount,
      });
      await interviewsApi.generate(created.id);
      return interviewsApi.start(created.id);
    },
    onSuccess: (session) => {
      client.setQueryData(interviewKeys.session(session.id), session);
      void client.invalidateQueries({ queryKey: interviewKeys.all });
      void navigate(`/interviews/${session.id}`);
    },
    onSettled: () => setPendingMode(null),
  });

  if (focus.isPending) return <LoadingState label="Loading interview preparation" />;
  if (focus.isError) return <ErrorState error={focus.error} onRetry={() => void focus.refetch()} />;
  const f = focus.data;

  return (
    <>
      <PageHeader
        title="Interview preparation"
        subtitle={`${f.job.title} · ${f.job.companyName}`}
        actions={
          <Link to={`/applications/${applicationId}`} className={buttonClasses('secondary', 'md')}>
            Back to application
          </Link>
        }
      />
      <div className="grid gap-6">
        <Card aria-labelledby="interview-focus-heading">
          <CardHeader id="interview-focus-heading" title="Interview focus" />
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Resume</dt>
            <dd>
              {f.resume.resumeName} v{f.resume.versionNumber}
            </dd>
            <dt className="text-muted">Match</dt>
            <dd>
              {f.match ? (
                <>
                  {f.match.score}% <Badge>{MATCH_LEVEL_LABELS[f.match.level]}</Badge>
                </>
              ) : (
                'Analyse the job to personalise questions'
              )}
            </dd>
          </dl>
          {f.strengths.length ? (
            <div className="mb-3">
              <p className="text-sm font-medium">Be ready to talk about (shown in your resume)</p>
              <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Strengths to discuss">
                {f.strengths.map((s) => (
                  <li key={s}>
                    <Badge tone="success">{s}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {f.gaps.length ? (
            <div className="mb-3">
              <p className="text-sm font-medium">
                Likely questions where your resume shows less evidence
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Gaps">
                {f.gaps.map((s) => (
                  <li key={s}>
                    <Badge tone="warning">{s}</Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted">
                Prepare honest answers: what you know, related experience, and how you would learn.
              </p>
            </div>
          ) : null}
          {f.responsibilities.length ? (
            <div>
              <p className="text-sm font-medium">Role responsibilities</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                {f.responsibilities.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {!f.aiEnabled ? (
            <p className="mt-3 text-xs text-muted">
              AI isn’t configured on this server: questions come from the job and your resume, and
              feedback uses rule-based practice checks.
            </p>
          ) : null}
        </Card>

        <Card aria-labelledby="interview-setup-heading">
          <CardHeader id="interview-setup-heading" title="Practise" />
          <InterviewSetup
            busy={start.isPending}
            pendingMode={pendingMode}
            onStart={(v) => start.mutate(v)}
          />
          {start.error ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {errorMessage(start.error)}
            </p>
          ) : null}
        </Card>

        <Card aria-labelledby="interview-sessions-heading">
          <CardHeader
            id="interview-sessions-heading"
            title="Previous sessions for this application"
          />
          {sessions.data ? (
            <InterviewHistoryList sessions={sessions.data} showJob={false} />
          ) : (
            <LoadingState />
          )}
        </Card>
      </div>
    </>
  );
}
