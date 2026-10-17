import {
  APPLICATION_URL_KIND_LABELS,
  CANCELLABLE_STATES,
  SMART_APPLY_STATE_LABELS,
  SUBMISSION_CONFIRMATION_LABELS,
  type SmartApplicationDetail,
  smartApplyDisplay,
} from '@job-assist/shared';
import * as WebBrowser from 'expo-web-browser';
import { CircleCheck, CircleSlash, ExternalLink, FileText, RefreshCw, Send } from '../icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { QuestionForm } from '../components/QuestionForm';
import { Screen } from '../components/Screen';
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  ErrorState,
  LoadingState,
  Section,
  Steps,
  Text,
} from '../components/ui';
import { formatDate, hostOf, SMART_STEPS, smartStep } from '../format';
import { useNav } from '../navigation';
import { space, useColors } from '../theme';
import { messageOf, useLoad } from '../useLoad';

const ANSWERABLE = ['NEEDS_USER_INPUT', 'READY_FOR_REVIEW', 'AWAITING_USER_SUBMISSION'];

export function ApplicationScreen({ id }: { id: string }) {
  const { api } = useAuth();
  const app = useLoad(() => api.application(id), [api, id]);
  const working =
    app.data &&
    (app.data.state === 'PREPARING' ||
      app.data.state === 'DISCOVERED' ||
      (app.data.state === 'SUBMITTING' && !app.data.uncertain));
  // Preparation runs in the background: check again until it settles.
  useEffect(() => {
    if (!working) return;
    const t = setInterval(app.reload, 2500);
    return () => clearInterval(t);
  }, [working, app.reload]);

  return (
    <Screen title="Application" refreshing={app.refreshing} onRefresh={app.reload}>
      {app.loading ? (
        <LoadingState label="Loading application" />
      ) : !app.data ? (
        <ErrorState message={app.error ?? 'Please try again.'} onRetry={app.reload} />
      ) : (
        <>
          {app.error ? <Banner tone="warning">{app.error}</Banner> : null}
          <ApplicationView application={app.data} onChange={app.reload} />
        </>
      )}
    </Screen>
  );
}

function ApplicationView({
  application: a,
  onChange,
}: {
  application: SmartApplicationDetail;
  onChange: () => void;
}) {
  const { api } = useAuth();
  const { push } = useNav();
  const confirm = useConfirm();
  const c = useColors();
  const display = smartApplyDisplay(a);
  const step = smartStep(a.state);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const outstanding = a.questions.filter((q) => q.required && !q.confirmed);
  const others = a.questions.filter((q) => !(q.required && !q.confirmed));

  const act = (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setError(null);
    setSuccess(null);
    fn()
      .then(() => {
        if (done) {
          setSuccess(done);
          AccessibilityInfo.announceForAccessibility(done);
        }
        onChange();
      })
      .catch((e: unknown) => setError(messageOf(e)))
      .finally(() => setBusy(null));
  };

  return (
    <>
      <View style={{ gap: space.sm }}>
        <Text variant="title">{a.job.title}</Text>
        <Text muted>{[a.job.companyName, a.job.location].filter(Boolean).join(' · ')}</Text>
        <Badge label={display.label} tone={display.tone} />
        <Text>{display.hint}</Text>
        {step !== null ? (
          <Steps steps={SMART_STEPS} current={a.state === 'SUBMITTED' ? 5 : step} />
        ) : null}
      </View>

      {a.failureReason ? (
        <Banner tone="danger" title="What went wrong">
          {a.failureReason}
        </Banner>
      ) : null}
      {a.uncertain ? (
        <Banner tone="danger" title="We don’t know yet whether it was received">
          We are checking with the provider and won’t send it again. If you know it was received,
          you can report it below.
        </Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {success ? <Banner tone="success">{success}</Banner> : null}

      {ANSWERABLE.includes(a.state) && outstanding.length > 0 ? (
        <Section
          title={`Answer ${outstanding.length} required question${outstanding.length === 1 ? '' : 's'}`}
        >
          {outstanding.map((q) => (
            <QuestionForm key={`${q.id}-${q.answer ?? ''}`} question={q} onSaved={onChange} />
          ))}
        </Section>
      ) : null}

      {a.state === 'READY_FOR_REVIEW' && !a.approvedAt ? (
        <Section title="Review and approve">
          <Card>
            <Text>
              Check the prepared materials and your answers. Approving doesn’t submit anything:
              you’ll then be shown how this application is submitted.
            </Text>
            <Button
              label="Review prepared materials"
              icon={FileText}
              variant="secondary"
              onPress={() => push({ name: 'materials', id: a.id })}
            />
            <Button
              label="Approve application"
              icon={CircleCheck}
              loading={busy === 'approve'}
              disabled={busy !== null}
              onPress={() =>
                void (async () => {
                  const ok = await confirm({
                    title: 'Approve this application?',
                    message:
                      'You confirm the materials and answers are correct. Nothing is submitted yet.',
                    confirmLabel: 'Approve',
                  });
                  if (ok) act('approve', () => api.approve(a.id), 'Application approved.');
                })()
              }
            />
          </Card>
        </Section>
      ) : null}

      {a.state === 'AWAITING_USER_SUBMISSION' || a.uncertain ? (
        <Section title="Submit on the employer’s site">
          <HandoffCard
            application={a}
            busy={busy}
            onReport={() =>
              act(
                'report',
                () => api.reportSubmitted(a.id, { confirm: true }),
                'Recorded as submitted by you.',
              )
            }
          />
        </Section>
      ) : null}

      {a.state === 'FAILED' ? (
        <Section title="What you can do">
          <Button
            label="Submit on the employer’s site instead"
            icon={Send}
            loading={busy === 'handoff'}
            disabled={busy !== null}
            onPress={() => act('handoff', () => api.handoff(a.id))}
          />
          <Button
            label="Prepare again"
            icon={RefreshCw}
            variant="secondary"
            disabled={busy !== null}
            onPress={() => act('again', () => api.prepareAgain(a.id))}
          />
        </Section>
      ) : null}
      {a.state === 'CANCELLED' ? (
        <Button
          label="Prepare again"
          icon={RefreshCw}
          variant="secondary"
          loading={busy === 'again'}
          disabled={busy !== null}
          onPress={() => act('again', () => api.prepareAgain(a.id))}
        />
      ) : null}

      {a.state === 'SUBMITTED' ? (
        <Card>
          <Text variant="subheading">
            {a.confirmation ? SUBMISSION_CONFIRMATION_LABELS[a.confirmation] : 'Submitted'}
          </Text>
          <Text muted>
            {[
              a.submittedAt ? `On ${formatDate(a.submittedAt)}` : null,
              a.confirmationReference ? `Reference ${a.confirmationReference}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {a.confirmation === 'USER_REPORTED' ? (
            <Text variant="small" muted>
              You reported this; the app has not verified it with the employer.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {a.matchScore !== null || a.matchExplanation ? (
        <Section title="Match">
          <Card>
            {a.matchScore !== null ? (
              <Text variant="label">
                {a.matchScore}% compatibility with {a.resume.resumeName} v{a.resume.versionNumber}
              </Text>
            ) : null}
            {a.matchExplanation ? (
              <Text variant="small" muted>
                {a.matchExplanation}
              </Text>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {others.length > 0 ? (
        <Section title="Your answers">
          {ANSWERABLE.includes(a.state)
            ? others.map((q) => (
                <QuestionForm
                  key={`${q.id}-${q.answer ?? ''}-${String(q.confirmed)}`}
                  question={q}
                  onSaved={onChange}
                />
              ))
            : others.map((q) => (
                <Card key={q.id}>
                  <Text variant="label">{q.question}</Text>
                  <Text muted>{q.answer ?? '—'}</Text>
                </Card>
              ))}
        </Section>
      ) : null}

      {a.state !== 'READY_FOR_REVIEW' ? (
        <Button
          label="View prepared materials"
          icon={FileText}
          variant="secondary"
          onPress={() => push({ name: 'materials', id: a.id })}
        />
      ) : null}

      <Section title="How it’s submitted">
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {a.eligibility.autoSubmitEligible ? (
              <CircleCheck size={18} color={c.success} />
            ) : (
              <CircleSlash size={18} color={c.muted} />
            )}
            <Text style={{ flex: 1 }}>{a.eligibility.summary}</Text>
          </View>
        </Card>
      </Section>

      <Section title="History">
        <Card>
          {a.history.map((h) => (
            <View key={h.id} style={{ gap: 2, paddingVertical: space.xs }}>
              <Text variant="label">{SMART_APPLY_STATE_LABELS[h.toState]}</Text>
              <Text variant="caption" muted>
                {formatDate(h.createdAt)} · {h.actor === 'USER' ? 'You' : 'JobAssist'}
              </Text>
              {h.reason ? (
                <Text variant="small" muted>
                  {h.reason}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      </Section>

      {CANCELLABLE_STATES.includes(a.state) ? (
        <Button
          label="Cancel application"
          variant="ghost"
          disabled={busy !== null}
          onPress={() =>
            void (async () => {
              const ok = await confirm({
                title: 'Cancel this application?',
                message:
                  'Nothing has been sent. You can prepare it again later; your answers are kept.',
                confirmLabel: 'Cancel application',
                cancelLabel: 'Keep it',
                destructive: true,
              });
              if (ok) act('cancel', () => api.cancel(a.id), 'Application cancelled.');
            })()
          }
        />
      ) : null}
    </>
  );
}

/** Open the official page, submit there, then report it (recorded as reported by you). */
function HandoffCard({
  application: a,
  busy,
  onReport,
}: {
  application: SmartApplicationDetail;
  busy: string | null;
  onReport: () => void;
}) {
  const confirm = useConfirm();
  const [submittedMyself, setSubmittedMyself] = useState(false);
  const host = hostOf(a.officialApplicationUrl);
  return (
    <Card>
      <Text>{a.eligibility.summary}</Text>
      {a.officialApplicationUrl ? (
        <>
          <Button
            label={host ? `Open ${host}` : 'Open the official application page'}
            icon={ExternalLink}
            hint="Opens the employer's application page in your browser"
            onPress={() => void WebBrowser.openBrowserAsync(a.officialApplicationUrl!)}
          />
          {a.applicationUrlKind ? (
            <Text variant="small" muted>
              {APPLICATION_URL_KIND_LABELS[a.applicationUrlKind]}
            </Text>
          ) : null}
        </>
      ) : (
        <Text muted>No application link is known for this job; apply through the employer.</Text>
      )}
      <Checkbox
        label="I submitted this application myself on the official site"
        checked={submittedMyself}
        onChange={setSubmittedMyself}
      />
      <Button
        label="Mark as submitted"
        variant="secondary"
        loading={busy === 'report'}
        disabled={!submittedMyself || busy !== null}
        onPress={() =>
          void (async () => {
            const ok = await confirm({
              title: 'Mark as submitted?',
              message:
                'This records that you submitted it yourself. JobAssist can’t verify it with the employer.',
              confirmLabel: 'Mark as submitted',
            });
            if (ok) onReport();
          })()
        }
      />
    </Card>
  );
}
