import { MATCH_SCORE_NAME, type SmartApplyState } from '@job-assist/shared';
import { Inbox, Settings, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { Select } from '../../../shared/ui/Select';
import { SmartApplyStatusBadge } from '../components/SmartApplyStatusBadge';
import { useQuestionInbox, useSmartApplications } from '../hooks/useSmartApply';

const GROUPS: { value: string; label: string; states?: SmartApplyState[] }[] = [
  { value: '', label: 'All' },
  { value: 'input', label: 'Needs your answers', states: ['NEEDS_USER_INPUT'] },
  { value: 'review', label: 'Awaiting your review', states: ['READY_FOR_REVIEW'] },
  { value: 'handoff', label: 'Submit on the official site', states: ['AWAITING_USER_SUBMISSION'] },
  {
    value: 'progress',
    label: 'Preparing or submitting',
    states: ['DISCOVERED', 'PREPARING', 'SUBMITTING'],
  },
  { value: 'submitted', label: 'Submitted', states: ['SUBMITTED'] },
  { value: 'failed', label: 'Failed or cancelled', states: ['FAILED', 'CANCELLED'] },
];
const PAGE_SIZE = 20;

/** Smart Apply dashboard: every application the app prepared, with what it needs next. */
export function SmartApplyPage() {
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const states = GROUPS.find((g) => g.value === group)?.states;
  const list = useSmartApplications({ state: states, page, pageSize: PAGE_SIZE });
  const inbox = useQuestionInbox();
  const pending = inbox.data?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Smart Apply"
        subtitle="Applications prepared for you. You review everything; the app only submits where the employer authorises it, otherwise you submit on the official site."
        actions={
          <>
            <Link to="/smart-apply/questions" className={buttonClasses('secondary', 'md')}>
              <Inbox className="size-4" aria-hidden />
              Questions{pending > 0 ? ` (${pending})` : ''}
            </Link>
            <Link to="/smart-apply/settings" className={buttonClasses('ghost', 'md')}>
              <Settings className="size-4" aria-hidden />
              Settings
            </Link>
          </>
        }
      />
      <label className="mb-5 flex max-w-xs flex-col gap-1.5 text-sm">
        <span className="font-medium">Show</span>
        <Select
          aria-label="Show"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setPage(1);
          }}
        >
          {GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </label>
      {list.isPending ? (
        <LoadingState label="Loading applications" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={Wand2}
          title={group ? 'No applications here' : 'No Smart Apply applications yet'}
          description="Choose “Prepare application” on a recommended job or a job you added. The app prepares the materials and asks you for anything it doesn’t know."
        >
          <Link to="/recommendations" className={buttonClasses('primary', 'md')}>
            See recommended jobs
          </Link>
        </EmptyState>
      ) : (
        <>
          <ul aria-label="Smart Apply applications" className="grid gap-3">
            {list.data.items.map((a) => (
              <li key={a.id} className="min-w-0 rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/smart-apply/${a.id}`}
                      className="font-semibold hover:text-primary hover:underline"
                    >
                      {a.job.title}
                    </Link>
                    <p className="text-sm text-muted">
                      {[a.job.companyName, a.job.location, a.job.source]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <SmartApplyStatusBadge application={a} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {a.matchScore !== null ? `${MATCH_SCORE_NAME}: ${a.matchScore}% · ` : ''}
                  {a.outstandingQuestions > 0
                    ? `${a.outstandingQuestions} question${a.outstandingQuestions === 1 ? '' : 's'} to answer · `
                    : ''}
                  Updated {formatDate(a.updatedAt)}
                </p>
                {a.failureReason ? (
                  <p className="mt-1 text-sm text-danger">{a.failureReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {list.data.total > PAGE_SIZE ? (
            <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-sm">
              <Button
                size="sm"
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} of {Math.ceil(list.data.total / PAGE_SIZE)}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={page * PAGE_SIZE >= list.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
