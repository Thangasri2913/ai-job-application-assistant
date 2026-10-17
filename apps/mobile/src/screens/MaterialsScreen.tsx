import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Screen } from '../components/Screen';
import { Badge, Banner, Card, ErrorState, LoadingState, Section, Text } from '../components/ui';
import { space } from '../theme';
import { useLoad } from '../useLoad';

/** The prepared resume, cover letter and answers, for review (edit them on the website). */
export function MaterialsScreen({ id }: { id: string }) {
  const { api } = useAuth();
  const m = useLoad(() => api.materials(id), [api, id]);
  return (
    <Screen title="Prepared materials" refreshing={m.refreshing} onRefresh={m.reload}>
      {m.loading ? (
        <LoadingState label="Loading materials" />
      ) : !m.data ? (
        <ErrorState message={m.error ?? 'Please try again.'} onRetry={m.reload} />
      ) : (
        <>
          <Banner tone="primary">
            AI-prepared from your own resume and answers. Review it before using it; edit the cover
            letter on the JobAssist website.
          </Banner>
          <Section title="Resume">
            <Card>
              <Text variant="label">
                {m.data.resume.resumeName} v{m.data.resume.versionNumber}
              </Text>
              {m.data.resume.content?.headline ? (
                <Text muted>{m.data.resume.content.headline}</Text>
              ) : null}
              {m.data.resume.content?.skills.length ? (
                <Text variant="small" muted>
                  Skills: {m.data.resume.content.skills.map((s) => s.name).join(', ')}
                </Text>
              ) : null}
            </Card>
          </Section>
          <Section title="Cover letter">
            <Card>
              {m.data.coverLetter ? (
                <>
                  <Badge
                    label={`Version ${m.data.coverLetter.versionNumber} · ${m.data.coverLetter.status.toLowerCase()}`}
                  />
                  <Text selectable>{m.data.coverLetter.text}</Text>
                </>
              ) : (
                <Text muted>No cover letter was prepared.</Text>
              )}
            </Card>
          </Section>
          <Section title="Answers">
            <Card>
              {m.data.answers.length === 0 ? (
                <Text muted>No questions for this application.</Text>
              ) : null}
              {m.data.answers.map((a, i) => (
                <View key={i} style={{ gap: space.xs, paddingVertical: space.xs }}>
                  <Text variant="label">{a.question}</Text>
                  <Text muted>{a.answer ?? 'Not answered'}</Text>
                  <Badge
                    label={
                      a.confirmed ? 'Confirmed' : a.required ? 'Needs your answer' : 'Not confirmed'
                    }
                    tone={a.confirmed ? 'success' : a.required ? 'warning' : 'neutral'}
                  />
                </View>
              ))}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}
