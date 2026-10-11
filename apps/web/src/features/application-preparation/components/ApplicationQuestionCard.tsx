import {
  ANSWER_MAX_LENGTH,
  type ApplicationQuestionItem,
  QUESTION_TYPE_LABELS,
} from '@job-assist/shared';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { TextArea } from '../../../shared/ui/TextArea';
import { usePreparationAction } from '../hooks/usePreparation';
import { preparationApi } from '../services/preparation-api';
import { ContentStatus } from './ApprovalStatus';
import { LimitCounter } from './LimitCounter';

/** The suggestion is shown separately from the user's own answer, which is what gets approved. */
export function ApplicationQuestionCard({
  applicationId,
  question: q,
  disabled,
}: {
  applicationId: string;
  question: ApplicationQuestionItem;
  disabled: boolean;
}) {
  const [answer, setAnswer] = useState(q.userAnswer ?? '');
  const limits = { maxWords: q.maxWords, maxCharacters: q.maxCharacters };
  const generate = usePreparationAction(applicationId, () =>
    preparationApi.generateAnswer(applicationId, q.id),
  );
  const save = usePreparationAction(applicationId, () =>
    preparationApi.updateQuestion(applicationId, q.id, { userAnswer: answer.trim() || null }),
  );
  const approve = usePreparationAction(applicationId, () =>
    preparationApi.approveAnswer(applicationId, q.id),
  );
  const remove = usePreparationAction(applicationId, () =>
    preparationApi.deleteQuestion(applicationId, q.id),
  );
  const dirty = answer.trim() !== (q.userAnswer ?? '');
  const canUseSuggestion = q.suggestedAnswer && !q.insufficientInformation;
  const error = generate.error ?? save.error ?? approve.error ?? remove.error;

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="mb-2 flex flex-wrap items-start gap-2">
        <p className="flex-1 font-medium">{q.question}</p>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Delete question"
          disabled={disabled}
          loading={remove.isPending}
          onClick={() => remove.mutate(undefined)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge>{QUESTION_TYPE_LABELS[q.questionType]}</Badge>
        {q.maxWords !== null ? <Badge>Max {q.maxWords} words</Badge> : null}
        {q.maxCharacters !== null ? <Badge>Max {q.maxCharacters} characters</Badge> : null}
        <ContentStatus source={q.answerSource} status={q.status} />
      </div>

      <div className="mb-3">
        <Button
          size="sm"
          variant={q.suggestedAnswer ? 'ghost' : 'secondary'}
          disabled={disabled || generate.isPending}
          loading={generate.isPending}
          onClick={() => generate.mutate(undefined)}
        >
          {q.suggestedAnswer ? 'Regenerate suggestion' : 'Generate answer'}
        </Button>
        {generate.isPending ? (
          <span className="ml-2 text-sm text-muted" aria-live="polite">
            Generating answer…
          </span>
        ) : null}
      </div>

      {q.suggestedAnswer ? (
        <div className="mb-3 rounded-lg bg-surface-muted p-3 text-sm">
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            Suggested answer
          </p>
          <p className="whitespace-pre-line">{q.suggestedAnswer}</p>
          {q.missingInformation.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs font-semibold text-muted">Missing information</p>
              <ul className="list-disc pl-5 text-muted">
                {q.missingInformation.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {q.assumptions.length > 0 ? (
            <p className="mt-2 text-xs text-muted">Assumptions: {q.assumptions.join('; ')}</p>
          ) : null}
          {q.note ? <p className="mt-2 text-xs text-muted">{q.note}</p> : null}
          {canUseSuggestion ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setAnswer(q.suggestedAnswer!)}
            >
              Use suggestion as my answer
            </Button>
          ) : null}
        </div>
      ) : null}

      <label htmlFor={`answer-${q.id}`} className="text-sm font-medium">
        Your answer
      </label>
      <TextArea
        id={`answer-${q.id}`}
        rows={4}
        value={answer}
        maxLength={ANSWER_MAX_LENGTH}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder={
          canUseSuggestion ? 'Edit the suggestion or write your own…' : 'Write your answer…'
        }
      />
      <LimitCounter
        text={answer || (canUseSuggestion && !q.userAnswer ? q.suggestedAnswer! : '')}
        limits={limits}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!dirty || disabled}
          loading={save.isPending}
          onClick={() => save.mutate(undefined)}
        >
          Save answer
        </Button>
        <Button
          size="sm"
          disabled={
            dirty || disabled || q.status === 'APPROVED' || (!q.userAnswer && !canUseSuggestion)
          }
          loading={approve.isPending}
          onClick={() => approve.mutate(undefined)}
        >
          {q.userAnswer ? 'Approve answer' : 'Approve suggestion'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorMessage(error)}
        </p>
      ) : null}
    </li>
  );
}
