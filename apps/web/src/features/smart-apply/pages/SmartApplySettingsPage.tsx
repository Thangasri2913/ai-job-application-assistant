import {
  DAILY_APPLICATION_LIMIT_MAX,
  DAILY_SUBMISSION_LIMIT_MAX,
  SMART_APPLY_MODE_LABELS,
  SMART_APPLY_MODES,
  type SmartApplyMode,
  type SmartApplySettingsItem,
} from '@job-assist/shared';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { TextField } from '../../../shared/ui/TextField';
import {
  useSavedAnswers,
  useSmartApplyAction,
  useSmartApplySettings,
} from '../hooks/useSmartApply';
import { smartApplyApi } from '../services/smart-apply-api';

export function SmartApplySettingsPage() {
  const settings = useSmartApplySettings();
  return (
    <>
      <PageHeader
        title="Smart Apply settings"
        subtitle="How applications are submitted, your daily limits and your saved answers."
        actions={
          <Link to="/smart-apply" className={buttonClasses('ghost', 'md')}>
            Smart Apply
          </Link>
        }
      />
      {settings.isPending ? (
        <LoadingState label="Loading settings" />
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <div className="grid gap-5">
          <SettingsForm key={JSON.stringify(settings.data)} settings={settings.data} />
          <SavedAnswers />
        </div>
      )}
    </>
  );
}

function SettingsForm({ settings: s }: { settings: SmartApplySettingsItem }) {
  const [mode, setMode] = useState<SmartApplyMode>(s.mode);
  const [applications, setApplications] = useState(String(s.dailyApplicationLimit));
  const [submissions, setSubmissions] = useState(String(s.dailySubmissionLimit));
  const [consent, setConsent] = useState(s.autoSubmitConsentAt !== null);
  const save = useSmartApplyAction(() =>
    smartApplyApi.updateSettings({
      mode,
      dailyApplicationLimit: Number(applications),
      dailySubmissionLimit: Number(submissions),
      autoSubmitConsent: consent,
    }),
  );
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined);
  };

  return (
    <Card aria-labelledby="mode-title">
      <CardHeader id="mode-title" title="Application mode" />
      {!s.autoSubmitAvailable ? (
        <p className="mb-4 rounded-lg bg-surface-muted p-3 text-sm text-muted">
          No authorised submission integration is available on this server, so every application is
          handed off to the official site for you to submit. Your preferences below take effect if
          one becomes available.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Mode</span>
          <Select
            aria-label="Mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as SmartApplyMode)}
          >
            {SMART_APPLY_MODES.map((m) => (
              <option key={m} value={m}>
                {SMART_APPLY_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </label>
        <TextField
          label="Applications prepared per day"
          type="number"
          min={1}
          max={DAILY_APPLICATION_LIMIT_MAX}
          value={applications}
          onChange={(e) => setApplications(e.target.value)}
          hint={`Used in the last 24 hours: ${s.usage.applicationsToday}`}
        />
        <TextField
          label="Automatic submissions per day"
          type="number"
          min={1}
          max={DAILY_SUBMISSION_LIMIT_MAX}
          value={submissions}
          onChange={(e) => setSubmissions(e.target.value)}
          hint={`Used in the last 24 hours: ${s.usage.submissionsToday}`}
        />
        <div className="grid gap-1.5 rounded-lg border border-border p-3 text-sm">
          <p>{s.consentText}</p>
          <Checkbox
            label="I agree"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {s.autoSubmitConsentAt ? (
            <p className="text-xs text-muted">
              Consent given on {formatDate(s.autoSubmitConsentAt)}.
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          Every application is still prepared for your review and approval first. Nothing is ever
          submitted without your approval.
        </p>
        {save.error ? <Alert>{errorMessage(save.error)}</Alert> : null}
        {save.isSuccess ? <Alert tone="success">Settings saved.</Alert> : null}
        <div>
          <Button type="submit" disabled={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SavedAnswers() {
  const answers = useSavedAnswers();
  const remove = useSmartApplyAction((id: string) => smartApplyApi.deleteSavedAnswer(id));
  return (
    <Card aria-labelledby="saved-title">
      <CardHeader
        id="saved-title"
        title="Saved answers"
        description="Answers you confirmed and chose to reuse. Sensitive ones are always confirmed again."
      />
      {answers.isPending ? (
        <LoadingState label="Loading saved answers" />
      ) : answers.isError ? (
        <ErrorState error={answers.error} onRetry={() => void answers.refetch()} />
      ) : answers.data.length === 0 ? (
        <p className="text-sm text-muted">No saved answers.</p>
      ) : (
        <ul aria-label="Saved answers" className="grid gap-2 text-sm">
          {answers.data.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{a.label}</p>
                <p className="whitespace-pre-wrap text-muted">{a.answer}</p>
                {a.validUntil ? (
                  <p className="text-xs text-muted">Reused until {formatDate(a.validUntil)}</p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(a.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
