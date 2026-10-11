import type { InterviewReport } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { ProgressBar } from '../../../shared/ui/ProgressBar';

function Scores({ title, items }: { title: string; items: InterviewReport['topics'] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 font-medium">{title}</p>
      <dl className="grid gap-2">
        {items.map((t) => (
          <div key={t.topic} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3 text-sm">
            <dt>{t.topic}</dt>
            <dd className="contents">
              <ProgressBar value={t.score} label={`${t.topic} practice score`} />
              <span className="text-right tabular-nums">{t.score}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The final report. Practice feedback only — not a measurement or a hiring prediction. */
export function InterviewReportView({ report }: { report: InterviewReport }) {
  return (
    <Card aria-labelledby="report-heading">
      <CardHeader id="report-heading" title="Interview report" />
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <span
          className="text-4xl font-semibold tabular-nums"
          aria-label={`${report.overallScore} out of 100`}
        >
          {report.overallScore} / 100
        </span>
        <Badge tone={report.source === 'AI' ? 'primary' : 'neutral'}>{report.label}</Badge>
        <span className="text-sm text-muted">
          {report.answered} of {report.total} questions answered
        </span>
      </div>
      <p className="mb-4 text-xs text-muted">
        These scores are practice feedback to guide your preparation, not scientific measurements or
        a prediction of interview outcomes.
      </p>
      {report.summary ? <p className="mb-4">{report.summary}</p> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium">Strengths</p>
          {report.strengths.length ? (
            <ul className="space-y-0.5 text-sm">
              {report.strengths.map((s) => (
                <li key={s}>
                  <span className="text-success">✓</span> {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">None identified yet.</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-medium">Improve</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {report.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-5 grid gap-5">
        <Scores title="By question type" items={report.categories} />
        <Scores title="By topic" items={report.topics} />
      </div>
    </Card>
  );
}
