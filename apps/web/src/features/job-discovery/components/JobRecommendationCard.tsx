import {
  EMPLOYMENT_TYPE_LABELS,
  JOB_RECOMMENDATION_STATUS_LABELS,
  type JobRecommendationItem,
  WORK_MODE_LABELS,
} from '@job-assist/shared';
import { Bookmark, X } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { formatDate } from '../../../shared/ui/format';
import { MatchScoreBadge } from './MatchScoreBadge';
import { ResumeRecommendation } from './ResumeRecommendation';
import { SampleDataNotice } from './SampleDataNotice';

export function JobRecommendationCard({
  recommendation: r,
  onSave,
  onDismiss,
  busy,
}: {
  recommendation: JobRecommendationItem;
  onSave: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  const facts = [
    r.job.companyName,
    r.job.location,
    r.job.workMode ? WORK_MODE_LABELS[r.job.workMode] : null,
    r.job.employmentType ? EMPLOYMENT_TYPE_LABELS[r.job.employmentType] : null,
  ].filter(Boolean);
  const terminal = r.status === 'DISMISSED' || r.status === 'APPLIED';
  return (
    <li className="rounded-xl border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            <Link
              to={`/jobs/${r.job.id}?recommendation=${r.id}`}
              className="hover:text-primary hover:underline"
            >
              {r.job.title}
            </Link>
          </h3>
          <p className="text-sm text-muted">{facts.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {r.job.isSampleData ? <SampleDataNotice compact /> : null}
          {r.status !== 'VIEWED' ? (
            <Badge tone={r.status === 'NEW' ? 'primary' : 'neutral'}>
              {JOB_RECOMMENDATION_STATUS_LABELS[r.status]}
            </Badge>
          ) : null}
          <MatchScoreBadge score={r.matchScore} level={r.level} />
        </div>
      </div>
      <p className="mt-3 text-sm">{r.reason}</p>
      {r.requiredSkills.matched.length + r.requiredSkills.missing.length > 0 ? (
        <ul aria-label="Required skills" className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {r.requiredSkills.matched.map((s) => (
            <li key={`m-${s}`} className="rounded-md bg-success-soft px-2 py-0.5 text-success">
              ✓ {s}
            </li>
          ))}
          {r.requiredSkills.missing.map((s) => (
            <li key={`x-${s}`} className="rounded-md bg-danger-soft px-2 py-0.5 text-danger">
              ✗ {s}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3">
        <ResumeRecommendation resume={r.resume} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted">
          {r.alert ? `From “${r.alert.name}” · ` : ''}
          Found {formatDate(r.createdAt)}
          {r.source ? ` · ${r.source.name}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/jobs/${r.job.id}?recommendation=${r.id}`}
            className={buttonClasses('secondary', 'sm')}
          >
            View job
          </Link>
          {r.status !== 'SAVED' && !terminal ? (
            <Button variant="secondary" size="sm" disabled={busy} onClick={onSave}>
              <Bookmark className="size-3.5" aria-hidden />
              Save
            </Button>
          ) : null}
          {!terminal ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>
              <X className="size-3.5" aria-hidden />
              Dismiss
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
