import {
  countWords,
  INTERVIEW_ANSWER_MAX_LENGTH,
  type InterviewSessionDetail,
} from '@job-assist/shared';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Button } from '../../../shared/ui/Button';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { TextArea } from '../../../shared/ui/TextArea';
import { useCompleteInterview, useSessionAction } from '../hooks/useInterviews';
import { interviewsApi } from '../services/interviews-api';

/** One question at a time, no feedback until the end. */
export function MockInterview({ session }: { session: InterviewSessionDetail }) {
  const [text, setText] = useState('');
  const submit = useSessionAction(session.id, (args: { questionId: string; answer: string }) =>
    interviewsApi.answer(session.id, args.questionId, args.answer),
  );
  const complete = useCompleteInterview(session.id);
  const total = session.questions.length;
  const current = session.questions[session.currentIndex];
  const done = session.currentIndex >= total;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className="text-sm text-muted">
          {done
            ? `All ${total} questions answered`
            : `Question ${session.currentIndex + 1} / ${total}`}
        </p>
        <ProgressBar value={(100 * session.currentIndex) / total} label="Interview progress" />
      </div>
      {current && !done ? (
        <>
          <p className="text-lg font-medium">{current.question}</p>
          <label htmlFor="mock-answer" className="sr-only">
            Answer
          </label>
          <TextArea
            id="mock-answer"
            rows={7}
            value={text}
            maxLength={INTERVIEW_ANSWER_MAX_LENGTH}
            placeholder="Your answer…"
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-muted">{countWords(text)} words</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!text.trim()}
              loading={submit.isPending}
              onClick={() =>
                submit.mutate(
                  { questionId: current.id, answer: text },
                  { onSuccess: () => setText('') },
                )
              }
            >
              Submit answer
            </Button>
            <Button
              variant="ghost"
              disabled={session.currentIndex === 0 || complete.isPending}
              onClick={() => complete.mutate()}
            >
              End interview early
            </Button>
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <p>That’s the last question. Finish the interview to get your feedback.</p>
          <div>
            <Button loading={complete.isPending} onClick={() => complete.mutate()}>
              Finish interview
            </Button>
          </div>
        </div>
      )}
      {complete.isPending ? (
        <p className="text-sm text-muted" aria-live="polite">
          Generating final report…
        </p>
      ) : null}
      {submit.error || complete.error ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(submit.error ?? complete.error)}
        </p>
      ) : null}
    </div>
  );
}
