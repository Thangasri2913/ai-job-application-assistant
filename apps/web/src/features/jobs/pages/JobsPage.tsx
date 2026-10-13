import {
  JOB_SEARCH_MAX_LENGTH,
  MATCH_LEVEL_LABELS,
  type JobSort,
  type JobSummary,
} from '@job-assist/shared';
import { Briefcase, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { cn } from '../../../shared/ui/cn';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { controlClasses } from '../../../shared/ui/field-styles';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { LEVEL_TONE } from '../components/match-format';
import { isAnalysing, useJobAction, useJobs } from '../hooks/useJobs';
import { jobsApi } from '../services/jobs-api';

const TABS = [
  { id: 'ACTIVE', label: 'Active' },
  { id: 'ARCHIVED', label: 'Archived' },
] as const;

const SORT_LABELS: Record<JobSort, string> = {
  created: 'Newest first',
  updated: 'Recently updated',
  match: 'Best match',
  title: 'Title (A–Z)',
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function AnalysisBadge({ job }: { job: JobSummary }) {
  if (isAnalysing(job.analysisStatus)) return <Badge tone="primary">Analysing…</Badge>;
  if (job.analysisStatus === 'FAILED') return <Badge tone="danger">Analysis failed</Badge>;
  if (!job.analysisStatus) return <Badge>Not analysed</Badge>;
  return null;
}

function JobRow({ job }: { job: JobSummary }) {
  const toggle = useJobAction(() =>
    job.status === 'ARCHIVED' ? jobsApi.restore(job.id) : jobsApi.archive(job.id),
  );
  return (
    <tr className="border-t border-border align-top">
      <td className="py-3 pr-3">
        <Link to={`/jobs/${job.id}`} className="font-medium hover:text-primary hover:underline">
          {job.title}
        </Link>
        <div className="text-sm text-muted">{job.companyName}</div>
        {job.origin === 'DISCOVERED' ? (
          <Badge tone="primary" className="mt-1">
            Discovered by a job alert{job.isSampleData ? ' · sample data' : ''}
          </Badge>
        ) : null}
      </td>
      <td className="py-3 pr-3 whitespace-nowrap">
        {job.bestMatch ? (
          <span className="inline-flex items-center gap-2">
            <span className="font-semibold tabular-nums">{job.bestMatch.score}%</span>
            <Badge tone={LEVEL_TONE[job.bestMatch.level]}>
              {MATCH_LEVEL_LABELS[job.bestMatch.level]}
            </Badge>
          </span>
        ) : (
          <AnalysisBadge job={job} />
        )}
      </td>
      <td className="py-3 pr-3 text-sm">
        {job.bestMatch?.resumeName ?? <span className="text-muted">—</span>}
        {job.selectedResumeName && job.selectedResumeName !== job.bestMatch?.resumeName ? (
          <div className="text-xs text-muted">Your choice: {job.selectedResumeName}</div>
        ) : null}
      </td>
      <td className="py-3 pr-3">
        <Badge tone={job.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {job.status === 'ACTIVE' ? 'Active' : 'Archived'}
        </Badge>
      </td>
      <td className="py-3 pr-3 text-sm whitespace-nowrap text-muted">
        {formatDate(job.createdAt)}
      </td>
      <td className="py-3 text-right whitespace-nowrap">
        <Link to={`/jobs/${job.id}`} className={buttonClasses('secondary', 'sm')}>
          Open
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="ml-1"
          loading={toggle.isPending}
          onClick={() => toggle.mutate(undefined)}
        >
          {job.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
        </Button>
      </td>
    </tr>
  );
}

export function JobsPage() {
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<JobSort>('created');
  const q = useDebounced(search, 300);
  const jobs = useJobs({ status, q, sort });

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle="Paste a job posting to see how each of your resumes compares and which one fits best."
        actions={
          <Link to="/jobs/new" className={buttonClasses('primary', 'md')}>
            <Plus className="size-4" aria-hidden />
            Add job
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Job status"
          className="inline-flex rounded-lg border border-border bg-surface p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={status === t.id}
              onClick={() => setStatus(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                status === t.id ? 'bg-primary-soft text-primary' : 'text-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="relative block min-w-56 flex-1">
          <span className="sr-only">Search jobs</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            maxLength={JOB_SEARCH_MAX_LENGTH}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, company or location"
            className={controlClasses(false, 'h-10 pl-9')}
          />
        </label>
        <label className="block">
          <span className="sr-only">Sort by</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value as JobSort)}>
            {(Object.keys(SORT_LABELS) as JobSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {jobs.isPending ? (
        <LoadingState label="Loading jobs" />
      ) : jobs.isError ? (
        <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
      ) : jobs.data.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          {q.trim() ? (
            <EmptyState
              icon={Search}
              title="No jobs match your search"
              description="Try another title or company."
            />
          ) : status === 'ACTIVE' ? (
            <EmptyState
              icon={Briefcase}
              title="You haven’t added any jobs yet."
              description="Paste a job description to analyse it and find your best-matching resume."
            >
              <Link to="/jobs/new" className={buttonClasses('primary', 'md')}>
                Add your first job
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No archived jobs"
              description="Archived jobs keep their analyses."
            />
          )}
        </div>
      ) : (
        <div
          className={cn(
            'overflow-x-auto rounded-2xl border border-border bg-surface px-4',
            jobs.isPlaceholderData && 'opacity-60',
          )}
        >
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="text-xs tracking-wide text-muted uppercase">
                <th className="py-3 pr-3 font-semibold">Job</th>
                <th className="py-3 pr-3 font-semibold">Match</th>
                <th className="py-3 pr-3 font-semibold">Best resume</th>
                <th className="py-3 pr-3 font-semibold">Status</th>
                <th className="py-3 pr-3 font-semibold">Created</th>
                <th className="py-3 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
