import type { ResumeSummary } from '@job-assist/shared';
import { FileText } from '../icons';
import { useAuth } from '../auth/AuthContext';
import { Screen } from '../components/Screen';
import { Badge, Banner, Card, EmptyState, ErrorState, LoadingState, Text } from '../components/ui';
import { formatDate } from '../format';
import { useLoad } from '../useLoad';

function versionState(r: ResumeSummary): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
} {
  const v = r.latestVersion;
  if (!v) return { label: 'No versions', tone: 'neutral' };
  if (v.parseStatus === 'PENDING' || v.parseStatus === 'PROCESSING')
    return { label: 'Reading the file…', tone: 'neutral' };
  if (v.parseStatus === 'FAILED') return { label: 'Couldn’t be read', tone: 'danger' };
  if (!v.contentConfirmedAt) return { label: 'Needs review', tone: 'warning' };
  return { label: 'Reviewed', tone: 'success' };
}

/** Your active resumes and their state. Uploading and reviewing happen on the website. */
export function ResumesScreen() {
  const { api } = useAuth();
  const list = useLoad(() => api.resumes(), [api]);
  return (
    <Screen title="Resumes" refreshing={list.refreshing} onRefresh={list.reload}>
      <Banner tone="primary">
        Upload, review and edit resumes on the JobAssist website. Only reviewed resumes are used for
        matching.
      </Banner>
      {list.loading ? (
        <LoadingState label="Loading resumes" />
      ) : !list.data ? (
        <ErrorState message={list.error ?? 'Please try again.'} onRetry={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resumes yet"
          text="Upload a resume on the JobAssist website to get job matches and prepare applications."
        />
      ) : (
        list.data.map((r) => {
          const state = versionState(r);
          return (
            <Card
              key={r.id}
              accessibilityLabel={`${r.name}. ${state.label}${r.isDefault ? '. Default resume' : ''}`}
            >
              <Text variant="subheading">{r.name}</Text>
              {r.description ? (
                <Text variant="small" muted>
                  {r.description}
                </Text>
              ) : null}
              <Badge label={state.label} tone={state.tone} />
              {r.isDefault ? <Badge label="Default" tone="primary" /> : null}
              <Text variant="caption" muted>
                {r.currentVersion
                  ? `Current: v${r.currentVersion.versionNumber}`
                  : 'No reviewed version yet'}{' '}
                · {r.versionCount} version{r.versionCount === 1 ? '' : 's'} · updated{' '}
                {formatDate(r.updatedAt)}
              </Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
