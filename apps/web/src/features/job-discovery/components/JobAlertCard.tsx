import { type JobAlertItem, REMOTE_PREFERENCE_LABELS } from '@job-assist/shared';
import { History, Pencil, Play, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { scheduleSummary } from './alert-format';
import { RunStatusBadge } from './SearchRunHistory';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function JobAlertCard({
  alert,
  onRun,
  onEdit,
  onDelete,
  onToggle,
  running,
}: {
  alert: JobAlertItem;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  running?: boolean;
}) {
  const inProgress = alert.lastRun?.status === 'RUNNING';
  const criteria = [
    alert.locations.length > 0 ? alert.locations.join(', ') : null,
    alert.remotePreference !== 'ANY' ? REMOTE_PREFERENCE_LABELS[alert.remotePreference] : null,
    `Minimum ${alert.minimumMatchScore}%`,
  ].filter(Boolean);
  return (
    <li className="rounded-xl border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{alert.name}</h3>
          <p className="text-sm text-muted">{alert.keywords.join(', ')}</p>
          <p className="text-sm text-muted">{criteria.join(' · ')}</p>
        </div>
        <Badge tone={alert.isActive ? 'success' : 'neutral'}>
          {alert.isActive ? 'Active' : 'Paused'}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline text-muted">Schedule: </dt>
          <dd className="inline">{scheduleSummary(alert)}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Next run: </dt>
          <dd className="inline">
            {alert.isActive && alert.nextRunAt ? dateTime.format(new Date(alert.nextRunAt)) : '—'}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-muted">Last run:</dt>
          <dd className="flex items-center gap-1.5">
            {alert.lastRun ? (
              <>
                <RunStatusBadge status={alert.lastRun.status} />
                {alert.lastRun.status !== 'RUNNING' ? (
                  <span>
                    {alert.lastRun.recommendationsCreated} new recommendation
                    {alert.lastRun.recommendationsCreated === 1 ? '' : 's'}
                  </span>
                ) : null}
              </>
            ) : (
              'Never'
            )}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted">Recommendations: </dt>
          <dd className="inline">
            <Link
              to={`/recommendations?alertId=${alert.id}`}
              className="text-primary hover:underline"
            >
              {alert.recommendationCount}
            </Link>
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" loading={running} disabled={inProgress} onClick={onRun}>
          <Play className="size-3.5" aria-hidden />
          {inProgress ? 'Running…' : 'Run now'}
        </Button>
        <Link to={`/job-alerts/${alert.id}/runs`} className={buttonClasses('secondary', 'sm')}>
          <History className="size-3.5" aria-hidden />
          Run history
        </Link>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
        <Button variant="secondary" size="sm" onClick={onToggle}>
          {alert.isActive ? 'Pause' : 'Resume'}
        </Button>
        <Button variant="ghost" size="sm" className="text-danger" onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </Button>
      </div>
    </li>
  );
}
