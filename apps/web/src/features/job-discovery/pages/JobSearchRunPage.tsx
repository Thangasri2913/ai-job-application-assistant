import { History, Play } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { scheduleSummary } from '../components/alert-format';
import { SearchRunHistory } from '../components/SearchRunHistory';
import { useJobAlert, useRunAlert, useSearchRuns } from '../hooks/useDiscovery';

export function JobSearchRunPage() {
  const { alertId = '' } = useParams();
  const alert = useJobAlert(alertId);
  const runs = useSearchRuns(alertId);
  const run = useRunAlert();

  if (alert.isPending) return <LoadingState label="Loading job alert" />;
  if (alert.isError) return <ErrorState error={alert.error} onRetry={() => void alert.refetch()} />;
  const inProgress = runs.data?.some((r) => r.status === 'RUNNING') ?? false;

  return (
    <>
      <PageHeader
        title={alert.data.name}
        subtitle={scheduleSummary(alert.data)}
        actions={
          <>
            <Link
              to={`/recommendations?alertId=${alertId}`}
              className="self-center text-sm text-primary hover:underline"
            >
              View recommendations
            </Link>
            <Button
              loading={run.isPending}
              disabled={inProgress}
              onClick={() => run.mutate(alertId)}
            >
              <Play className="size-4" aria-hidden />
              {inProgress ? 'Running…' : 'Run now'}
            </Button>
          </>
        }
      />
      {run.error ? (
        <div className="mb-4">
          <Alert>{errorMessage(run.error)}</Alert>
        </div>
      ) : null}
      <Card aria-labelledby="runs-heading">
        <CardHeader
          id="runs-heading"
          title="Run history"
          description="Postings below your minimum score are kept out of your recommendations."
        />
        {runs.isPending ? (
          <LoadingState />
        ) : runs.isError ? (
          <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
        ) : runs.data.length === 0 ? (
          <EmptyState
            icon={History}
            title="No runs yet"
            description="This alert runs on its schedule. Choose Run now to search immediately."
          />
        ) : (
          <SearchRunHistory runs={runs.data} />
        )}
      </Card>
      <p className="mt-4 text-sm">
        <Link to="/job-alerts" className="text-primary hover:underline">
          ← All job alerts
        </Link>
      </p>
    </>
  );
}
