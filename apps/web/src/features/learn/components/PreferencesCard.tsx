import {
  LEARNING_CATEGORIES,
  LEARNING_CATEGORY_LABELS,
  LEARNING_ROLE_LABELS,
  LEARNING_ROLES,
  type LearningCategory,
  type LearningPreferences,
  type LearningRole,
  MAX_INTEREST_SKILLS,
  WEEKLY_GOAL_MINUTES,
} from '@job-assist/shared';
import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { Select } from '../../../shared/ui/Select';
import { minutes } from '../format';
import { useLearningPreferences, useLearningSkills, useUpdatePreferences } from '../hooks/useLearn';

function PreferencesForm({ initial }: { initial: LearningPreferences }) {
  const skills = useLearningSkills();
  const update = useUpdatePreferences();
  const [role, setRole] = useState<LearningRole | ''>(initial.targetRole ?? '');
  const [categories, setCategories] = useState<LearningCategory[]>(initial.interestCategories);
  const [skillIds, setSkillIds] = useState<string[]>(initial.interestSkillIds);
  const [goal, setGoal] = useState(
    initial.weeklyGoalMinutes ? String(initial.weeklyGoalMinutes) : '',
  );
  const [saved, setSaved] = useState('');

  const toggle = <T,>(list: T[], value: T, on: boolean) =>
    on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (update.isPending) return;
    update.mutate(
      {
        targetRole: role || null,
        interestCategories: categories,
        interestSkillIds: skillIds,
        weeklyGoalMinutes: goal ? Number(goal) : null,
      },
      { onSuccess: () => setSaved('Preferences saved. Suggestions now use them.') },
    );
  };

  return (
    <form onSubmit={onSubmit} aria-label="Learning preferences" className="mt-3 space-y-4">
      <label className="block max-w-sm">
        <span className="mb-1.5 block text-sm font-medium">Target role (optional)</span>
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as LearningRole | '');
            setSaved('');
          }}
        >
          <option value="">No target role</option>
          {LEARNING_ROLES.map((r) => (
            <option key={r} value={r}>
              {LEARNING_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">
          Fields you are interested in (optional)
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {LEARNING_CATEGORIES.map((c) => (
            <Checkbox
              key={c}
              label={LEARNING_CATEGORY_LABELS[c]}
              checked={categories.includes(c)}
              onChange={(e) => {
                setCategories((list) => toggle(list, c, e.target.checked));
                setSaved('');
              }}
            />
          ))}
        </div>
      </fieldset>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Specific skills you are interested in (optional
          {skillIds.length ? `, ${skillIds.length} chosen` : ''})
        </summary>
        <fieldset className="mt-2">
          <legend className="sr-only">Skills you are interested in</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(skills.data?.skills ?? []).map((s) => (
              <Checkbox
                key={s.id}
                label={s.name}
                checked={skillIds.includes(s.id)}
                disabled={!skillIds.includes(s.id) && skillIds.length >= MAX_INTEREST_SKILLS}
                onChange={(e) => {
                  setSkillIds((list) => toggle(list, s.id, e.target.checked));
                  setSaved('');
                }}
              />
            ))}
          </div>
        </fieldset>
      </details>
      <label className="block max-w-sm">
        <span className="mb-1.5 block text-sm font-medium">Weekly study goal (optional)</span>
        <Select
          value={goal}
          onChange={(e) => {
            setGoal(e.target.value);
            setSaved('');
          }}
        >
          <option value="">No goal</option>
          {WEEKLY_GOAL_MINUTES.map((m) => (
            <option key={m} value={m}>
              About {minutes(m)} a week
            </option>
          ))}
        </Select>
        <span className="mt-1 block text-xs text-muted">
          Only shown next to this week’s estimate — no streaks or reminders.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={update.isPending}>
          Save preferences
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-success empty:hidden">
          {saved}
        </p>
      </div>
      {update.isError ? <Alert>{errorMessage(update.error)}</Alert> : null}
    </form>
  );
}

/** Optional learner preferences, stored on the account and used only to tailor suggestions. */
export function PreferencesCard() {
  const query = useLearningPreferences();
  return (
    <Card id="learning-preferences" aria-labelledby="preferences-heading" className="scroll-mt-24">
      <h2 id="preferences-heading" className="text-base font-semibold">
        Learning preferences
      </h2>
      <p className="mt-1 text-sm text-muted">
        All optional. Saved to your account and used only to tailor suggestions — they never change
        your resume or profile.
      </p>
      {query.isPending ? (
        <LoadingState label="Loading preferences" />
      ) : query.isError ? (
        <div className="mt-3">
          <Alert>{errorMessage(query.error)}</Alert>
        </div>
      ) : (
        <PreferencesForm initial={query.data} />
      )}
    </Card>
  );
}
