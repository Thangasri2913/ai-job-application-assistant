import {
  type ApplicationSummary,
  type SmartApplicationSummary,
  smartApplyDisplay,
} from '@job-assist/shared';
import { ClipboardList } from '../icons';
import { RefreshControl, SectionList, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Header } from '../components/Screen';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
} from '../components/ui';
import { formatDate, TRACKER_TONE, trackerLabel } from '../format';
import { useNav } from '../navigation';
import { space, useColors } from '../theme';
import { useLoad } from '../useLoad';

type Item =
  { kind: 'smart'; smart: SmartApplicationSummary } | { kind: 'tracked'; app: ApplicationSummary };

/**
 * Every application in one place: those Smart Apply is preparing (with what they need next)
 * and the rest of the tracker (status as on the web). An application appears once.
 */
export function ApplicationsScreen() {
  const { api } = useAuth();
  const { push, navigate } = useNav();
  const c = useColors();
  const list = useLoad(async () => {
    const [smart, tracked] = await Promise.all([api.applications(), api.trackedApplications()]);
    return { smart: smart.items, tracked };
  }, [api]);

  const smartIds = new Set(list.data?.smart.map((s) => s.applicationId));
  const sections = list.data
    ? [
        {
          title: 'Smart Apply',
          data: list.data.smart.map((smart): Item => ({ kind: 'smart', smart })),
        },
        {
          title: 'Tracked applications',
          data: list.data.tracked
            .filter((a) => !smartIds.has(a.id))
            .map((app): Item => ({ kind: 'tracked', app })),
        },
      ].filter((s) => s.data.length > 0)
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <Header title="Applications" />
      <SectionList
        sections={sections}
        keyExtractor={(item) => (item.kind === 'smart' ? `s-${item.smart.id}` : `t-${item.app.id}`)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxxl }}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={list.reload}
            colors={[c.primary]}
            tintColor={c.primary}
          />
        }
        ListHeaderComponent={
          list.data && list.error ? <Banner tone="warning">{list.error}</Banner> : null
        }
        renderSectionHeader={({ section }) => (
          <Text variant="subheading" accessibilityRole="header" style={{ marginTop: space.sm }}>
            {section.title}
          </Text>
        )}
        ListEmptyComponent={
          list.loading ? (
            <LoadingState label="Loading applications" />
          ) : list.error ? (
            <ErrorState message={list.error} onRetry={list.reload} />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No applications yet"
              text="Open a job you like and choose “Prepare application”. You review everything before anything is sent."
              action={<Button label="Browse jobs" onPress={() => navigate('jobs')} />}
            />
          )
        }
        renderItem={({ item }) =>
          item.kind === 'smart' ? (
            <SmartRow
              item={item.smart}
              onOpen={() => push({ name: 'application', id: item.smart.id })}
            />
          ) : (
            <TrackedRow
              item={item.app}
              onOpen={() => push({ name: 'trackedApplication', id: item.app.id })}
            />
          )
        }
      />
    </View>
  );
}

function SmartRow({ item: a, onOpen }: { item: SmartApplicationSummary; onOpen: () => void }) {
  const display = smartApplyDisplay(a);
  return (
    <Card
      onPress={onOpen}
      accessibilityLabel={`${a.job.title} at ${a.job.companyName}. ${display.label}. ${display.hint}`}
      accessibilityHint="Opens the application"
    >
      <Text variant="subheading" numberOfLines={2}>
        {a.job.title}
      </Text>
      <Text variant="small" muted numberOfLines={1}>
        {a.job.companyName}
      </Text>
      <Badge label={display.label} tone={display.tone} />
      <Text variant="small" muted>
        {a.outstandingQuestions > 0
          ? `${a.outstandingQuestions} required question${a.outstandingQuestions === 1 ? '' : 's'} to answer`
          : display.hint}
      </Text>
    </Card>
  );
}

function TrackedRow({ item: a, onOpen }: { item: ApplicationSummary; onOpen: () => void }) {
  return (
    <Card
      onPress={onOpen}
      accessibilityLabel={`${a.jobTitle} at ${a.companyName}. ${trackerLabel(a.status)}`}
      accessibilityHint="Opens the application"
    >
      <Text variant="subheading" numberOfLines={2}>
        {a.jobTitle}
      </Text>
      <Text variant="small" muted numberOfLines={1}>
        {a.companyName}
      </Text>
      <Badge label={trackerLabel(a.status)} tone={TRACKER_TONE[a.status]} />
      <Text variant="caption" muted>
        {a.appliedAt ? `Applied ${formatDate(a.appliedAt)}` : `Updated ${formatDate(a.updatedAt)}`}{' '}
        · {a.resume.resumeName} v{a.resume.versionNumber}
      </Text>
    </Card>
  );
}
