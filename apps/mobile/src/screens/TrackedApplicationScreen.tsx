import { APPLICATION_STATUS_LABELS, type ApplicationTimelineEvent } from '@job-assist/shared';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink } from '../icons';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Screen } from '../components/Screen';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Section,
  Text,
} from '../components/ui';
import { formatDate, hostOf, TRACKER_MEANING, TRACKER_TONE } from '../format';
import { space } from '../theme';
import { useLoad } from '../useLoad';

function describe(e: ApplicationTimelineEvent): { title: string; detail: string | null } {
  switch (e.kind) {
    case 'CREATED':
      return {
        title: `Started as ${APPLICATION_STATUS_LABELS[e.status]}`,
        detail: `With ${e.resumeName} v${e.versionNumber}`,
      };
    case 'STATUS_CHANGED':
      return {
        title: APPLICATION_STATUS_LABELS[e.toStatus],
        detail:
          [e.occurredOn ? `On ${formatDate(e.occurredOn)}` : null, e.note]
            .filter(Boolean)
            .join(' · ') || null,
      };
    case 'NOTE':
      return { title: 'Note', detail: e.body };
    case 'DOCUMENT_ADDED':
      return { title: 'Document added', detail: e.name };
  }
}

/** A tracked application: its status, what it means, and its timeline (read-only on mobile). */
export function TrackedApplicationScreen({ id }: { id: string }) {
  const { api } = useAuth();
  const data = useLoad(async () => {
    const [app, timeline] = await Promise.all([api.trackedApplication(id), api.timeline(id)]);
    return { app, timeline };
  }, [api, id]);
  const d = data.data;

  return (
    <Screen title="Application" refreshing={data.refreshing} onRefresh={data.reload}>
      {data.loading ? (
        <LoadingState label="Loading application" />
      ) : !d ? (
        <ErrorState message={data.error ?? 'Please try again.'} onRetry={data.reload} />
      ) : (
        <>
          {data.error ? <Banner tone="warning">{data.error}</Banner> : null}
          <View style={{ gap: space.sm }}>
            <Text variant="title">{d.app.jobTitle}</Text>
            <Text muted>{[d.app.companyName, d.app.job.location].filter(Boolean).join(' · ')}</Text>
            <Badge
              label={APPLICATION_STATUS_LABELS[d.app.status]}
              tone={TRACKER_TONE[d.app.status]}
            />
            <Text>{TRACKER_MEANING[d.app.status]}</Text>
            <Text variant="small" muted>
              Resume used: {d.app.resume.resumeName} v{d.app.resume.versionNumber}
              {d.app.appliedAt ? ` · applied ${formatDate(d.app.appliedAt)}` : ''}
            </Text>
          </View>
          <Text variant="small" muted>
            Update the status, notes and documents on the JobAssist website.
          </Text>
          {(d.app.applicationUrl ?? d.app.job.jobUrl) ? (
            <Button
              label={`Open ${hostOf(d.app.applicationUrl ?? d.app.job.jobUrl) ?? 'posting'}`}
              icon={ExternalLink}
              variant="secondary"
              onPress={() =>
                void WebBrowser.openBrowserAsync((d.app.applicationUrl ?? d.app.job.jobUrl)!)
              }
            />
          ) : null}
          <Section title="Timeline">
            <Card>
              {d.timeline.length === 0 ? <Text muted>No activity yet.</Text> : null}
              {d.timeline.map((e, i) => {
                const { title, detail } = describe(e);
                return (
                  <View
                    key={`${e.kind}-${e.at}-${i}`}
                    style={{ gap: 2, paddingVertical: space.xs }}
                  >
                    <Text variant="label">{title}</Text>
                    <Text variant="caption" muted>
                      {formatDate(e.at)}
                    </Text>
                    {detail ? (
                      <Text variant="small" muted>
                        {detail}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}
