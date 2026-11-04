import { LEARNING_ROLE_LABELS, type LearningAnalytics } from '@job-assist/shared';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { formatDate, formatDay } from '../../../shared/ui/format';
import { minutes } from '../format';

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-surface-muted p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
      {note ? <dd className="text-xs text-muted">{note}</dd> : null}
    </div>
  );
}

/**
 * Learning analytics from persisted records only. Small samples are not turned into
 * percentages, and nothing here is a streak or a combined score.
 */
export function AnalyticsSection({ analytics: a }: { analytics: LearningAnalytics }) {
  const p = a.practice;
  return (
    <section aria-labelledby="learning-analytics" className="space-y-4">
      <h2 id="learning-analytics" className="text-base font-semibold">
        Your learning so far
      </h2>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Courses started"
          value={String(a.courses.started)}
          note={`${a.courses.completed} with every lesson marked complete`}
        />
        <Stat
          label="Lessons marked complete"
          value={String(a.lessonsCompleted)}
          note="Self-reported"
        />
        <Stat
          label="Practice answers"
          value={String(p.attempts)}
          note={`${p.questionsAnswered} different ${p.questionsAnswered === 1 ? 'question' : 'questions'}`}
        />
        <Stat
          label="First-try accuracy"
          value={p.firstTryAccuracy === null ? 'Not enough data' : `${p.firstTryAccuracy}%`}
          note={
            p.firstTryAccuracy === null
              ? p.note
              : `${p.firstTry.correct} of ${p.firstTry.total} questions. ${p.note}`
          }
        />
      </dl>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Skills" description="Measured by assessments, not by lessons" />
          <ul className="space-y-1 text-sm">
            <li>{a.skills.measured} measured by a diagnostic</li>
            <li>{a.skills.tooFewQuestions} assessed with too few questions to measure</li>
            <li>
              {a.skills.unknown} in your courses or target role not assessed yet (unknown, not
              mastered)
            </li>
          </ul>
          {a.plan ? (
            <p className="mt-3 text-sm">
              {LEARNING_ROLE_LABELS[a.plan.role]}: {a.plan.measured} of {a.plan.coreSkills} core
              skills measured, {a.plan.demonstrated} with fundamentals demonstrated.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Choose a target role in your preferences to see progress against its core skills.
            </p>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent activity" description="Last 14 days" />
          {a.recentActivity.length ? (
            <ul className="space-y-1 text-sm">
              {a.recentActivity.slice(0, 7).map((d) => (
                <li key={d.date} className="flex flex-wrap justify-between gap-2">
                  <span>{formatDay(d.date)}</span>
                  <span className="text-muted">
                    {[
                      d.lessonsCompleted
                        ? `${d.lessonsCompleted} lesson${d.lessonsCompleted === 1 ? '' : 's'}`
                        : '',
                      d.practiceAnswers
                        ? `${d.practiceAnswers} answer${d.practiceAnswers === 1 ? '' : 's'}`
                        : '',
                      d.diagnostics
                        ? `${d.diagnostics} diagnostic${d.diagnostics === 1 ? '' : 's'}`
                        : '',
                      d.interviewAnswers
                        ? `${d.interviewAnswers} interview answer${d.interviewAnswers === 1 ? '' : 's'}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              {a.lastActiveAt
                ? `No activity in the last 14 days. Last active ${formatDate(a.lastActiveAt)}.`
                : 'No activity recorded yet.'}
            </p>
          )}
          <p className="mt-3 text-sm">
            This week: about {minutes(a.week.estimatedMinutes)} of lessons
            {a.week.goalMinutes ? ` (your goal: ${minutes(a.week.goalMinutes)})` : ''}.
            <span className="block text-xs text-muted">
              Estimated from the stated length of lessons marked complete since Monday.
            </span>
          </p>
        </Card>
      </div>
      <p className="text-xs text-muted">
        Revision: {a.revision.due} due, {a.revision.scheduled} coming back later · Interview
        practice: {a.interview.attempts} {a.interview.attempts === 1 ? 'answer' : 'answers'} on{' '}
        {a.interview.questions} {a.interview.questions === 1 ? 'question' : 'questions'} · Projects:{' '}
        {a.projects.started} started, {a.projects.completed} completed (self-reported).
      </p>
    </section>
  );
}
