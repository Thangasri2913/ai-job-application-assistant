import {
  DAILY_APPLICATION_LIMIT_MAX,
  DAILY_SUBMISSION_LIMIT_MAX,
  SMART_APPLY_MODE_LABELS,
  type SmartApplyMode,
  type SmartApplySettingsItem,
} from '@job-assist/shared';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  ChoiceGroup,
  ErrorState,
  LoadingState,
  Section,
  Text,
  TextField,
} from '../components/ui';
import { formatDate } from '../format';
import { useNav } from '../navigation';
import { space } from '../theme';
import { messageOf, useLoad } from '../useLoad';

export function SmartApplySettingsScreen() {
  const { api } = useAuth();
  const s = useLoad(() => api.settings(), [api]);
  return (
    <Screen title="Smart Apply settings">
      {s.loading ? (
        <LoadingState label="Loading settings" />
      ) : !s.data ? (
        <ErrorState message={s.error ?? 'Please try again.'} onRetry={s.reload} />
      ) : (
        <SettingsForm key={JSON.stringify(s.data)} settings={s.data} onSaved={s.setData} />
      )}
    </Screen>
  );
}

const limitError = (value: string, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max
    ? null
    : `Enter a whole number from 1 to ${max}.`;
};

function SettingsForm({
  settings: s,
  onSaved,
}: {
  settings: SmartApplySettingsItem;
  onSaved: (s: SmartApplySettingsItem) => void;
}) {
  const { api } = useAuth();
  const { setGuard } = useNav();
  const confirm = useConfirm();
  const [mode, setMode] = useState<SmartApplyMode>(s.mode);
  const [applications, setApplications] = useState(String(s.dailyApplicationLimit));
  const [submissions, setSubmissions] = useState(String(s.dailySubmissionLimit));
  const [consent, setConsent] = useState(s.autoSubmitConsentAt !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty =
    mode !== s.mode ||
    applications !== String(s.dailyApplicationLimit) ||
    submissions !== String(s.dailySubmissionLimit) ||
    consent !== (s.autoSubmitConsentAt !== null);
  const errors = {
    applications: limitError(applications, DAILY_APPLICATION_LIMIT_MAX),
    submissions: limitError(submissions, DAILY_SUBMISSION_LIMIT_MAX),
  };

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    setGuard(
      dirty
        ? () =>
            confirm({
              title: 'Discard changes?',
              message: 'Your changes to Smart Apply settings haven’t been saved.',
              confirmLabel: 'Discard',
              cancelLabel: 'Keep editing',
              destructive: true,
            })
        : null,
    );
    return () => setGuard(null);
  }, [dirty, setGuard, confirm]);

  const save = () => {
    if (errors.applications || errors.submissions) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    api
      .updateSettings({
        mode,
        dailyApplicationLimit: Number(applications),
        dailySubmissionLimit: Number(submissions),
        autoSubmitConsent: consent,
      })
      .then((next) => {
        setSaved(true);
        AccessibilityInfo.announceForAccessibility('Settings saved.');
        onSaved(next);
      })
      .catch((e: unknown) => setError(messageOf(e)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      {!s.autoSubmitAvailable ? (
        <Banner tone="primary" title="Every application is submitted by you">
          No employer-authorised submission integration is available, so you always submit on the
          employer’s site. These preferences take effect if one becomes available.
        </Banner>
      ) : null}
      {saved ? <Banner tone="success">Settings saved.</Banner> : null}
      {error ? (
        <Banner
          tone="danger"
          title="Settings weren’t saved"
        >{`${error} Your changes are still here.`}</Banner>
      ) : null}

      <Section title="Mode">
        <ChoiceGroup<SmartApplyMode>
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            {
              value: 'PREPARE_ONLY',
              label: 'Prepare only',
              description: SMART_APPLY_MODE_LABELS.PREPARE_ONLY,
            },
            { value: 'HYBRID', label: 'Hybrid', description: SMART_APPLY_MODE_LABELS.HYBRID },
          ]}
        />
      </Section>

      <Section title="Daily limits">
        <TextField
          label="Applications prepared per day"
          required
          keyboardType="number-pad"
          returnKeyType="done"
          value={applications}
          onChangeText={setApplications}
          hint={`Used in the last 24 hours: ${s.usage.applicationsToday}`}
          error={errors.applications}
        />
        <TextField
          label="Automatic submissions per day"
          required
          keyboardType="number-pad"
          returnKeyType="done"
          value={submissions}
          onChangeText={setSubmissions}
          hint={`Used in the last 24 hours: ${s.usage.submissionsToday}`}
          error={errors.submissions}
        />
      </Section>

      <Section title="Consent to automatic submission">
        <Card>
          <Text variant="small">{s.consentText}</Text>
          <Checkbox label="I agree" checked={consent} onChange={setConsent} />
          {s.autoSubmitConsentAt ? (
            <Text variant="caption" muted>
              Consent given on {formatDate(s.autoSubmitConsentAt)}.
            </Text>
          ) : null}
        </Card>
        <Text variant="small" muted>
          You still review and approve every application before anything is submitted.
        </Text>
      </Section>

      <Button
        label="Save settings"
        loading={busy}
        disabled={!dirty || Boolean(errors.applications || errors.submissions)}
        onPress={save}
      />
      <Text variant="caption" muted style={{ marginTop: -space.sm }}>
        {dirty ? 'You have unsaved changes.' : 'No unsaved changes.'}
      </Text>
    </>
  );
}
