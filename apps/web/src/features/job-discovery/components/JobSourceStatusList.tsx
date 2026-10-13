import { JOB_SOURCE_STATUS_LABELS, type JobSourceItem } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { isSourceFailing } from './source-status';

const TONE = {
  ACTIVE: 'success',
  NOT_CONFIGURED: 'warning',
  DEVELOPMENT_ONLY: 'neutral',
  NOT_INTEGRATED: 'neutral',
} as const;

const ORIGIN = {
  EMPLOYER: 'Employers’ own job boards',
  AGGREGATOR: 'Job search service',
  SAMPLE: 'Sample data',
} as const;

/** Every job source and whether alerts search it. Shows no settings or credentials. */
export function JobSourceStatusList({ sources }: { sources: JobSourceItem[] }) {
  return (
    <section aria-labelledby="job-sources-title" className="rounded-xl border border-border p-4">
      <h2 id="job-sources-title" className="text-sm font-semibold">
        Job sources
      </h2>
      <ul aria-label="Job sources" className="mt-3 grid gap-2.5">
        {sources.map((s) => {
          const failing = isSourceFailing(s);
          return (
            <li key={s.key} className="min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.name}</span>
                <Badge tone={TONE[s.status]}>{JOB_SOURCE_STATUS_LABELS[s.status]}</Badge>
                {failing ? <Badge tone="danger">Temporarily unavailable</Badge> : null}
                {s.postingOrigin && s.status !== 'NOT_INTEGRATED' ? (
                  <span className="text-xs text-muted">{ORIGIN[s.postingOrigin]}</span>
                ) : null}
              </div>
              {s.description ? <p className="mt-0.5 text-xs text-muted">{s.description}</p> : null}
              {failing && s.lastError ? (
                <p className="mt-0.5 text-xs text-danger">{s.lastError}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
