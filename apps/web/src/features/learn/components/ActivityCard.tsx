import {
  ACTIVITY_VARIANT_LABELS,
  type ActivityAnswer,
  type ActivityAttemptResult,
  type LearningActivity,
} from '@job-assist/shared';
import { CircleCheck, CircleX, Lightbulb } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { cn } from '../../../shared/ui/cn';
import { TextArea } from '../../../shared/ui/TextArea';
import { TextField } from '../../../shared/ui/TextField';
import { draftKey, readDraft, writeDraft } from '../activity-session';
import { useSubmitActivity } from '../hooks/useLearn';
import { CodeBlock } from './CodeBlock';

function activityLabel(activity: LearningActivity): string {
  switch (activity.type) {
    case 'MULTIPLE_CHOICE':
      return ACTIVITY_VARIANT_LABELS[activity.variant];
    case 'FILL_IN_THE_GAP':
      return 'Fill in the gap';
    case 'SHORT_ANSWER':
      return activity.variant === 'EXPECTED_OUTPUT'
        ? 'Predict the output'
        : activity.variant === 'SQL'
          ? 'SQL'
          : 'Short answer';
    case 'CHECKLIST':
      return 'Practical checklist';
    case 'REFLECTION':
      return 'Reflection';
    case 'REVISION_CARDS':
      return 'Revision cards';
  }
}

interface Previous {
  attempts: number;
  latestCorrect: boolean | null;
}

/** One interactive activity. Graded activities are checked by the server. */
export function ActivityCard({
  courseId,
  activity,
  previous,
}: {
  courseId: string;
  activity: LearningActivity;
  previous?: Previous;
}) {
  const headingId = useId();
  const [showHint, setShowHint] = useState(false);
  return (
    <section
      id={`activity-${activity.id}`}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-xl border border-border bg-surface p-4"
    >
      <h4 id={headingId} className="text-xs font-semibold uppercase tracking-wide text-muted">
        Activity {activity.order} · {activityLabel(activity)}
      </h4>
      <p className="mt-2 text-sm font-medium whitespace-pre-line">{activity.prompt}</p>
      {activity.code ? <CodeBlock code={activity.code} /> : null}
      {activity.hint ? (
        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showHint}
            onClick={() => setShowHint((v) => !v)}
          >
            <Lightbulb className="size-4" aria-hidden />
            {showHint ? 'Hide hint' : 'Show hint'}
          </Button>
          {showHint ? <p className="mt-1 text-sm text-muted">{activity.hint}</p> : null}
        </div>
      ) : null}
      <div className="mt-3">
        {activity.type === 'REFLECTION' ? (
          <Reflection />
        ) : activity.type === 'REVISION_CARDS' ? (
          <RevisionCards cards={activity.cards} />
        ) : (
          <Submittable courseId={courseId} activity={activity} previous={previous} />
        )}
      </div>
    </section>
  );
}

type SubmittableActivity = Exclude<LearningActivity, { type: 'REFLECTION' | 'REVISION_CARDS' }>;

function Submittable({
  courseId,
  activity,
  previous,
}: {
  courseId: string;
  activity: SubmittableActivity;
  previous?: Previous;
}) {
  const submit = useSubmitActivity(courseId, activity.id);
  const key = draftKey(courseId, activity.id);
  const initial = readDraft(key);
  const [result, setResult] = useState<ActivityAttemptResult | null>(initial.result);
  const [choice, setChoice] = useState(initial.choice);
  const [text, setText] = useState(initial.text);
  const [gaps, setGaps] = useState<Record<string, string>>(initial.gaps);
  const [checked, setChecked] = useState<string[]>(initial.checked);
  const [validation, setValidation] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const groupName = useId();
  const validationId = useId();
  const locked = result !== null;

  // Keep the draft for this tab so leaving the lesson does not discard it.
  useEffect(() => {
    writeDraft(key, { choice, text, gaps, checked, result });
  }, [key, choice, text, gaps, checked, result]);

  const answer = (): ActivityAnswer | string => {
    switch (activity.type) {
      case 'MULTIPLE_CHOICE':
        return choice ? { type: 'MULTIPLE_CHOICE', optionId: choice } : 'Choose an answer first.';
      case 'SHORT_ANSWER':
        return text.trim() ? { type: 'SHORT_ANSWER', text } : 'Type an answer first.';
      case 'FILL_IN_THE_GAP':
        return Object.values(gaps).some((g) => g.trim())
          ? { type: 'FILL_IN_THE_GAP', gaps }
          : 'Fill in at least one gap first.';
      case 'CHECKLIST':
        return { type: 'CHECKLIST', checkedItemIds: checked };
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submit.isPending) return; // no duplicate submissions
    const value = answer();
    if (typeof value === 'string') {
      setValidation(value);
      return;
    }
    setValidation(null);
    submit.mutate(value, {
      onSuccess: (r) => {
        setResult(r);
        // Move focus to the feedback so keyboard and screen-reader users land on it.
        requestAnimationFrame(() => feedbackRef.current?.focus());
      },
    });
  };

  const reset = () => {
    setResult(null);
    submit.reset();
  };

  return (
    <form onSubmit={onSubmit} aria-label={`Answer activity ${activity.order}`}>
      {activity.type === 'MULTIPLE_CHOICE' ? (
        <fieldset disabled={locked}>
          <legend className="sr-only">Choose one answer</legend>
          <div className="space-y-2">
            {activity.options.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 text-sm',
                  choice === option.id && 'border-primary bg-primary-soft',
                )}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={option.id}
                  checked={choice === option.id}
                  onChange={() => {
                    setChoice(option.id);
                    setValidation(null);
                  }}
                  className="mt-0.5 accent-primary"
                />
                <span className="whitespace-pre-line">{option.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : activity.type === 'SHORT_ANSWER' ? (
        <TextField
          label="Your answer"
          value={text}
          maxLength={500}
          disabled={locked}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setValidation(null);
          }}
        />
      ) : activity.type === 'FILL_IN_THE_GAP' ? (
        <fieldset disabled={locked}>
          <legend className="sr-only">Fill in each gap</legend>
          <div
            className={cn(
              'rounded-lg bg-surface-muted p-3 text-sm leading-loose',
              activity.asCode ? 'font-mono text-xs whitespace-pre-wrap' : 'whitespace-pre-line',
            )}
          >
            {activity.segments.map((segment, i) =>
              segment.kind === 'text' ? (
                <span key={i}>{segment.text}</span>
              ) : (
                <input
                  key={segment.id}
                  aria-label={segment.label}
                  value={gaps[segment.id] ?? ''}
                  maxLength={500}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => {
                    setGaps((g) => ({ ...g, [segment.id]: e.target.value }));
                    setValidation(null);
                  }}
                  className="mx-1 inline-block w-28 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              ),
            )}
          </div>
        </fieldset>
      ) : (
        <fieldset disabled={locked}>
          <legend className="sr-only">Tick what you have done</legend>
          <ul className="space-y-2">
            {activity.items.map((item) => (
              <li key={item.id}>
                <Checkbox
                  label={item.text}
                  checked={checked.includes(item.id)}
                  onChange={(e) =>
                    setChecked((c) =>
                      e.target.checked ? [...c, item.id] : c.filter((id) => id !== item.id),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {validation ? (
        <p id={validationId} role="alert" className="mt-2 text-sm text-danger">
          {validation}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {locked ? (
          <Button variant="secondary" size="sm" onClick={reset}>
            Try again
          </Button>
        ) : (
          <Button
            type="submit"
            size="sm"
            loading={submit.isPending}
            aria-describedby={validation ? validationId : undefined}
          >
            {activity.type === 'CHECKLIST' ? 'Record checklist' : 'Check answer'}
          </Button>
        )}
        {previous && !result ? (
          <span className="text-xs text-muted">
            {previous.attempts} earlier {previous.attempts === 1 ? 'attempt' : 'attempts'}
            {previous.latestCorrect === true
              ? ' · last one correct'
              : previous.latestCorrect === false
                ? ' · last one incorrect — worth revising'
                : ''}
          </span>
        ) : null}
      </div>

      {submit.isError ? (
        <div className="mt-3">
          <Alert>{errorMessage(submit.error)}</Alert>
        </div>
      ) : null}
      <div
        ref={feedbackRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="mt-3 rounded-lg outline-none focus-visible:outline-2 empty:hidden"
      >
        {result ? <Feedback result={result} /> : null}
      </div>
    </form>
  );
}

function Feedback({ result }: { result: ActivityAttemptResult }) {
  if (!result.graded)
    return (
      <div className="rounded-lg bg-surface-muted p-3 text-sm">
        <p>{result.feedback}</p>
        {result.explanation ? <p className="mt-1 text-muted">{result.explanation}</p> : null}
      </div>
    );
  const Icon = result.correct ? CircleCheck : CircleX;
  return (
    <div
      className={cn(
        'rounded-lg p-3 text-sm',
        result.correct ? 'bg-success-soft' : 'bg-warning-soft',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 font-semibold',
          result.correct ? 'text-success' : 'text-warning',
        )}
      >
        <Icon className="size-4" aria-hidden />
        {result.correct ? 'Correct' : 'Not quite'}
      </p>
      <p className="mt-1">{result.feedback}</p>
      <p className="mt-1">
        <span className="font-medium">Why: </span>
        {result.explanation}
      </p>
      {!result.correct ? (
        <p className="mt-2">
          <a href="#section-explanation" className="font-medium underline underline-offset-2">
            Revisit the explanation
          </a>{' '}
          or open the hint, then try again.
        </p>
      ) : null}
      {!result.correct && result.correctAnswer ? (
        <p className="mt-1">
          <span className="font-medium">Correct answer: </span>
          <span className="whitespace-pre-wrap font-mono text-xs">{result.correctAnswer}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Notes stay in this browser tab only. */
function Reflection() {
  const [notes, setNotes] = useState('');
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        Your notes (not saved or sent anywhere)
      </label>
      <TextArea
        id={id}
        className="mt-1.5"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </div>
  );
}

function RevisionCards({ cards }: { cards: { front: string; back: string }[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {cards.map((card, i) => {
        const shown = open.has(i);
        return (
          <li key={card.front} className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">{card.front}</p>
            {shown ? <p className="mt-1.5 text-muted">{card.back}</p> : null}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1.5"
              aria-expanded={shown}
              onClick={() =>
                setOpen((s) => {
                  const next = new Set(s);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
            >
              {shown ? 'Hide answer' : 'Show answer'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
