import { parseAnswerLimits, QUESTION_MAX_LENGTH } from '@job-assist/shared';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { TextArea } from '../../../shared/ui/TextArea';
import { usePreparationAction, useQuestions } from '../hooks/usePreparation';
import { preparationApi } from '../services/preparation-api';
import { ApplicationQuestionCard } from './ApplicationQuestionCard';

export function ApplicationQuestions({
  applicationId,
  busy,
}: {
  applicationId: string;
  busy: boolean;
}) {
  const questions = useQuestions(applicationId);
  const [text, setText] = useState('');
  const add = usePreparationAction(applicationId, () =>
    preparationApi.addQuestion(applicationId, { question: text.trim() }),
  );
  const detected = parseAnswerLimits(text);
  return (
    <Card aria-labelledby="questions-heading">
      <CardHeader id="questions-heading" title="Application questions" />
      <form
        className="mb-4 grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) add.mutate(undefined, { onSuccess: () => setText('') });
        }}
      >
        <label htmlFor="new-question" className="text-sm font-medium">
          Paste a question from the application form
        </label>
        <TextArea
          id="new-question"
          rows={2}
          value={text}
          maxLength={QUESTION_MAX_LENGTH}
          placeholder="e.g. Describe your experience with Angular. (Maximum 200 words)"
          onChange={(e) => setText(e.target.value)}
        />
        {detected.maxWords !== null || detected.maxCharacters !== null ? (
          <p className="text-xs text-muted">
            Limit detected:{' '}
            {[
              detected.maxWords !== null ? `${detected.maxWords} words` : null,
              detected.maxCharacters !== null ? `${detected.maxCharacters} characters` : null,
            ]
              .filter(Boolean)
              .join(', ')}
          </p>
        ) : null}
        <div>
          <Button type="submit" size="sm" disabled={text.trim().length < 3} loading={add.isPending}>
            + Add question
          </Button>
        </div>
        {add.error ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(add.error)}
          </p>
        ) : null}
      </form>
      {questions.isPending ? (
        <LoadingState />
      ) : questions.isError ? (
        <ErrorState error={questions.error} onRetry={() => void questions.refetch()} />
      ) : questions.data.length === 0 ? (
        <p className="text-sm text-muted">No questions yet.</p>
      ) : (
        <ul className="grid gap-3" aria-label="Application questions">
          {questions.data.map((q) => (
            <ApplicationQuestionCard
              key={`${q.id}-${q.updatedAt}`}
              applicationId={applicationId}
              question={q}
              disabled={busy}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
