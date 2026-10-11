import { INTERVIEW_SESSION_TYPE_LABELS, type InterviewSessionSummary } from '@job-assist/shared';
import { Link } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { formatDate } from '../../../shared/ui/format';

const STATUS: Record<
  InterviewSessionSummary['status'],
  { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' }
> = {
  CREATED: { label: 'Not started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  ABANDONED: { label: 'Abandoned', tone: 'neutral' },
};

export function InterviewHistoryList({
  sessions,
  showJob = true,
}: {
  sessions: InterviewSessionSummary[];
  showJob?: boolean;
}) {
  if (sessions.length === 0)
    return <p className="text-sm text-muted">No interview sessions yet.</p>;
  return (
    <ul className="divide-y divide-border" aria-label="Interview sessions">
      {sessions.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <Link
              to={`/interviews/${s.id}`}
              className="font-medium hover:text-primary hover:underline"
            >
              {showJob
                ? `${s.job.title} · ${s.job.companyName}`
                : INTERVIEW_SESSION_TYPE_LABELS[s.type]}
            </Link>
            <p className="text-sm text-muted">
              {showJob ? `${INTERVIEW_SESSION_TYPE_LABELS[s.type]} · ` : ''}
              {formatDate(s.createdAt)} · {s.resume.resumeName} v{s.resume.versionNumber}
            </p>
          </div>
          <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
          {s.overallScore !== null ? (
            <span className="w-16 text-right font-semibold tabular-nums">{s.overallScore}/100</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
