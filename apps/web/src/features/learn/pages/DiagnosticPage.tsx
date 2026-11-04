import type { DiagnosticAssessment, DiagnosticResult } from '@job-assist/shared';
import { CircleCheck, CircleX } from 'lucide-react';
import { type FormEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { cn } from '../../../shared/ui/cn';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { CodeBlock } from '../components/CodeBlock';
import { BackLink, NotFound } from '../components/LearnCommon';
import { readDiagnosticDraft, writeDiagnosticDraft } from '../activity-session';
import { useDiagnostic, useSubmitDiagnostic } from '../hooks/useLearn';

function topicReason(topic: DiagnosticResult['topics'][number]): string {
  const of = `${topic.correct} of ${topic.total} question${topic.total === 1 ? '' : 's'} correct`;
  return topic.recommendation === 'SKIM'
    ? `${of}. Skim this lesson and use its activities to confirm.`
    : `${of} (skipped questions count as not yet known). Study this lesson.`;
}

function Results({
  diagnostic,
  result,
  focusRef,
}: {
  diagnostic: DiagnosticAssessment;
  result: DiagnosticResult;
  focusRef: RefObject<HTMLDivElement | null>;
}) {
  const prompts = new Map(diagnostic.questions.map((q) => [q.id, q]));
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="space-y-4 outline-none"
    >
      <Card>
        <CardHeader title={`You answered ${result.score} of ${result.maxScore} correctly`} />
        <p className="text-sm text-muted">
          This is a starting point, not a grade. It suggests where to begin; it does not certify a
          skill.
        </p>
        <ul aria-label="Suggested plan" className="mt-4 space-y-2">
          {result.topics.map((topic) => (
            <li
              key={topic.lessonId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-2.5 text-sm"
            >
              <Link
                to={`/learn/courses/${result.courseId}/lessons/${topic.lessonId}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {topic.lessonTitle}
              </Link>
              <span className="basis-full text-xs text-muted">{topicReason(topic)}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted">
                  {topic.correct}/{topic.total}
                </span>
                {topic.recommendation === 'SKIM' ? (
                  <Badge tone="success">Skim</Badge>
                ) : (
                  <Badge tone="warning">Study</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Link to={`/learn/courses/${result.courseId}`} className={buttonClasses()}>
            Go to the course
          </Link>
        </div>
      </Card>
      <Card>
        <CardHeader title="Answers explained" />
        <ol className="space-y-3">
          {result.questions.map((q, i) => {
            const question = prompts.get(q.questionId);
            const correct = question?.options.find((o) => o.id === q.correctOptionId);
            const Icon = q.correct ? CircleCheck : CircleX;
            return (
              <li key={q.questionId} className="text-sm">
                <p className="flex items-start gap-1.5 font-medium">
                  <Icon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      q.correct ? 'text-success' : 'text-warning',
                    )}
                    aria-label={
                      q.correct ? 'Correct' : q.answered === false ? 'Not answered' : 'Incorrect'
                    }
                  />
                  {i + 1}. {question?.prompt}
                </p>
                {!q.correct && correct ? (
                  <p className="ml-6 mt-1">
                    <span className="font-medium">Correct answer: </span>
                    {correct.text}
                  </p>
                ) : null}
                <p className="ml-6 mt-1 text-muted">{q.explanation}</p>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

export function DiagnosticPage() {
  const { courseId = '' } = useParams();
  const query = useDiagnostic(courseId);
  const submit = useSubmitDiagnostic(courseId);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    readDiagnosticDraft(courseId),
  );
  const [validation, setValidation] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Keep unsubmitted answers for this tab, so leaving the page does not discard them.
  useEffect(() => writeDiagnosticDraft(courseId, answers), [courseId, answers]);
  const back = <BackLink to={`/learn/courses/${courseId}`} label="Back to the course" />;

  if (query.isPending) return <LoadingState label="Loading diagnostic" />;
  if (query.isError)
    return (
      <>
        {back}
        {query.error instanceof ApiError && query.error.status === 404 ? (
          <NotFound what="Diagnostic" />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </>
    );

  const diagnostic = query.data;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submit.isPending) return; // no duplicate submissions
    if (Object.keys(answers).length === 0) {
      setValidation('Answer at least one question. Skip any you do not know.');
      return;
    }
    setValidation(null);
    submit.mutate(
      {
        answers: Object.entries(answers).map(([questionId, optionId]) => ({
          questionId,
          optionId,
        })),
      },
      {
        onSuccess: () => {
          setAnswers({});
          requestAnimationFrame(() => resultsRef.current?.focus());
        },
      },
    );
  };

  return (
    <div className="max-w-3xl">
      {back}
      <PageHeader title={diagnostic.title} subtitle={diagnostic.instructions} />
      {submit.data ? (
        <>
          <Results diagnostic={diagnostic} result={submit.data} focusRef={resultsRef} />
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() => {
              setAnswers({});
              submit.reset();
            }}
          >
            Retake the diagnostic
          </Button>
        </>
      ) : (
        <form onSubmit={onSubmit} aria-label="Diagnostic questions" className="space-y-4">
          {diagnostic.questions.map((q, i) => (
            <fieldset key={q.id} className="rounded-xl border border-border bg-surface p-4">
              <legend className="px-1 text-sm font-medium">
                Question {i + 1} of {diagnostic.questions.length}: {q.prompt}
              </legend>
              {q.code ? <CodeBlock code={q.code} /> : null}
              <div className="mt-2 space-y-2">
                {q.options.map((o) => (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 text-sm"
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={o.id}
                      checked={answers[q.id] === o.id}
                      onChange={() => {
                        setAnswers((a) => ({ ...a, [q.id]: o.id }));
                        setValidation(null);
                      }}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="whitespace-pre-line">{o.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-sm text-muted">
            {Object.keys(answers).length} of {diagnostic.questions.length} answered. Unanswered
            questions count as topics to study.
          </p>
          {validation ? (
            <p role="alert" className="text-sm text-danger">
              {validation}
            </p>
          ) : null}
          {submit.isError ? <Alert>{errorMessage(submit.error)}</Alert> : null}
          <Button type="submit" loading={submit.isPending}>
            See my results
          </Button>
        </form>
      )}
    </div>
  );
}
