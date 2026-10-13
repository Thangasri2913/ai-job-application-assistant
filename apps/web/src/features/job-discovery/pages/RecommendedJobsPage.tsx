import {
  JOB_RECOMMENDATION_STATUS_LABELS,
  MATCH_SCORE_NAME,
  WORK_MODES,
  WORK_MODE_LABELS,
  type WorkMode,
} from '@job-assist/shared';
import { BellRing, Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { Spinner } from '../../../shared/ui/Spinner';
import { TextField } from '../../../shared/ui/TextField';
import { JobRecommendationCard } from '../components/JobRecommendationCard';
import { SampleDataNotice } from '../components/SampleDataNotice';
import { sourcesUnavailable } from '../components/source-status';
import {
  useDiscoveryAction,
  useJobAlerts,
  useJobSources,
  useRecommendations,
} from '../hooks/useDiscovery';
import {
  discoveryApi,
  type RecommendationFilter,
  type RecommendationQuery,
} from '../services/discovery-api';

const FILTERS: { value: RecommendationFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'All except dismissed' },
  { value: 'NEW', label: JOB_RECOMMENDATION_STATUS_LABELS.NEW },
  { value: 'SAVED', label: JOB_RECOMMENDATION_STATUS_LABELS.SAVED },
  { value: 'APPLIED', label: JOB_RECOMMENDATION_STATUS_LABELS.APPLIED },
  { value: 'DISMISSED', label: JOB_RECOMMENDATION_STATUS_LABELS.DISMISSED },
];

const MIN_SCORES = [50, 60, 70, 80, 90];
const TEXT_FILTERS = [
  ['title', 'Job title'],
  ['company', 'Company'],
  ['location', 'Location'],
] as const;

export function RecommendedJobsPage() {
  const [params, setParams] = useSearchParams();
  const minScore = Number(params.get('minScore'));
  const query: RecommendationQuery = {
    status: (params.get('status') as RecommendationFilter | null) ?? 'ACTIVE',
    alertId: params.get('alertId') ?? undefined,
    source: params.get('source') ?? undefined,
    workMode: (params.get('workMode') as WorkMode | null) ?? undefined,
    minScore: minScore > 0 ? minScore : undefined,
    title: params.get('title') ?? undefined,
    company: params.get('company') ?? undefined,
    location: params.get('location') ?? undefined,
  };
  const recommendations = useRecommendations(query);
  const alerts = useJobAlerts();
  const sources = useJobSources();
  const save = useDiscoveryAction((id: string) => discoveryApi.save(id));
  const dismiss = useDiscoveryAction((id: string) => discoveryApi.dismiss(id));
  const enabledSources = sources.data?.filter((s) => s.isEnabled) ?? [];
  const devMode = enabledSources.some((s) => s.isDevelopment);
  const noSources = sources.data !== undefined && enabledSources.length === 0;
  const searching = alerts.data?.some((a) => a.lastRun?.status === 'RUNNING') ?? false;
  const hasRun = alerts.data?.some((a) => a.lastRun !== null) ?? false;
  const unavailable = sourcesUnavailable(sources.data, alerts.data);
  const filtered = Boolean(
    query.source ||
    query.workMode ||
    query.minScore ||
    query.title ||
    query.company ||
    query.location,
  );

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value?.trim()) next.set(key, value.trim());
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Recommended jobs"
        subtitle={`Real jobs your alerts found, ranked by ${MATCH_SCORE_NAME} and fit.`}
        actions={
          <Link to="/job-alerts" className={buttonClasses('secondary', 'md')}>
            <BellRing className="size-4" aria-hidden />
            Job alerts
          </Link>
        }
      />
      <div className="mb-5 grid gap-3">
        {devMode ? <SampleDataNotice /> : null}
        {searching ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg bg-primary-soft px-3.5 py-3 text-sm text-primary"
          >
            <Spinner className="size-4" label="Searching" />
            Finding jobs...
          </p>
        ) : null}
        {unavailable && !noSources ? (
          <Alert>
            Some job sources are temporarily unavailable. Results from the other sources are still
            shown, and the unavailable ones are tried again on the next run.
          </Alert>
        ) : null}
      </div>
      <RecommendationFilters
        // Re-mount when the URL changes so the text boxes show the applied values.
        key={`${query.title ?? ''}|${query.company ?? ''}|${query.location ?? ''}`}
        query={query}
        alerts={alerts.data?.map((a) => ({ id: a.id, name: a.name })) ?? []}
        sources={enabledSources.map((s) => ({ key: s.key, name: s.name }))}
        filtered={filtered}
        onChange={update}
      />
      {save.error || dismiss.error ? (
        <div className="mb-4">
          <Alert>{errorMessage(save.error ?? dismiss.error)}</Alert>
        </div>
      ) : null}
      {recommendations.isPending ? (
        <LoadingState label="Loading recommendations" />
      ) : recommendations.isError ? (
        <ErrorState error={recommendations.error} onRetry={() => void recommendations.refetch()} />
      ) : recommendations.data.length === 0 && noSources ? (
        <EmptyState
          icon={Sparkles}
          title="No job sources are configured yet."
          description="Job alerts can’t find jobs until a supported job source is configured on the server. Sample data is never shown in production. You can still add jobs yourself and get matching and resume recommendations for them."
        >
          <Link to="/jobs/new" className={buttonClasses('primary', 'md')}>
            Add a job
          </Link>
        </EmptyState>
      ) : recommendations.data.length === 0 && filtered ? (
        <EmptyState
          icon={Sparkles}
          title="No recommendations match these filters"
          description="Try removing a filter or lowering the minimum match score."
        />
      ) : recommendations.data.length === 0 && hasRun ? (
        <EmptyState
          icon={Sparkles}
          title="No matching real jobs were found."
          description="Your alerts searched the configured job sources, but no posting met your minimum match score yet. Alerts keep searching on their schedule; you can also widen an alert’s keywords or locations."
        >
          <Link to="/job-alerts" className={buttonClasses('primary', 'md')}>
            Review job alerts
          </Link>
        </EmptyState>
      ) : recommendations.data.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No recommendations yet"
          description="Create a job alert and run it. Real jobs that meet your minimum match score appear here, each with the resume to use."
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

function RecommendationFilters({
  query,
  alerts,
  sources,
  filtered,
  onChange,
}: {
  query: RecommendationQuery;
  alerts: { id: string; name: string }[];
  sources: { key: string; name: string }[];
  filtered: boolean;
  onChange: (changes: Record<string, string | undefined>) => void;
}) {
  const [text, setText] = useState({
    title: query.title ?? '',
    company: query.company ?? '',
    location: query.location ?? '',
  });
  const apply = (e: FormEvent) => {
    e.preventDefault();
    onChange(text);
  };

  return (
    <form
      aria-label="Filter recommendations"
      onSubmit={apply}
      className="mb-5 grid gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          label="Show"
          value={query.status === 'ACTIVE' ? '' : query.status}
          onChange={(v) => onChange({ status: v })}
          options={FILTERS.map((f) => ({
            value: f.value === 'ACTIVE' ? '' : f.value,
            label: f.label,
          }))}
        />
        <FilterSelect
          label="Source"
          value={query.source ?? ''}
          onChange={(v) => onChange({ source: v })}
          options={[
            { value: '', label: 'All sources' },
            ...sources.map((s) => ({ value: s.key, label: s.name })),
          ]}
        />
        <FilterSelect
          label="Work mode"
          value={query.workMode ?? ''}
          onChange={(v) => onChange({ workMode: v })}
          options={[
            { value: '', label: 'Any' },
            ...WORK_MODES.map((m) => ({ value: m, label: WORK_MODE_LABELS[m] })),
          ]}
        />
        <FilterSelect
          label={`Minimum ${MATCH_SCORE_NAME}`}
          value={query.minScore ? String(query.minScore) : ''}
          onChange={(v) => onChange({ minScore: v })}
          options={[
            { value: '', label: 'Any score' },
            ...MIN_SCORES.map((n) => ({ value: String(n), label: `${n}% or more` })),
          ]}
        />
        {alerts.length > 0 ? (
          <FilterSelect
            label="Alert"
            value={query.alertId ?? ''}
            onChange={(v) => onChange({ alertId: v })}
            options={[
              { value: '', label: 'All alerts' },
              ...alerts.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {TEXT_FILTERS.map(([key, label]) => (
          <TextField
            key={key}
            label={label}
            value={text[key]}
            maxLength={100}
            onChange={(e) => setText({ ...text, [key]: e.target.value })}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" size="sm">
          Apply filters
        </Button>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                source: undefined,
                workMode: undefined,
                minScore: undefined,
                title: undefined,
                company: undefined,
                location: undefined,
              })
            }
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
