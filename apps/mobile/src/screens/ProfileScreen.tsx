import { FileText, LogOut, MessageSquareText, SlidersHorizontal } from '../icons';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import {
  Banner,
  Button,
  Card,
  Divider,
  ErrorState,
  ListRow,
  LoadingState,
  Section,
  Text,
} from '../components/ui';
import { useNav } from '../navigation';
import { space, useColors } from '../theme';
import { useLoad } from '../useLoad';

/** Account, profile completeness (as computed by the API), resumes, Smart Apply settings, sign out. */
export function ProfileScreen() {
  const { api, signOut } = useAuth();
  const { push } = useNav();
  const confirm = useConfirm();
  const c = useColors();
  const data = useLoad(async () => {
    const [user, dashboard] = await Promise.all([api.me(), api.dashboard()]);
    return { user, completion: dashboard.profileCompletion, resumes: dashboard.resumes };
  }, [api]);
  const d = data.data;

  return (
    <Screen title="Profile" refreshing={data.refreshing} onRefresh={data.reload}>
      {data.loading ? (
        <LoadingState label="Loading profile" />
      ) : !d ? (
        <ErrorState message={data.error ?? 'Please try again.'} onRetry={data.reload} />
      ) : (
        <>
          {data.error ? <Banner tone="warning">{data.error}</Banner> : null}
          <View style={{ gap: space.xs }}>
            <Text variant="title">{d.user.fullName}</Text>
            <Text muted>{d.user.email}</Text>
          </View>

          <Section title="Career profile">
            <Card>
              <Text variant="label">{d.completion.percentage}% complete</Text>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ height: 6, borderRadius: 999, backgroundColor: c.border }}
              >
                <View
                  style={{
                    width: `${d.completion.percentage}%`,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: c.primary,
                  }}
                />
              </View>
              {d.completion.items
                .filter((i) => !i.complete)
                .map((i) => (
                  <Text key={i.key} variant="small" muted>
                    • {i.label}: {i.hint}
                  </Text>
                ))}
              <Text variant="small" muted>
                Edit your career profile on the JobAssist website; it is used for matching and to
                prepare applications.
              </Text>
            </Card>
          </Section>

          <Section title="Resumes and applications">
            <Card style={{ padding: 0, gap: 0 }}>
              <ListRow
                icon={FileText}
                title="Resumes"
                subtitle={`${d.resumes.active} active${d.resumes.defaultResume ? ` · default: ${d.resumes.defaultResume.name}` : ''}`}
                onPress={() => push({ name: 'resumes' })}
              />
              <Divider />
              <ListRow
                icon={SlidersHorizontal}
                title="Smart Apply settings"
                subtitle="How applications are submitted, limits and consent"
                onPress={() => push({ name: 'smartApplySettings' })}
              />
              <Divider />
              <ListRow
                icon={MessageSquareText}
                title="Saved answers"
                subtitle="Answers you chose to reuse"
                onPress={() => push({ name: 'savedAnswers' })}
              />
            </Card>
          </Section>
        </>
      )}
      <Button
        label="Sign out"
        icon={LogOut}
        variant="secondary"
        onPress={() =>
          void (async () => {
            const ok = await confirm({
              title: 'Sign out?',
              message: 'You’ll need to sign in again to see your jobs and applications.',
              confirmLabel: 'Sign out',
            });
            if (ok) await signOut();
          })()
        }
      />
    </Screen>
  );
}
