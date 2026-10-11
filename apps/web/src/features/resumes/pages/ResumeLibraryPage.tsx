import { RESUME_SEARCH_MAX_LENGTH, type ResumeSort } from '@job-assist/shared';
import { FilePlus2, FileText, Search, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { cn } from '../../../shared/ui/cn';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { controlClasses } from '../../../shared/ui/field-styles';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { CreateFromProfileDialog } from '../components/CreateFromProfileDialog';
import { ResumeCard } from '../components/ResumeCard';
import { UploadResumeDialog } from '../components/UploadResumeDialog';
import { useResumeList } from '../hooks/useResumes';
import type { ResumeListFilter } from '../services/resumes-api';

const FILTERS: { id: Exclude<ResumeListFilter, 'ALL'>; label: string }[] = [
  { id: 'ACTIVE', label: 'Active' },
  { id: 'ARCHIVED', label: 'Archived' },
];

const SORT_LABELS: Record<ResumeSort, string> = {
  updated: 'Recently updated',
  created: 'Newest first',
  name: 'Name (A–Z)',
};

/** Returns `value` once it has stopped changing for `delayMs`. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function ResumeLibraryPage() {
  const [filter, setFilter] = useState<Exclude<ResumeListFilter, 'ALL'>>('ACTIVE');
  const [uploading, setUploading] = useState(false);
  const [fromProfile, setFromProfile] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<ResumeSort>('updated');
  const q = useDebounced(search, 300);
  const resumes = useResumeList({ status: filter, q, category, sort });
  // Unfiltered list for this tab: supplies the category options and tells "no resumes" from "no matches".
  const unfiltered = useResumeList({ status: filter });
  const categories = useMemo(
    () =>
      [
        ...new Set((unfiltered.data ?? []).map((r) => r.category).filter((c): c is string => !!c)),
      ].sort((a, b) => a.localeCompare(b)),
    [unfiltered.data],
  );
  const filtering = q.trim() !== '' || category !== '';

  return (
    <>
      <PageHeader
        title="Resume library"
        subtitle="Keep a resume for each kind of role. Originals are never changed — edits become new versions."
        actions={
          <>
            <Button variant="secondary" onClick={() => setFromProfile(true)}>
              <FilePlus2 className="size-4" aria-hidden />
              Create from profile
            </Button>
            <Button onClick={() => setUploading(true)}>
              <Upload className="size-4" aria-hidden />
              Add resume
            </Button>
          </>
        }
      />

      <div
        role="tablist"
        aria-label="Resume status"
        className="mb-5 inline-flex rounded-lg border border-border bg-surface p-1"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            type="button"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              filter === f.id ? 'bg-primary-soft text-primary' : 'text-muted hover:text-fg',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search resumes</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            maxLength={RESUME_SEARCH_MAX_LENGTH}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, category or tag"
            className={controlClasses(false, 'h-10 pl-9')}
          />
        </label>
        <label className="block">
          <span className="sr-only">Category</span>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="sr-only">Sort by</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value as ResumeSort)}>
            {(Object.keys(SORT_LABELS) as ResumeSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {resumes.isPending ? (
        <LoadingState label="Loading resumes" />
      ) : resumes.isError ? (
        <ErrorState error={resumes.error} onRetry={() => void resumes.refetch()} />
      ) : resumes.data.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          {filtering ? (
            <EmptyState
              icon={Search}
              title="No resumes match your search"
              description="Try another name, category or tag."
            >
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setCategory('');
                }}
              >
                Clear filters
              </Button>
            </EmptyState>
          ) : filter === 'ACTIVE' ? (
            <EmptyState
              icon={FileText}
              title="You don’t have any resumes yet."
              description="Upload your first resume to start building your resume library."
            >
              <Button onClick={() => setUploading(true)}>
                <Upload className="size-4" aria-hidden />
                Upload resume
              </Button>
            </EmptyState>
          ) : (
            <EmptyState
              icon={FileText}
              title="No archived resumes"
              description="Archived resumes are kept here with all their versions."
            />
          )}
        </div>
      ) : (
        <ul className={cn('grid gap-4', resumes.isPlaceholderData && 'opacity-60')}>
          {resumes.data.map((resume) => (
            <ResumeCard key={resume.id} resume={resume} />
          ))}
        </ul>
      )}

      <UploadResumeDialog open={uploading} onClose={() => setUploading(false)} />
      <CreateFromProfileDialog open={fromProfile} onClose={() => setFromProfile(false)} />
    </>
  );
}
