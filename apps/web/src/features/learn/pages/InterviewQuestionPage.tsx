import { INTERVIEW_ANSWER_MAX_LENGTH, LEARNING_DIFFICULTY_LABELS } from '@job-assist/shared';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { TextArea } from '../../../shared/ui/TextArea';
import { readInterviewDraft, writeInterviewDraft } from '../activity-session';
import { InterviewFeedbackPanel } from '../components/InterviewFeedbackPanel';
import { BackLink, NotFound } from '../components/LearnCommon';
import { useInterviewQuestion, useSubmitInterviewAnswer } from '../hooks/useLearn';

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export function InterviewQuestionPage() {
  const { questionId = '' } = useParams();
  const query = useInterviewQuestion(questionId);
  const submit = useSubmitInterviewAnswer(questionId);
  const [answer, setAnswer] = useState(() => readInterviewDraft(questionId));
  const [validation, setValidation] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const answerId = useId();
  const hintId = useId();

  // Keep an unsubmitted answer for this tab, so leaving the page does not discard it.
  useEffect(() => writeInterviewDraft(questionId, answer), [questionId, answer]);

  const back = <BackLink to="/learn/interview" label="All practice questions" />;
  if (query.isPending) return <LoadingState label="Loading question" />;
  if (query.isError)
    return (
      <>
        {back}
        {query.error instanceof ApiError && query.error.status === 404 ? (
          <NotFound what="Practice question" />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </>
    );

  const { question, attempts } = query.data;
  const latest = submit.data ?? null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submit.isPending) return; // no duplicate submissions
    if (!answer.trim()) {
      setValidation('Write an answer first. A few sentences in your own words is enough.');
      return;
    }
    setValidation(null);
    submit.mutate(answer, {
      onSuccess: () => {
        setAnswer('');
        requestAnimationFrame(() => feedbackRef.current?.focus());
      },
    });
  };

  return (
    <div className="max-w-3xl">
      {back}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Badge tone="primary">{question.skill.name}</Badge>
        <Badge>{LEARNING_DIFFICULTY_LABELS[question.difficulty]}</Badge>
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{question.prompt}</h1>

      <form onSubmit={onSubmit} aria-label="Your answer" className="mt-5">
        <label htmlFor={answerId} className="text-sm font-medium">
          Your answer
        </label>
        <TextArea
          id={answerId}
          rows={8}
          className="mt-1.5"
          value={answer}
          maxLength={INTERVIEW_ANSWER_MAX_LENGTH}
          aria-describedby={hintId}
          onChange={(e) => {
            setAnswer(e.target.value);
            setValidation(null);
          }}
        />
        <p id={hintId} className="mt-1 text-xs text-muted">
          {words(answer)} words · around {question.targetWords} is typical. Answer as you would out
          loud: the main idea first, then an example.
        </p>
        {validation ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {validation}
          </p>
        ) : null}
        {submit.isError ? (
          <div className="mt-2">
            <Alert>{errorMessage(submit.error)}</Alert>
          </div>
        ) : null}
        <Button type="submit" className="mt-3" loading={submit.isPending}>
          {attempts.length || latest ? 'Get feedback on this attempt' : 'Get feedback'}
        </Button>
      </form>

      <div
        ref={feedbackRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="mt-6 outline-none empty:hidden"
      >
        {latest ? (
          <Card>
            <CardHeader title="Feedback on your answer" />
            <InterviewFeedbackPanel feedback={latest} />
            <p className="mt-4 text-sm">
              Revise the missing concepts, then write a new answer above to try again — every
              attempt is kept below.
            </p>
          </Card>
        ) : null}
      </div>

      <section aria-labelledby="previous-attempts" className="mt-8">
        <h2 id="previous-attempts" className="mb-3 text-base font-semibold">
          Previous attempts
        </h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-muted">
            No attempts yet. Your attempts are saved to your account.
          </p>
        ) : (
          <ol className="space-y-2">
            {attempts.map((a) => (
              <li key={a.attemptId}>
                <details className="rounded-lg border border-border px-4 py-3">
                  <summary className="cursor-pointer text-sm">
                    Attempt {a.attemptNumber} · {formatDate(a.createdAt)} · key concepts{' '}
                    {a.dimensions.correctness.score}/10
                  </summary>
                  <blockquote className="mt-2 rounded bg-surface-muted p-3 text-sm whitespace-pre-line">
                    {a.answer}
                  </blockquote>
                  <div className="mt-3">
                    <InterviewFeedbackPanel feedback={a} />
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
