import {
  type CourseCatalogueQuery,
  LEARNING_CATEGORIES,
  LEARNING_CATEGORY_LABELS,
  LEARNING_DIFFICULTIES,
  LEARNING_DIFFICULTY_LABELS,
  type LearningCategory,
  type LearningDifficulty,
} from '@job-assist/shared';
import { GraduationCap, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { TextField } from '../../../shared/ui/TextField';
import { ContentNotice } from '../components/ContentNotice';
import { CourseCard } from '../components/CourseCard';
import { LearnNav } from '../components/LearnNav';
import { useCourseCatalogue, useLearningDashboard, useLearningSkills } from '../hooks/useLearn';

type Filters = Omit<CourseCatalogueQuery, 'q' | 'role' | 'status'>;

/** Waits until typing pauses before searching. */
function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function LearnPage() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const q = useDebounced(search);
  const catalogue = useCourseCatalogue({ ...filters, ...(q.trim() ? { q: q.trim() } : {}) });
  const skills = useLearningSkills();
  // Optional: marks courses already in "My learning". The catalogue works without it.
  const dashboard = useLearningDashboard();
  const progressFor = (courseId: string) =>
    dashboard.data?.courses.find((c) => c.course.id === courseId)?.progress;
  const courses = catalogue.data?.courses ?? [];
  const published = courses.filter((c) => c.status === 'PUBLISHED');
  const planned = courses.filter((c) => c.status === 'PLANNED');
  const filtered = Boolean(
    search.trim() || filters.category || filters.skill || filters.difficulty,
  );
  const clear = () => {
    setSearch('');
    setFilters({});
  };
  const setFilter = <K extends keyof Filters>(key: K, value: string) =>
    setFilters((f) => ({ ...f, [key]: (value || undefined) as Filters[K] }));

  return (
    <>
      <PageHeader
        title="Learn & Prepare"
        subtitle="Explore any course you are interested in — or get a personalised plan from your resume and target role."
      />
      <LearnNav />
      <ContentNotice />

      <Card className="mb-6">
        <form
          role="search"
          aria-label="Search and filter courses"
          className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end"
          onSubmit={(e) => e.preventDefault()}
        >
          <TextField
            label="Search courses"
            type="search"
            placeholder="e.g. SQL, prompts, testing"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            trailing={<Search className="mr-2 size-4 text-muted" aria-hidden />}
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Category</span>
            <Select
              value={filters.category ?? ''}
              onChange={(e) => setFilter('category', e.target.value as LearningCategory)}
            >
              <option value="">All categories</option>
              {LEARNING_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {LEARNING_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Skill</span>
            <Select
              value={filters.skill ?? ''}
              onChange={(e) => setFilter('skill', e.target.value)}
            >
              <option value="">All skills</option>
              {(skills.data?.skills ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Difficulty</span>
            <Select
              value={filters.difficulty ?? ''}
              onChange={(e) => setFilter('difficulty', e.target.value as LearningDifficulty)}
            >
              <option value="">All levels</option>
              {LEARNING_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {LEARNING_DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </Select>
          </label>
          {filtered ? (
            <Button type="button" variant="ghost" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
        </form>
      </Card>

      {catalogue.isPending ? (
        <LoadingState label="Loading courses" />
      ) : catalogue.isError ? (
        <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No courses match your search"
          description="Try other words, another category or fewer filters."
        >
          <Button variant="secondary" onClick={clear}>
            Clear filters
          </Button>
        </EmptyState>
      ) : (
        <div aria-busy={catalogue.isFetching} className="space-y-8">
          <p role="status" aria-live="polite" className="text-sm text-muted">
            {catalogue.isFetching
              ? 'Updating results…'
              : `${courses.length} ${courses.length === 1 ? 'course' : 'courses'} found`}
          </p>
          {published.length > 0 ? (
            <section aria-labelledby="available-courses">
              <h2 id="available-courses" className="mb-3 text-base font-semibold">
                Available courses{' '}
                <span className="font-normal text-muted">({published.length})</span>
              </h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {published.map((course) => (
                  <CourseCard key={course.id} course={course} progress={progressFor(course.id)} />
                ))}
              </ul>
            </section>
          ) : null}
          {planned.length > 0 ? (
            <section aria-labelledby="planned-courses">
              <h2 id="planned-courses" className="mb-1 text-base font-semibold">
                Planned courses <span className="font-normal text-muted">({planned.length})</span>
              </h2>
              <p className="mb-3 text-sm text-muted">
                Announced courses whose curriculum has not been written yet.
              </p>
              <ul className="grid gap-4 md:grid-cols-2">
                {planned.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
