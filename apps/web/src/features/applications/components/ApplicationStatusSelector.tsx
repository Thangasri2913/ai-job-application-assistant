import {
  APPLICATION_REJECTION_REASON_MAX_LENGTH,
  APPLICATION_STATUS_LABELS,
  type ApplicationDetail,
  type ApplicationStatus,
} from '@job-assist/shared';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Button } from '../../../shared/ui/Button';
import { controlClasses } from '../../../shared/ui/field-styles';
import { Select } from '../../../shared/ui/Select';
import { useApplicationAction } from '../hooks/useApplications';
import { applicationsApi } from '../services/applications-api';
import { ApplicationStatusBadge } from './application-status';

/** Shows the current status and offers only the moves the API allows. */
export function ApplicationStatusSelector({ application }: { application: ApplicationDetail }) {
  const [next, setNext] = useState<ApplicationStatus | ''>('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const change = useApplicationAction(() =>
    applicationsApi.changeStatus(application.id, {
      status: next as ApplicationStatus,
      note: note.trim() || null,
      rejectionReason: next === 'REJECTED' ? reason.trim() || null : null,
    }),
  );
  const options = application.allowedNextStatuses;

  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted">Current status:</span>
        <ApplicationStatusBadge status={application.status} />
      </p>
      {application.archivedAt ? (
        <p className="text-sm text-muted">Restore this application to change its status.</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted">This application is closed.</p>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (next)
              change.mutate(undefined, {
                onSuccess: () => (setNext(''), setNote(''), setReason('')),
              });
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Change to</span>
            <Select
              value={next}
              onChange={(e) => setNext(e.target.value as ApplicationStatus | '')}
            >
              <option value="">Choose a status…</option>
              {options.map((s) => (
                <option key={s} value={s}>
                  {APPLICATION_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </label>
          {next === 'REJECTED' ? (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Reason (optional)</span>
              <input
                value={reason}
                maxLength={APPLICATION_REJECTION_REASON_MAX_LENGTH}
                onChange={(e) => setReason(e.target.value)}
                className={controlClasses(false, 'h-10')}
              />
            </label>
          ) : null}
          {next ? (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Note for the timeline (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Technical assessment received"
                className={controlClasses(false, 'h-10')}
              />
            </label>
          ) : null}
          <div>
            <Button type="submit" size="sm" disabled={!next} loading={change.isPending}>
              Update status
            </Button>
          </div>
          {change.error ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(change.error)}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
