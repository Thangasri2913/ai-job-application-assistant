import {
  countWords,
  INTERVIEW_ANSWER_MAX_LENGTH,
  INTERVIEW_CATEGORY_LABELS,
  type InterviewQuestionItem,
} from '@job-assist/shared';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { TextArea } from '../../../shared/ui/TextArea';
import { useSessionAction } from '../hooks/useInterviews';
import { interviewsApi } from '../services/interviews-api';
import { AnswerFeedback } from './AnswerFeedback';

/** One practice question: write an answer, get feedback, try again. Earlier attempts are kept. */
export function PracticeQuestion({
  sessionId,
  question: q,
  closed,
}: {
  sessionId: string;
  question: InterviewQuestionItem;
  closed: boolean;
}) {
  const [text, setText] = useState('');
  const answerAndEvaluate = useSessionAction(sessionId, async () => {
    await interviewsApi.answer(sessionId, q.id, text);
    return interviewsApi.evaluate(sessionId, q.id);
  });
  const latest = q.answers.at(-1);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{INTERVIEW_CATEGORY_LABELS[q.category]}</Badge>
        {q.source === 'AI' ? <Badge tone="primary">AI generated</Badge> : null}
      </div>
      <p className="text-lg font-medium">{q.question}</p>
      {q.rationale ? <p className="text-sm text-muted">Why this question: {q.rationale}</p> : null}
      {q.expectedTopics.length ? (
        <p className="text-xs text-muted">
          A strong answer may cover: {q.expectedTopics.join(', ')}
        </p>
      ) : null}

      {q.answers.length > 0 ? (
        <ol className="grid gap-3" aria-label="Your attempts">
          {q.answers.map((a) => (
            <li key={a.id} className="grid gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Your answer (attempt {a.attempt})
              </p>
              <p className="rounded-lg border border-border p-3 text-sm whitespace-pre-line">
                {a.answer}
              </p>
              {a.evaluation ? <AnswerFeedback evaluation={a.evaluation} /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {!closed ? (
        <div className="grid gap-2">
          <label htmlFor={`answer-${q.id}`} className="text-sm font-medium">
            {latest ? 'Try again' : 'Your answer'}
          </label>
          <TextArea
            id={`answer-${q.id}`}
            rows={6}
            value={text}
            maxLength={INTERVIEW_ANSWER_MAX_LENGTH}
            placeholder="Write your answer here…"
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-muted">{countWords(text)} words</p>
          <div className="flex items-center gap-2">
            <Button
              disabled={!text.trim()}
              loading={answerAndEvaluate.isPending}
              onClick={() => answerAndEvaluate.mutate(undefined, { onSuccess: () => setText('') })}
            >
              Evaluate answer
            </Button>
            {answerAndEvaluate.isPending ? (
              <span className="text-sm text-muted" aria-live="polite">
                Evaluating answer…
              </span>
            ) : null}
          </div>
          {answerAndEvaluate.error ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(answerAndEvaluate.error)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
