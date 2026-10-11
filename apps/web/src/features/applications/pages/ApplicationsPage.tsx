import {
  APPLICATION_SEARCH_MAX_LENGTH,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUSES,
  type ApplicationSort,
  type ApplicationStatus,
} from '@job-assist/shared';
import { KanbanSquare, Search, Table2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { cn } from '../../../shared/ui/cn';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { controlClasses } from '../../../shared/ui/field-styles';
import { formatDate, formatDay } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { ApplicationCard } from '../components/ApplicationCard';
import { ApplicationStatusBadge } from '../components/application-status';
import { useApplications } from '../hooks/useApplications';
import type { ApplicationArchiveFilter } from '../services/applications-api';

const SORT_LABELS: Record<ApplicationSort, string> = {
  updated: 'Recently updated',
  created: 'Newest first',
  applied: 'Applied date',
  title: 'Job title (A–Z)',
};

/** Board columns: the main pipeline; other statuses appear in the table view. */
const BOARD: ApplicationStatus[] = [
  'SAVED',
  'PREPARING',
  'APPLIED',
  'ASSESSMENT',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
];

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function ApplicationsPage() {
  const [archived, setArchived] = useState<ApplicationArchiveFilter>('ACTIVE');
  const [status, setStatus] = useState<ApplicationStatus | ''>('');
  const [search, setSearch] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [sort, setSort] = useState<ApplicationSort>('updated');
  const [view, setView] = useState<'table' | 'board'>('table');
  const q = useDebounced(search, 300);
  const apps = useApplications({ archived, status, q, appliedFrom, appliedTo, sort });
  const filtering = Boolean(q.trim() || status || appliedFrom || appliedTo);

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle="Applications you’ve sent or are preparing, each with the exact resume version used. You apply on the employer’s site; this is your record."
        actions={
          <Link to="/jobs" className={buttonClasses('secondary', 'md')}>
            Track from a job
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 lg:grid-cols-[auto_1fr_auto_auto_auto_auto_auto]">
        <div
          role="tablist"
          aria-label="Archive"
          className="inline-flex rounded-lg border border-border bg-surface p-1"
        >
          {(['ACTIVE', 'ARCHIVED'] as const).map((a) => (
            <button
              key={a}
              role="tab"
              type="button"
              aria-selected={archived === a}
              onClick={() => setArchived(a)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                archived === a ? 'bg-primary-soft text-primary' : 'text-muted hover:text-fg',
              )}
            >
              {a === 'ACTIVE' ? 'Active' : 'Archived'}
            </button>
          ))}
        </div>
        <label className="relative block">
          <span className="sr-only">Search applications</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            maxLength={APPLICATION_SEARCH_MAX_LENGTH}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job, company or resume"
            className={controlClasses(false, 'h-10 pl-9')}
          />
        </label>
        <label className="block">
          <span className="sr-only">Status</span>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus | '')}
          >
            <option value="">All statuses</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          <span className="text-muted">Applied from</span>
          <input
            type="date"
            aria-label="Applied from"
            value={appliedFrom}
            onChange={(e) => setAppliedFrom(e.target.value)}
            className={controlClasses(false, 'h-10 w-auto')}
          />
        </label>
        <label className="flex items-center gap-1 text-sm">
          <span className="text-muted">to</span>
          <input
            type="date"
            aria-label="Applied to"
            value={appliedTo}
            onChange={(e) => setAppliedTo(e.target.value)}
            className={controlClasses(false, 'h-10 w-auto')}
          />
        </label>
        <label className="block">
          <span className="sr-only">Sort by</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value as ApplicationSort)}>
            {(Object.keys(SORT_LABELS) as ApplicationSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
        <div
          role="group"
          aria-label="View"
          className="inline-flex rounded-lg border border-border bg-surface p-1"
        >
          <button
            type="button"
            aria-pressed={view === 'table'}
            aria-label="Table view"
            onClick={() => setView('table')}
            className={cn(
              'rounded-md px-2 py-1.5',
              view === 'table' ? 'bg-primary-soft text-primary' : 'text-muted',
            )}
          >
            <Table2 className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={view === 'board'}
            aria-label="Board view"
            onClick={() => setView('board')}
            className={cn(
              'rounded-md px-2 py-1.5',
              view === 'board' ? 'bg-primary-soft text-primary' : 'text-muted',
            )}
          >
            <KanbanSquare className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {apps.isPending ? (
        <LoadingState label="Loading applications" />
      ) : apps.isError ? (
        <ErrorState error={apps.error} onRetry={() => void apps.refetch()} />
      ) : apps.data.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          {filtering ? (
            <EmptyState
              icon={Search}
              title="No applications match these filters"
              description="Try another search, status or date range."
            />
          ) : archived === 'ARCHIVED' ? (
            <EmptyState
              icon={KanbanSquare}
              title="No archived applications"
              description="Archived applications keep their full history."
            />
          ) : (
            <EmptyState
              icon={KanbanSquare}
              title="No applications tracked yet"
              description="Open a job and choose “Track application” after you apply (or while you prepare)."
            >
              <Link to="/jobs" className={buttonClasses('primary', 'md')}>
                Go to jobs
              </Link>
            </EmptyState>
          )}
        </div>
      ) : view === 'board' ? (
        <div
          className="grid auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2"
          aria-label="Application board"
        >
          {BOARD.map((s) => {
            const items = apps.data.filter((a) => a.status === s);
            return (
              <section
                key={s}
                aria-label={APPLICATION_STATUS_LABELS[s]}
                className="rounded-xl bg-surface-muted/60 p-2"
              >
                <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                  {APPLICATION_STATUS_LABELS[s]}{' '}
                  <span className="text-muted tabular-nums">{items.length}</span>
                </h2>
                <ul className="grid gap-2">
                  {items.map((a) => (
                    <ApplicationCard key={a.id} application={a} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div
          className={cn(
            'overflow-x-auto rounded-2xl border border-border bg-surface px-4',
            apps.isPlaceholderData && 'opacity-60',
          )}
        >
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="text-xs tracking-wide text-muted uppercase">
                <th className="py-3 pr-3 font-semibold">Job</th>
                <th className="py-3 pr-3 font-semibold">Company</th>
                <th className="py-3 pr-3 font-semibold">Resume used</th>
                <th className="py-3 pr-3 font-semibold">Status</th>
                <th className="py-3 pr-3 font-semibold">Applied</th>
                <th className="py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {apps.data.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-3 pr-3">
                    <Link
                      to={`/applications/${a.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {a.jobTitle}
                    </Link>
                  </td>
                  <td className="py-3 pr-3 text-sm">{a.companyName}</td>
                  <td className="py-3 pr-3 text-sm">
                    {a.resume.resumeName}{' '}
                    <span className="text-muted">v{a.resume.versionNumber}</span>
                  </td>
                  <td className="py-3 pr-3">
                    <ApplicationStatusBadge status={a.status} />
                  </td>
                  <td className="py-3 pr-3 text-sm text-muted">
                    {a.appliedAt ? formatDay(a.appliedAt) : '—'}
                  </td>
                  <td className="py-3 text-sm text-muted">{formatDate(a.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
