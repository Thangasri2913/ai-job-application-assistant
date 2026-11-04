import type { ReadinessOverview } from '@job-assist/shared';
import { Link } from 'react-router';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { formatDate } from '../../../shared/ui/format';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { PROJECT_STATUS_LABELS } from '../format';

const link = 'text-primary underline-offset-2 hover:underline';

/**
 * Practice and readiness indicators on the dashboard. Each is shown on its own with what it
 * measures — they are never combined into a score or a "job-ready" label.
 */
export function ReadinessSections({ readiness }: { readiness: ReadinessOverview }) {
  const { projects, interview, skillsToPractise, jobs } = readiness;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader title="Projects" description="Self-reported progress" />
        {projects.length ? (
          <ul className="space-y-3 text-sm">
            {projects.map((p) => (
              <li key={p.challengeId}>
                <div className="flex justify-between gap-2">
                  <Link to={`/learn/projects/${p.challengeId}`} className={`font-medium ${link}`}>
                    {p.title}
                  </Link>
                  <span className="text-muted">{PROJECT_STATUS_LABELS[p.status]}</span>
                </div>
                <ProgressBar
                  value={(p.checked / p.total) * 100}
                  label={`${p.title}: acceptance criteria ticked`}
                />
                <span className="text-xs text-muted">
                  {p.checked} of {p.total} acceptance criteria ticked
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            No projects started.{' '}
            <Link to="/learn/projects" className={link}>
              Browse project challenges
            </Link>
            .
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Interview practice" description="Rule-based practice feedback" />
        {interview.attempts ? (
          <>
            <p className="text-sm">
              {interview.attempts} {interview.attempts === 1 ? 'attempt' : 'attempts'} on{' '}
              {interview.questionsPractised}{' '}
              {interview.questionsPractised === 1 ? 'question' : 'questions'}.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {interview.recent.map((r) => (
                <li key={r.questionId}>
                  <Link to={`/learn/interview/${r.questionId}`} className={link}>
                    {r.prompt}
                  </Link>
                  <span className="block text-xs text-muted">
                    {r.skillName} · key concepts {r.correctness}/10 · {formatDate(r.lastAttemptAt)}
                  </span>
                </li>
              ))}
            </ul>
            {interview.conceptsToRevise.length ? (
              <>
                <h3 className="mb-1 mt-3 text-sm font-semibold">Concepts to revise</h3>
                <ul className="space-y-1 text-sm">
                  {interview.conceptsToRevise.map((c) => (
                    <li key={`${c.skillName}-${c.label}`}>
                      {c.label}
                      {c.revise ? (
                        <>
                          {' — '}
                          <Link
                            to={`/learn/courses/${c.revise.courseId}/lessons/${c.revise.lessonId}`}
                            className={link}
                          >
                            {c.revise.lessonTitle}
                          </Link>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">
            No practice yet.{' '}
            <Link to="/learn/interview" className={link}>
              Try an interview question
            </Link>
            .
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Skills to practise" description="Flagged by your diagnostics" />
        {skillsToPractise.length ? (
          <ul className="space-y-1 text-sm">
            {skillsToPractise.map((s) => (
              <li key={s.skillId}>
                <span className="font-medium">{s.name}</span>
                <span className="block text-xs text-muted">{s.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nothing flagged by your diagnostics. Skills you have not been assessed on are not listed
            here — they are unknown, not mastered.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Relevant jobs" description="Your analysed jobs only" />
        {jobs.analysedJobs ? (
          <p className="text-sm">
            You have {jobs.analysedJobs} analysed {jobs.analysedJobs === 1 ? 'job' : 'jobs'}.{' '}
            <Link to="/learn/jobs" className={link}>
              Compare a job with your skills
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-muted">
            No analysed jobs yet, so no job comparisons are shown.{' '}
            <Link to="/jobs/new" className={link}>
              Add a job posting
            </Link>{' '}
            if you want one — learning works without it.
            {jobs.sampleJobsExcluded
              ? ` ${jobs.sampleJobsExcluded} sample ${jobs.sampleJobsExcluded === 1 ? 'job is' : 'jobs are'} not counted.`
              : ''}
          </p>
        )}
      </Card>
    </div>
  );
}
