import type { SmartApplyQuestion } from '@job-assist/shared';
import { CircleCheck, ShieldAlert } from '../icons';
import { useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { space } from '../theme';
import { messageOf } from '../useLoad';
import { Badge, Banner, Button, Card, Checkbox, ChoiceGroup, Text, TextField } from './ui';

/**
 * One application question. Nothing is guessed: an answer is used only once you confirm it.
 * Sensitive answers (work authorisation, salary, legal statements) need an explicit
 * confirmation for this application; demographic answers are voluntary and never saved.
 * What you typed is kept if saving fails.
 */
export function QuestionForm({
  question: q,
  onSaved,
  showJob,
}: {
  question: SmartApplyQuestion;
  onSaved: () => void;
  showJob?: boolean;
}) {
  const { api } = useAuth();
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const sensitive = q.sensitivity === 'SENSITIVE';
  const demographic = q.sensitivity === 'DEMOGRAPHIC';

  const submit = () => {
    if (!answer.trim()) {
      setFieldError(q.options.length > 0 ? 'Choose an answer.' : 'Write an answer.');
      return;
    }
    if ((sensitive || demographic) && !confirmed) {
      setFieldError(
        sensitive
          ? 'Confirm the answer is accurate for this application.'
          : 'Confirm you choose to answer.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    setFieldError(null);
    api
      .answer(q.smartApplicationId, q.id, {
        answer: answer.trim(),
        confirm: true,
        saveForReuse: !demographic && save,
      })
      .then(() => {
        AccessibilityInfo.announceForAccessibility('Answer saved.');
        onSaved();
      })
      .catch((e: unknown) => setError(messageOf(e))) // the typed answer stays
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      {showJob ? (
        <Text variant="caption" muted>
          {q.job.title} · {q.job.companyName}
        </Text>
      ) : null}
      <Text variant="label">{q.question}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <Badge
          label={q.required ? 'Required' : 'Optional'}
          tone={q.required ? 'warning' : 'neutral'}
        />
        {q.confirmed ? <Badge label="Confirmed" tone="success" icon={CircleCheck} /> : null}
        {sensitive ? (
          <Badge label="Needs your confirmation" tone="danger" icon={ShieldAlert} />
        ) : null}
        {demographic ? <Badge label="Voluntary" /> : null}
      </View>
      <Text variant="small" muted>
        {q.reason}
      </Text>
      {q.prefilledFrom && !q.confirmed ? (
        <Banner tone="primary">
          {`${q.prefilledFrom === 'SAVED_ANSWER' ? 'Pre-filled from an answer you saved' : 'Pre-filled from your career profile'} — check it before confirming.`}
        </Banner>
      ) : null}
      {q.options.length > 0 ? (
        <ChoiceGroup
          label={q.question}
          value={answer || null}
          onChange={(v) => {
            setAnswer(v);
            setFieldError(null);
          }}
          options={q.options.map((o) => ({ value: o, label: o }))}
        />
      ) : (
        <TextField
          label="Your answer"
          required={q.required}
          value={answer}
          onChangeText={(t) => {
            setAnswer(t);
            setFieldError(null);
          }}
          multiline
          maxLength={5000}
          autoCapitalize="sentences"
          error={fieldError}
        />
      )}
      {q.options.length > 0 && fieldError ? (
        <Text variant="small" tone="danger" accessibilityRole="alert">
          {fieldError}
        </Text>
      ) : null}
      {sensitive || demographic ? (
        <Checkbox
          label={
            demographic
              ? 'I choose to answer this voluntary question'
              : 'I confirm this answer is true and accurate for this application'
          }
          checked={confirmed}
          onChange={setConfirmed}
        />
      ) : null}
      {!demographic ? (
        <Checkbox
          label="Save this answer for future applications"
          description={sensitive ? 'It will still be shown for confirmation each time.' : undefined}
          checked={save}
          onChange={setSave}
        />
      ) : (
        <Text variant="small" muted>
          Demographic answers are used only for this application and never saved.
        </Text>
      )}
      {error ? (
        <Banner tone="danger" title="Your answer wasn’t saved">
          {`${error} Your answer is still here — try again.`}
        </Banner>
      ) : null}
      <Button
        label={q.confirmed ? 'Update answer' : 'Confirm answer'}
        loading={busy}
        onPress={submit}
      />
    </Card>
  );
}
