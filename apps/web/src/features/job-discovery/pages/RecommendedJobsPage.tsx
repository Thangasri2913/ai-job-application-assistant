import { JOB_RECOMMENDATION_STATUS_LABELS, MATCH_SCORE_NAME } from '@job-assist/shared';
import { BellRing, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { JobRecommendationCard } from '../components/JobRecommendationCard';
import { SampleDataNotice } from '../components/SampleDataNotice';
import {
  useDiscoveryAction,
  useJobAlerts,
  useJobSources,
  useRecommendations,
} from '../hooks/useDiscovery';
import { discoveryApi, type RecommendationFilter } from '../services/discovery-api';

const FILTERS: { value: RecommendationFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'All except dismissed' },
  { value: 'NEW', label: JOB_RECOMMENDATION_STATUS_LABELS.NEW },
  { value: 'SAVED', label: JOB_RECOMMENDATION_STATUS_LABELS.SAVED },
  { value: 'APPLIED', label: JOB_RECOMMENDATION_STATUS_LABELS.APPLIED },
  { value: 'DISMISSED', label: JOB_RECOMMENDATION_STATUS_LABELS.DISMISSED },
];

export function RecommendedJobsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as RecommendationFilter | null) ?? 'ACTIVE';
  const alertId = params.get('alertId') ?? undefined;
  const recommendations = useRecommendations(status, alertId);
  const alerts = useJobAlerts();
  const sources = useJobSources();
  const save = useDiscoveryAction((id: string) => discoveryApi.save(id));
  const dismiss = useDiscoveryAction((id: string) => discoveryApi.dismiss(id));
  const devMode = sources.data?.some((s) => s.isDevelopment && s.isEnabled) ?? false;

  const update = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Recommended jobs"
        subtitle={`Jobs your alerts found, ranked by ${MATCH_SCORE_NAME.toLowerCase()} and fit.`}
        actions={
          <Link to="/job-alerts" className={buttonClasses('secondary', 'md')}>
            <BellRing className="size-4" aria-hidden />
            Job alerts
          </Link>
        }
      />
      {devMode ? (
        <div className="mb-5">
          <SampleDataNotice />
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Show</span>
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) =>
              update('status', e.target.value === 'ACTIVE' ? undefined : e.target.value)
            }
            className="w-48"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </label>
        {alerts.data && alerts.data.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Alert</span>
            <Select
              aria-label="Alert"
              value={alertId ?? ''}
              onChange={(e) => update('alertId', e.target.value || undefined)}
              className="w-56"
            >
              <option value="">All alerts</option>
              {alerts.data.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>
      {save.error || dismiss.error ? (
        <div className="mb-4">
          <Alert>{errorMessage(save.error ?? dismiss.error)}</Alert>
        </div>
      ) : null}
      {recommendations.isPending ? (
        <LoadingState label="Loading recommendations" />
      ) : recommendations.isError ? (
        <ErrorState error={recommendations.error} onRetry={() => void recommendations.refetch()} />
      ) : recommendations.data.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No recommendations yet"
          description="Create a job alert and run it. Jobs that meet your minimum match score appear here, each with the resume to use."
        >
          <Link to="/job-alerts" className={buttonClasses('primary', 'md')}>
            Set up a job alert
          </Link>
        </EmptyState>
      ) : (
        <ul aria-label="Recommended jobs" className="grid gap-4">
          {recommendations.data.map((r) => (
            <JobRecommendationCard
              key={r.id}
              recommendation={r}
              busy={save.isPending || dismiss.isPending}
              onSave={() => save.mutate(r.id)}
              onDismiss={() => dismiss.mutate(r.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
