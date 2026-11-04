import { LEARNING_DIFFICULTY_LABELS } from '@job-assist/shared';
import { PROJECT_STATUS_LABELS } from '../format';
import { Hammer } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { LearnNav } from '../components/LearnNav';
import { useProjectChallenges } from '../hooks/useLearn';

export function ProjectsPage() {
  const query = useProjectChallenges();
  return (
    <>
      <PageHeader
        title="Project challenges"
        subtitle="Practical projects with acceptance criteria, test cases and a self-review checklist — built on your own machine."
      />
      <LearnNav />
      <p className="mb-6 rounded-lg bg-surface-muted px-3.5 py-3 text-sm text-muted">
        Progress is self-reported. JobAssist does not run, upload or check your code, so a completed
        project is your own judgement, not a verification.
      </p>
      {query.isPending ? (
        <LoadingState label="Loading projects" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.challenges.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title="No project challenges yet"
          description="Check back later."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {query.data.challenges.map((c) => (
            <li key={c.id}>
              <article
                aria-labelledby={`pc-${c.id}`}
                className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
              >
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{LEARNING_DIFFICULTY_LABELS[c.difficulty]}</Badge>
                  <Badge>About {c.estimatedHours} hours</Badge>
                  {c.progress.status !== 'NOT_STARTED' ? (
                    <Badge tone={c.progress.status === 'COMPLETED' ? 'success' : 'primary'}>
                      {PROJECT_STATUS_LABELS[c.progress.status]}
                    </Badge>
                  ) : null}
                </div>
                <h2 id={`pc-${c.id}`} className="text-base font-semibold">
                  {c.title}
                </h2>
                <p className="text-sm text-muted">{c.summary}</p>
                <ul aria-label="Skills practised" className="flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <li key={s.id}>
                      <Badge>{s.name}</Badge>
                    </li>
                  ))}
                </ul>
                <Link
                  to={`/learn/projects/${c.id}`}
                  className={buttonClasses('primary', 'sm', 'mt-auto self-start')}
                  aria-label={`Open ${c.title}`}
                >
                  {c.progress.status === 'NOT_STARTED' ? 'View challenge' : 'Continue'}
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
