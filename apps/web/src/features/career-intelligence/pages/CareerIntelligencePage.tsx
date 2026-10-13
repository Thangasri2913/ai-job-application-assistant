import {
  type BreakdownRow,
  type CareerInsightItem,
  type CareerInsightsResponse,
  type CareerIntelligenceReport,
  REJECTION_CATEGORY_LABELS,
} from '@job-assist/shared';
import { BarChart3, Info, RefreshCw } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { DataKindBadge } from '../components/DataKindBadge';
import { formatRate } from '../components/format';
import { FunnelChart } from '../components/FunnelChart';
import { InsightCards } from '../components/InsightCards';
import { KpiTiles } from '../components/KpiTiles';
import { OutcomeTable } from '../components/OutcomeTable';
import { SectionBoundary } from '../components/SectionBoundary';
import { SkillTable } from '../components/SkillTable';
import {
  useCareerInsights,
  useCareerReport,
  useRefreshInsights,
} from '../hooks/useCareerIntelligence';

/** A dashboard card with a heading, an optional description and a data-kind label. */
function Section({
  id,
  title,
  description,
  kind,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  kind: 'observed' | 'recommendation';
  children: ReactNode;
}) {
  return (
    <SectionBoundary name={title}>
      {/* min-w-0: grid items must not grow to their tables' width (tables scroll inside). */}
      <Card aria-labelledby={`${id}-heading`} className="min-w-0">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-heading`} className="text-base font-semibold">
              {title}
            </h2>
            <DataKindBadge kind={kind} />
          </div>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        {children}
      </Card>
    </SectionBoundary>
  );
}

const hasComparableGroups = (rows: BreakdownRow[]) =>
  rows.filter((r) => r.reliable && !r.key.startsWith('_')).length >= 2;

export function CareerIntelligencePage() {
  const report = useCareerReport();
  const insights = useCareerInsights();

  return (
    <>
      <PageHeader
        title="Career Intelligence"
        subtitle="What your own applications, outcomes and target jobs show — computed from your recorded data."
      />
      {report.isPending ? (
        <LoadingState label="Loading career intelligence" />
      ) : report.isError ? (
        <div className="grid gap-6">
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
          <InsightsSection />
        </div>
      ) : report.data.totals.tracked === 0 && report.data.totals.analysedTargetJobs === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nothing to analyse yet"
          description="Add and analyse jobs, track your applications and record their outcomes. Analytics and insights appear here as your history grows."
        >
          <Link to="/jobs" className={buttonClasses('primary', 'md')}>
            Go to Jobs
          </Link>
        </EmptyState>
      ) : (
        <Dashboard r={report.data} insights={insights.data?.insights ?? []} />
      )}
    </>
  );
}

function Dashboard({
  r,
  insights,
}: {
  r: CareerIntelligenceReport;
  insights: CareerInsightItem[];
}) {
  const min = r.limitations.minimumGroupSize;
  const skillPriorities = insights.filter((i) => i.category === 'SKILL_PRIORITY');
  const notEnough = (noun: string) => (
    <p className="mb-3 text-sm text-muted">
      Not enough data yet to compare {noun}: each needs at least {min} submitted applications before
      its rates are compared. Counts so far are shown below.
    </p>
  );

  return (
    <>
      <section
        aria-label="Data limitations"
        className="mb-6 rounded-xl bg-surface-muted p-4 text-sm"
      >
        <p className="mb-1.5 flex items-center gap-2 font-medium">
          <Info className="size-4" aria-hidden />
          About this data
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {r.limitations.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
          <li>
            <span className="font-medium text-fg">Observed data</span> is counted from your own
            records. <span className="font-medium text-fg">Recommendations</span> are suggestions
            derived from that data, each with the evidence behind it.
          </li>
        </ul>
      </section>

      <SectionBoundary name="Overview">
        <section aria-label="Overview" className="mb-6">
          <KpiTiles totals={r.totals} />
        </section>
      </SectionBoundary>

      <div className="mb-6 grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Section
          id="funnel"
          title="Application funnel"
          kind="observed"
          description="Each stage counts applications that reached it or a later one"
        >
          {r.totals.tracked === 0 ? (
            <p className="text-sm text-muted">No applications tracked yet.</p>
          ) : (
            <>
              <FunnelChart stages={r.funnel.stages} />
              {r.funnel.rejectionCategories.length > 0 ? (
                <p className="mt-4 text-sm text-muted">
                  Rejections:{' '}
                  {r.funnel.rejectionCategories
                    .map(
                      (c) =>
                        `${c.category === 'NOT_RECORDED' ? 'reason not recorded' : REJECTION_CATEGORY_LABELS[c.category]} (${c.count})`,
                    )
                    .join(', ')}
                </p>
              ) : null}
            </>
          )}
        </Section>
        <SectionBoundary name="Career insights">
          <InsightsSection />
        </SectionBoundary>
      </div>

      <div className="grid gap-6">
        <Section
          id="resumes"
          title="Resume performance"
          kind="observed"
          description="By the exact resume version used"
        >
          {r.resumes.length === 0 ? (
            <p className="text-sm text-muted">No reviewed resumes or applications yet.</p>
          ) : (
            <OutcomeTable
              caption="Resume performance"
              labelHeader="Resume version"
              extraHeaders={['Jobs matched', 'Avg. match']}
              minimumGroupSize={min}
              rows={r.resumes.map((v) => ({
                ...v,
                key: v.resumeVersionId,
                label: (
                  <span>
                    <Link to={`/resumes/${v.resumeId}`} className="hover:underline">
                      {v.resumeName}
                    </Link>{' '}
                    <span className="text-muted">v{v.versionNumber}</span>
                    {v.resumeArchived ? <span className="text-muted"> · archived</span> : null}
                    {!v.isCurrent && !v.resumeArchived ? (
                      <span className="text-muted"> · older version</span>
                    ) : null}
                  </span>
                ),
                extra: [
                  v.jobsMatched,
                  v.averageMatchScore === null ? '—' : `${v.averageMatchScore}%`,
                ],
              }))}
            />
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section id="roles" title="Target role performance" kind="observed">
            {r.breakdowns.role.length === 0 ? (
              <p className="text-sm text-muted">No submitted applications yet.</p>
            ) : (
              <>
                {hasComparableGroups(r.breakdowns.role) ? null : notEnough('roles')}
                <OutcomeTable
                  caption="Target role performance"
                  labelHeader="Role"
                  minimumGroupSize={min}
                  rows={r.breakdowns.role}
                />
              </>
            )}
          </Section>
          <Section id="sources" title="Job source performance" kind="observed">
            {r.breakdowns.source.length === 0 ? (
              <p className="text-sm text-muted">No submitted applications yet.</p>
            ) : (
              <>
                {hasComparableGroups(r.breakdowns.source) ? null : notEnough('sources')}
                <OutcomeTable
                  caption="Job source performance"
                  labelHeader="Source"
                  minimumGroupSize={min}
                  rows={r.breakdowns.source}
                />
              </>
            )}
          </Section>
        </div>

        <Section
          id="match"
          title="Match score performance"
          kind="observed"
          description="Outcomes by the match score stored when you applied"
        >
          {r.matchScores.buckets.length === 0 ? (
            <p className="text-sm text-muted">No submitted applications with a match score yet.</p>
          ) : (
            <>
              {r.matchScores.alignedShare !== null ? (
                <p className="mb-3 text-sm">
                  {formatRate(r.matchScores.alignedShare)} of your scored applications went to jobs
                  where your resume scored 65 or higher.
                </p>
              ) : null}
              <OutcomeTable
                caption="Outcomes by match score"
                labelHeader="Match score"
                minimumGroupSize={min}
                rows={r.matchScores.buckets.map((b) => ({ ...b, label: `${b.min}–${b.max}` }))}
              />
            </>
          )}
        </Section>

        <Section
          id="skills"
          title="Skill intelligence"
          kind="observed"
          description={`Across ${r.totals.analysedTargetJobs} analysed target job${r.totals.analysedTargetJobs === 1 ? '' : 's'}`}
        >
          {r.skills.length === 0 ? (
            <p className="text-sm text-muted">Analyse jobs to see which skills they ask for.</p>
          ) : (
            <>
              <SkillTable skills={r.skills} />
              <p className="mt-3 text-xs text-muted">
                Coverage reflects what your best-matching resume states. “Worth strengthening” marks
                a skill that appears often with limited evidence.
              </p>
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
                  Suggested skill priorities <DataKindBadge kind="recommendation" />
                </p>
                {skillPriorities.length === 0 ? (
                  <p className="text-sm text-muted">
                    No skill priorities suggested — none of the frequently requested skills lacks
                    evidence in your resumes, or there isn’t enough data yet.
                  </p>
                ) : (
                  <ul aria-label="Suggested skill priorities" className="grid gap-2 text-sm">
                    {skillPriorities.map((i) => (
                      <li key={i.id}>
                        <p className="font-medium">{i.title}</p>
                        <p className="text-muted">{i.recommendedAction}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section id="patterns" title="Patterns" kind="observed">
            {r.patterns.length === 0 ? (
              <p className="text-sm text-muted">
                No reliable patterns yet. They appear once enough outcomes are recorded.
              </p>
            ) : (
              <ul aria-label="Patterns" className="grid gap-3 text-sm">
                {r.patterns.map((p) => (
                  <li key={p.kind}>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-muted">{p.finding}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section
            id="topics"
            title="Interview practice topics"
            kind="observed"
            description="Practice scores, not measurements"
          >
            {r.interviewTopics.length === 0 ? (
              <p className="text-sm text-muted">Complete a practice session to see topic scores.</p>
            ) : (
              <ul aria-label="Interview practice topics" className="grid gap-1.5 text-sm">
                {r.interviewTopics.map((t) => (
                  <li key={t.topic} className="flex justify-between gap-3">
                    <span>{t.topic}</span>
                    <span className="text-muted tabular-nums">
                      {t.averageScore}/100 · {t.sessions} session{t.sessions === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted">Calculated {formatDate(r.calculatedAt)}.</p>
    </>
  );
}

function InsightsSection() {
  const insights = useCareerInsights();
  const refresh = useRefreshInsights();
  // The run this page's refresh started: feedback is derived from its status (no effects).
  const [refreshRunId, setRefreshRunId] = useState<string | null>(null);
  const run = insights.data?.run ?? null;
  const ownRun = refreshRunId !== null && run?.id === refreshRunId;
  const waiting = ownRun && (insights.data?.generating ?? false);
  const refreshed = ownRun && run?.status === 'COMPLETED';

  return (
    <Card aria-labelledby="insights-heading" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 id="insights-heading" className="text-base font-semibold">
          Career insights
        </h2>
        <DataKindBadge kind="recommendation" />
      </div>
      {insights.isPending ? (
        <LoadingState label="Loading insights" />
      ) : insights.isError ? (
        <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
      ) : (
        <InsightsBody
          data={insights.data}
          refreshing={refresh.isPending || waiting}
          refreshError={refresh.error ? errorMessage(refresh.error) : null}
          refreshed={refreshed}
          onRefresh={() =>
            refresh.mutate(undefined, {
              onSuccess: (data) => setRefreshRunId(data.run?.id ?? null),
            })
          }
        />
      )}
    </Card>
  );
}

function InsightsBody({
  data,
  refreshing,
  refreshError,
  refreshed,
  onRefresh,
}: {
  data: CareerInsightsResponse;
  refreshing: boolean;
  refreshError: string | null;
  refreshed: boolean;
  onRefresh: () => void;
}) {
  const run = data.run;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="flex flex-wrap items-center gap-1.5">
          {run?.source ? (
            <Badge tone="neutral">{run.source === 'AI' ? 'AI-generated' : 'Rule-based'}</Badge>
          ) : null}
          {run?.generatedAt ? <span>Generated {formatDate(run.generatedAt)}</span> : null}
          {data.stale && !data.generating ? <Badge tone="warning">Data changed since</Badge> : null}
          {data.generating ? <span role="status">Updating insights…</span> : null}
        </span>
        <Button
          size="sm"
          variant="secondary"
          loading={refreshing}
          disabled={refreshing || data.generating}
          onClick={onRefresh}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh insights
        </Button>
      </div>
      {refreshError ? <Alert>{refreshError}</Alert> : null}
      {refreshed && !refreshError ? <Alert tone="success">Insights updated.</Alert> : null}
      {run?.note ? <p className="text-xs text-muted">{run.note}</p> : null}
      {run?.status === 'FAILED' && data.insights.length === 0 ? (
        <Alert>{run.error ?? 'The insights could not be generated.'}</Alert>
      ) : null}
      {data.insights.length > 0 ? (
        <InsightCards insights={data.insights} />
      ) : data.generating ? null : (
        <p className="text-sm text-muted">
          No insights yet. They are generated from your recorded data.
        </p>
      )}
      <p className="text-xs text-muted">{data.disclaimer}</p>
    </div>
  );
}
