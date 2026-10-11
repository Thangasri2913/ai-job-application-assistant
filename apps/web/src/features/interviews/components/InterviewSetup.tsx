import {
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_FOCUS_LABELS,
  INTERVIEW_FOCUSES,
  INTERVIEW_QUESTION_COUNTS,
  type InterviewDifficulty,
  type InterviewFocus,
  type InterviewQuestionCount,
} from '@job-assist/shared';
import { useForm } from 'react-hook-form';
import { Button } from '../../../shared/ui/Button';
import { FormField } from '../../../shared/ui/FormField';
import { Select } from '../../../shared/ui/Select';

export interface SetupValues {
  focus: InterviewFocus;
  difficulty: InterviewDifficulty;
  questionCount: string;
}

const DIFFICULTY_LABELS: Record<InterviewDifficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

/** Practice (feedback per answer) or mock interview (feedback at the end). Defaults: mixed, medium, 10. */
export function InterviewSetup({
  busy,
  pendingMode,
  onStart,
}: {
  busy: boolean;
  pendingMode: 'PRACTICE' | 'MOCK' | null;
  onStart: (v: {
    mode: 'PRACTICE' | 'MOCK';
    focus: InterviewFocus;
    difficulty: InterviewDifficulty;
    questionCount: InterviewQuestionCount;
  }) => void;
}) {
  const { register, handleSubmit } = useForm<SetupValues>({
    defaultValues: { focus: 'MIXED', difficulty: 'MEDIUM', questionCount: '10' },
  });
  const submit = (mode: 'PRACTICE' | 'MOCK') =>
    handleSubmit((v) =>
      onStart({
        mode,
        focus: v.focus,
        difficulty: v.difficulty,
        questionCount: Number(v.questionCount) as InterviewQuestionCount,
      }),
    );
  return (
    <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Interview type">
          {(a) => (
            <Select {...a} {...register('focus')}>
              {INTERVIEW_FOCUSES.map((f) => (
                <option key={f} value={f}>
                  {INTERVIEW_FOCUS_LABELS[f]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Difficulty">
          {(a) => (
            <Select {...a} {...register('difficulty')}>
              {INTERVIEW_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Number of questions">
          {(a) => (
            <Select {...a} {...register('questionCount')}>
              {INTERVIEW_QUESTION_COUNTS.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          loading={pendingMode === 'PRACTICE'}
          onClick={() => void submit('PRACTICE')()}
        >
          Start preparation
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          loading={pendingMode === 'MOCK'}
          onClick={() => void submit('MOCK')()}
        >
          Start mock interview
        </Button>
        {busy ? (
          <span className="text-sm text-muted" aria-live="polite">
            Preparing interview… generating questions…
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Preparation gives feedback after each answer. A mock interview asks one question at a time
        and gives feedback at the end.
      </p>
    </form>
  );
}
