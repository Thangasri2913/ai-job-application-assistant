import type { SmartApplyQuestion } from '@job-assist/shared';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { Select } from '../../../shared/ui/Select';
import { TextArea } from '../../../shared/ui/TextArea';
import { useSmartApplyAction } from '../hooks/useSmartApply';
import { smartApplyApi } from '../services/smart-apply-api';

const PREFILL_LABEL = {
  SAVED_ANSWER: 'Pre-filled from an answer you saved',
  PROFILE: 'Pre-filled from your Career Profile',
} as const;

/**
 * One question with its answer. Answers are only used once the user confirms them;
 * sensitive answers need an explicit confirmation for each application.
 */
export function QuestionAnswerForm({ question: q }: { question: SmartApplyQuestion }) {
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [save, setSave] = useState(false);
  const submit = useSmartApplyAction((vars: { confirm: boolean }) =>
    smartApplyApi.answer(q.smartApplicationId, q.id, {
      answer,
      confirm: vars.confirm,
      saveForReuse: vars.confirm && save,
    }),
  );
  const sensitive = q.sensitivity !== 'STANDARD';
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate({ confirm: true });
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label={q.question}
      className="grid gap-2.5 rounded-lg border border-border p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 font-medium">{q.question}</p>
        <div className="flex flex-wrap gap-1.5">
          {q.required ? <Badge tone="warning">Required</Badge> : <Badge>Optional</Badge>}
          {q.confirmed ? <Badge tone="success">Confirmed</Badge> : null}
          {q.sensitivity === 'SENSITIVE' ? (
            <Badge tone="danger">Needs your confirmation</Badge>
          ) : null}
          {q.sensitivity === 'DEMOGRAPHIC' ? <Badge>Voluntary</Badge> : null}
        </div>
      </div>
      <p className="text-xs text-muted">{q.reason}</p>
      {q.prefilledFrom && !q.confirmed ? (
        <p className="text-xs text-primary">
          {PREFILL_LABEL[q.prefilledFrom]} — check it before confirming.
        </p>
      ) : null}
      {q.options.length > 0 ? (
        <Select aria-label="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)}>
          <option value="">Choose…</option>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <TextArea
          aria-label="Answer"
          rows={3}
          value={answer}
          maxLength={5000}
          onChange={(e) => setAnswer(e.target.value)}
        />
      )}
      {sensitive ? (
        <Checkbox
          label={
            q.sensitivity === 'DEMOGRAPHIC'
              ? 'I choose to answer this voluntary question for this application'
              : 'I confirm this answer is true and accurate for this application'
          }
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
      ) : null}
      {q.sensitivity !== 'DEMOGRAPHIC' ? (
        <Checkbox
          label="Save this answer for future applications"
          checked={save}
          onChange={(e) => setSave(e.target.checked)}
        />
      ) : null}
      {submit.error ? <Alert>{errorMessage(submit.error)}</Alert> : null}
      {submit.isSuccess && !submit.isPending ? (
        <p role="status" className="text-sm text-success">
          Answer saved.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={!answer.trim() || (sensitive && !confirmed) || submit.isPending}
        >
          Confirm answer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!answer.trim() || submit.isPending}
          onClick={() => submit.mutate({ confirm: false })}
        >
          Save draft
        </Button>
      </div>
    </form>
  );
}
