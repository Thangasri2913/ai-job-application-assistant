import {
  EMPLOYMENT_TYPE_LABELS,
  type JobDetail,
  type JobRecommendationItem,
  MATCH_SCORE_NAME,
  WORK_MODE_LABELS,
} from '@job-assist/shared';
import * as WebBrowser from 'expo-web-browser';
import { Bookmark, ExternalLink, Wand2, X } from '../icons';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  LoadingState,
  MatchScore,
  Section,
  Text,
} from '../components/ui';
import { hostOf, relativeDay } from '../format';
import { useNav } from '../navigation';
import { space } from '../theme';
import { messageOf, useLoad } from '../useLoad';

const PREVIEW_CHARS = 600;

/**
 * One job: what it is, why it was recommended (only when the matching engine produced an
 * explanation), and the next actions. Opening the posting never counts as applying.
 */
export function JobScreen({
  jobId,
  recommendationId,
}: {
  jobId: string;
  recommendationId?: string;
}) {
  const { api } = useAuth();
  const data = useLoad(async () => {
    const [job, recommendation] = await Promise.all([
      api.job(jobId),
      recommendationId ? api.recommendation(recommendationId) : Promise.resolve(null),
    ]);
    return { job, recommendation };
  }, [api, jobId, recommendationId]);

  return (
    <Screen title="Job" refreshing={data.refreshing} onRefresh={data.reload}>
      {data.loading ? (
        <LoadingState label="Loading job" />
      ) : !data.data ? (
        <ErrorState message={data.error ?? 'Please try again.'} onRetry={data.reload} />
      ) : (
        <JobView
          job={data.data.job}
          recommendation={data.data.recommendation}
          onChanged={data.reload}
        />
      )}
    </Screen>
  );
}

function JobView({
  job,
  recommendation: r,
  onChanged,
}: {
  job: JobDetail;
  recommendation: JobRecommendationItem | null;
  onChanged: () => void;
}) {
  const { api } = useAuth();
  const { navigate, back } = useNav();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const host = hostOf(job.jobUrl);
  const description =
    expanded || job.description.length <= PREVIEW_CHARS
      ? job.description
      : `${job.description.slice(0, PREVIEW_CHARS).trimEnd()}…`;

  const run = (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    fn()
      .catch((e: unknown) => setError(messageOf(e)))
      .finally(() => setBusy(null));
  };

  const prepare = () =>
    run('prepare', async () => {
      const app = await api.prepare(job.id, r?.resume?.resumeVersionId ?? null);
      navigate('applications', { name: 'application', id: app.id });
    });

  const openPosting = async () => {
    if (!job.jobUrl) return;
    const ok = await confirm({
      title: 'Open the job posting?',
      message: `This opens ${host ?? 'the posting'} in your browser. Viewing a posting doesn’t apply to the job.`,
      confirmLabel: 'Open posting',
    });
    if (ok) await WebBrowser.openBrowserAsync(job.jobUrl);
  };

  const facts = [
    job.companyName,
    job.location,
    r?.job.workMode ? WORK_MODE_LABELS[r.job.workMode] : null,
    job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] : null,
  ].filter(Boolean);

  return (
    <>
      <View style={{ gap: space.sm }}>
        <Text variant="title">{job.title}</Text>
        <Text muted>{facts.join(' · ')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {r ? <MatchScore score={r.matchScore} /> : null}
          {job.isSampleData ? <Badge label="Sample data — not a real job" tone="warning" /> : null}
          {job.application ? <Badge label="Application tracked" tone="primary" /> : null}
        </View>
        <Text variant="caption" muted>
          {[
            r?.job.postedAt ? `Posted ${relativeDay(r.job.postedAt).toLowerCase()}` : null,
            r?.source ? `Source: ${r.source.name}` : job.source ? `Source: ${job.source}` : null,
            r?.source?.attribution?.label ?? null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {error ? <Banner tone="danger">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}

      {r ? (
        <Card>
          <Text variant="subheading">Why it was recommended</Text>
          <Text variant="small" muted>
            {MATCH_SCORE_NAME}. It compares the job with your resumes; it is not a prediction of
            being hired.
          </Text>
          <Text>{r.reason}</Text>
          {r.reasons.map((reason) => (
            <Text key={reason} variant="small">
              • {reason}
            </Text>
          ))}
          {r.requiredSkills.matched.length > 0 ? (
            <SkillList
              title="Required skills you have"
              skills={r.requiredSkills.matched}
              tone="success"
            />
          ) : null}
          {r.requiredSkills.missing.length > 0 ? (
            <SkillList
              title="Required skills not found in your resume"
              skills={r.requiredSkills.missing}
              tone="danger"
            />
          ) : null}
          {r.gaps.length > 0 ? (
            <View style={{ gap: space.xs }}>
              <Text variant="label">Gaps to consider</Text>
              {r.gaps.map((g) => (
                <Text key={g} variant="small">
                  • {g}
                </Text>
              ))}
            </View>
          ) : null}
          {r.resume?.resumeName ? (
            <Text variant="small" muted>
              Recommended resume: {r.resume.resumeName}
              {r.resume.versionNumber ? ` v${r.resume.versionNumber}` : ''}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Section title="Next steps">
        {job.application ? (
          <Banner tone="primary">
            You’re already tracking an application for this job — see Applications.
          </Banner>
        ) : null}
        {!job.isSampleData ? (
          <Button
            label="Prepare application"
            icon={Wand2}
            loading={busy === 'prepare'}
            disabled={busy !== null}
            hint="Prepares a cover letter and answers for your review. Nothing is submitted."
            onPress={prepare}
          />
        ) : null}
        <Text variant="small" muted>
          Preparing never submits anything: you review everything first, and you’re told exactly how
          it will be submitted.
        </Text>
        {job.jobUrl ? (
          <Button
            label={host ? `View posting on ${host}` : 'View posting'}
            icon={ExternalLink}
            variant="secondary"
            onPress={() => void openPosting()}
          />
        ) : null}
        {r && r.status !== 'SAVED' && r.status !== 'APPLIED' && r.status !== 'DISMISSED' ? (
          <Button
            label="Save to my jobs"
            icon={Bookmark}
            variant="secondary"
            loading={busy === 'save'}
            disabled={busy !== null}
            onPress={() =>
              run('save', async () => {
                await api.saveRecommendation(r.id);
                setNotice('Saved to your jobs.');
                onChanged();
              })
            }
          />
        ) : null}
        {r && r.status !== 'DISMISSED' && r.status !== 'APPLIED' ? (
          <Button
            label="Dismiss this job"
            icon={X}
            variant="ghost"
            disabled={busy !== null}
            onPress={() =>
              void (async () => {
                const ok = await confirm({
                  title: 'Dismiss this job?',
                  message:
                    'It will be hidden from your recommendations and won’t be suggested again.',
                  confirmLabel: 'Dismiss',
                  destructive: true,
                });
                if (ok)
                  run('dismiss', async () => {
                    await api.dismissRecommendation(r.id);
                    await back();
                  });
              })()
            }
          />
        ) : null}
      </Section>

      <Section title="Job description">
        <Card>
          <Text selectable>{description}</Text>
          {job.description.length > PREVIEW_CHARS ? (
            <Button
              compact
              variant="ghost"
              label={expanded ? 'Show less' : 'Show full description'}
              onPress={() => setExpanded(!expanded)}
            />
          ) : null}
        </Card>
      </Section>
    </>
  );
}

function SkillList({
  title,
  skills,
  tone,
}: {
  title: string;
  skills: string[];
  tone: 'success' | 'danger';
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {skills.map((s) => (
          <Badge key={s} label={tone === 'success' ? `✓ ${s}` : `✗ ${s}`} tone={tone} />
        ))}
      </View>
    </View>
  );
}
