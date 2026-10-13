import {
  type JobSearchRunItem,
  type JobSearchRunStatus,
  type JobSearchStrategy,
  REMOTE_PREFERENCE_LABELS,
} from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { Spinner } from '../../../shared/ui/Spinner';

const STATUS: Record<
  JobSearchRunStatus,
  { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }
> = {
  RUNNING: { label: 'Running', tone: 'primary' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  PARTIAL: { label: 'Partly completed', tone: 'warning' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function RunStatusBadge({ status }: { status: JobSearchRunStatus }) {
  return (
    <Badge tone={STATUS[status].tone}>
      {status === 'RUNNING' ? <Spinner className="mr-1 size-3" /> : null}
      {STATUS[status].label}
    </Badge>
  );
}

/** Each run with what it found and why postings were skipped. */
export function SearchRunHistory({ runs }: { runs: JobSearchRunItem[] }) {
  return (
    <ol aria-label="Search runs" className="grid gap-3">
      {runs.map((run) => (
        <li key={run.id} className="rounded-lg border border-border p-3.5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {dateTime.format(new Date(run.startedAt))}{' '}
              <span className="font-normal text-muted">
                · {run.trigger === 'MANUAL' ? 'Run now' : 'Scheduled'}
              </span>
            </p>
            <RunStatusBadge status={run.status} />
          </div>
          {run.completedAt ? (
            <p className="mt-0.5 text-xs text-muted">
              Completed {dateTime.format(new Date(run.completedAt))} · {run.sources.length} source
              {run.sources.length === 1 ? '' : 's'} searched
            </p>
          ) : null}
          {run.status !== 'RUNNING' ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              {(
                [
                  ['Discovered', run.jobsDiscovered],
                  ['Matched your search', run.jobsFound],
                  ['New jobs added', run.jobsCreated],
                  ['Duplicates', run.duplicates],
                  ['Analysed', run.jobsAnalyzed],
                  ['Recommended', run.recommendationsCreated],
                  ['Below threshold', run.belowThreshold],
                  ['Skipped', run.jobsSkipped],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {run.searchStrategy ? <StrategySummary strategy={run.searchStrategy} /> : null}
          {run.errorMessage ? <p className="mt-2 text-danger">{run.errorMessage}</p> : null}
          {run.note ? <p className="mt-2 text-muted">{run.note}</p> : null}
          {run.sources.length > 0 ? (
            <ul aria-label="Sources searched" className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {run.sources.map((s) => (
                <li
                  key={s.sourceKey}
                  className={`rounded-md px-2 py-0.5 ${s.status === 'OK' ? 'bg-surface-muted text-muted' : 'bg-danger-soft text-danger'}`}
                  title={s.error ?? undefined}
                >
                  {s.sourceName}
                  {s.isDevelopment ? ' (sample data)' : ''}:{' '}
                  {s.status === 'OK'
                    ? s.returned !== undefined
                      ? `${s.returned} returned, ${s.found} matched`
                      : `${s.found} found`
                    : `failed — ${s.error ?? 'unavailable'}`}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** The terms a run searched for, and which came from the Career Profile. */
function StrategySummary({ strategy: s }: { strategy: JobSearchStrategy }) {
  const parts = [
    `Searched for ${s.keywords.map((k) => `“${k}”`).join(', ')}`,
    s.locations.length
      ? `in ${s.locations.join(', ')}${s.basis.locations === 'PROFILE' ? ' (from your profile)' : ''}`
      : null,
    s.remotePreference !== 'ANY'
      ? `${REMOTE_PREFERENCE_LABELS[s.remotePreference].toLowerCase()}${
          s.basis.remotePreference === 'PROFILE' ? ' (from your profile)' : ''
        }`
      : null,
  ].filter(Boolean);
  return (
    <p className="mt-2 text-xs text-muted">
      {parts.join(' · ')}.
      {s.alternateTitles.length
        ? ` Alternate titles from your Career Profile: ${s.alternateTitles.join(', ')}.`
        : ''}
    </p>
  );
}
