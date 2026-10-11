import { APPLICATION_STATUS_LABELS, APPLICATION_STATUSES } from '@job-assist/shared';
import {
  ArrowLeftRight,
  ClipboardCheck,
  BadgeCheck,
  BarChart3,
  Briefcase,
  CheckCircle2,
  FileText,
  History,
  KanbanSquare,
  type LucideIcon,
  Sparkles,
  Star,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/auth-context';
import { CompletionCard } from '../../career-profile/components/CompletionCard';
import { Badge } from '../../../shared/ui/Badge';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { formatDate } from '../../../shared/ui/format';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { useDashboardSummary } from '../services/dashboard-api';

function Stat({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  to?: string;
}) {
  const body = (
    <div className="flex items-center gap-3.5">
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"
      >
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-xl font-semibold tabular-nums">{value}</div>
        <div className="text-sm text-muted">{label}</div>
      </div>
    </div>
  );
  return to ? (
    <Link
      to={to}
      className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl border border-border bg-surface p-5">{body}</div>
  );
}

/** Every number here is computed from the user's own data. Nothing is estimated or padded. */
export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(/\s+/)[0];
  const summary = useDashboardSummary();

  const steps: {
    icon: LucideIcon;
    title: string;
    description: string;
    to?: string;
    done?: boolean;
  }[] = summary.data
    ? [
        {
          icon: BadgeCheck,
          title: 'Build your career profile',
          description: 'Your experience, skills and goals in one place.',
          to: '/profile',
          done: summary.data.profileCompletion.percentage >= 80,
        },
        {
          icon: FileText,
          title: 'Add your resumes',
          description: 'Keep every variant — Angular, Full Stack, General…',
          to: '/resumes',
          done: summary.data.resumes.active > 0,
        },
        {
          icon: Briefcase,
          title: 'Add a job',
          description: 'Paste a job description to analyse it.',
        },
        {
          icon: ArrowLeftRight,
          title: 'Find your best resume',
          description: 'See which resume fits the job and why.',
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : 'Welcome'}
        subtitle="Your job search at a glance."
      />

      {summary.isPending ? (
        <LoadingState label="Loading your overview" />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat
              label="Profile completion"
              value={`${summary.data.profileCompletion.percentage}%`}
              icon={BadgeCheck}
              to="/profile"
            />
            <Stat
              label={`Active resumes · ${summary.data.resumes.total} total`}
              value={String(summary.data.resumes.active)}
              icon={FileText}
              to="/resumes"
            />
            <Stat
              label="Resumes needing review"
              value={String(summary.data.resumes.needsReview)}
              icon={ClipboardCheck}
              to="/resumes"
            />
            <Stat
              label="Default resume"
              value={summary.data.resumes.defaultResume?.name ?? 'Not set'}
              icon={Star}
              to={
                summary.data.resumes.defaultResume
                  ? `/resumes/${summary.data.resumes.defaultResume.id}`
                  : '/resumes'
              }
            />
            <Stat
              label={
                summary.data.resumes.latestUpload
                  ? `Latest upload · ${formatDate(summary.data.resumes.latestUpload.uploadedAt)}`
                  : 'Latest upload'
              }
              value={summary.data.resumes.latestUpload?.name ?? 'None yet'}
              icon={Upload}
              to={
                summary.data.resumes.latestUpload
                  ? `/resumes/${summary.data.resumes.latestUpload.id}`
                  : '/resumes'
              }
            />
            <Stat
              label={
                summary.data.resumes.recentlyUpdated
                  ? `Recently updated · ${formatDate(summary.data.resumes.recentlyUpdated.updatedAt)}`
                  : 'Recently updated'
              }
              value={summary.data.resumes.recentlyUpdated?.name ?? 'None yet'}
              icon={History}
              to={
                summary.data.resumes.recentlyUpdated
                  ? `/resumes/${summary.data.resumes.recentlyUpdated.id}`
                  : '/resumes'
              }
            />
          </div>

          <div className="mb-6 grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
            <Card aria-labelledby="setup-heading">
              <CardHeader id="setup-heading" title="Get set up" />
              <ol className="grid gap-1">
                {steps.map(({ icon: Icon, title, description, to, done }, index) => {
                  const content = (
                    <>
                      <span
                        aria-hidden
                        className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"
                      >
                        <Icon className="size-4.5" />
                      </span>
                      <div>
                        <div className="text-sm font-medium">
                          {index + 1}. {title}
                        </div>
                        <div className="text-sm text-muted">{description}</div>
                      </div>
                      {done ? (
                        <CheckCircle2 className="size-5 text-success" aria-label="Done" />
                      ) : to ? (
                        <Badge tone="primary">Start</Badge>
                      ) : (
                        <Badge>Coming soon</Badge>
                      )}
                    </>
                  );
                  return (
                    <li key={title}>
                      {to ? (
                        <Link
                          to={to}
                          className="-mx-2 grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-lg px-2 py-2.5 hover:bg-surface-muted"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3.5 py-2.5">
                          {content}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Card>
            <CompletionCard completion={summary.data.profileCompletion} compact />
          </div>
        </>
      )}

      <Card aria-labelledby="recommendations-heading" className="mb-6">
        <CardHeader
          id="recommendations-heading"
          title="New recommendations"
          description="From your job alerts, by match level"
        />
        {summary.data && summary.data.recommendations.new > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <dl className="flex flex-wrap gap-6">
              {(
                [
                  ['Strong (70%+)', summary.data.recommendations.strong, 'text-success'],
                  ['Moderate (50–69%)', summary.data.recommendations.moderate, 'text-warning'],
                  ['Low (under 50%)', summary.data.recommendations.low, 'text-muted'],
                ] as const
              ).map(([label, value, tone]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</dd>
                </div>
              ))}
            </dl>
            <Link to="/recommendations?status=NEW" className="text-sm text-primary hover:underline">
              Review {summary.data.recommendations.new} new recommendation
              {summary.data.recommendations.new === 1 ? '' : 's'}
            </Link>
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No new recommendations"
            description="Job alerts search for jobs on your schedule and recommend the ones that match your resumes."
          >
            <Link to="/job-alerts" className="text-sm text-primary hover:underline">
              Manage job alerts
            </Link>
          </EmptyState>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card aria-labelledby="pipeline-heading">
          <CardHeader id="pipeline-heading" title="Application pipeline" />
          <ul aria-label="Pipeline stages" className="flex flex-wrap gap-1.5">
            {APPLICATION_STATUSES.map((status) => {
              const count = summary.data?.applications.byStatus[status];
              return (
                <li
                  key={status}
                  className="rounded-md bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted"
                >
                  <span>{APPLICATION_STATUS_LABELS[status]}</span>
                  {count !== undefined ? (
                    <span
                      className={`ml-1.5 tabular-nums ${count > 0 ? 'text-fg' : ''}`}
                      aria-label={`${count} applications`}
                    >
                      {count}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {summary.data && summary.data.applications.total > 0 ? (
            <p className="mt-4 text-sm text-muted">
              {summary.data.applications.total} active application
              {summary.data.applications.total === 1 ? '' : 's'}
              {summary.data.applications.archived > 0
                ? ` · ${summary.data.applications.archived} archived`
                : ''}{' '}
              ·{' '}
              <Link to="/applications" className="text-primary hover:underline">
                View applications
              </Link>
            </p>
          ) : (
            <EmptyState
              icon={KanbanSquare}
              title="No applications tracked yet"
              description="Open a job and choose “Track application” to record where you applied and with which resume."
            />
          )}
        </Card>

        <Card aria-labelledby="insights-heading">
          <CardHeader id="insights-heading" title="Insights" />
          <EmptyState
            icon={BarChart3}
            title="Nothing to measure yet"
            description="Response, interview and offer rates are calculated only from your real application history."
          />
        </Card>
      </div>
    </>
  );
}
