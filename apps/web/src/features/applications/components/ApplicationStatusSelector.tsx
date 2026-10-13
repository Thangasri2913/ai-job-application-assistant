import {
  APPLICATION_OFFER_DETAILS_MAX_LENGTH,
  APPLICATION_REJECTION_REASON_MAX_LENGTH,
  APPLICATION_STATUS_LABELS,
  type ApplicationDetail,
  type ApplicationStatus,
  REJECTION_CATEGORIES,
  REJECTION_CATEGORY_LABELS,
  type RejectionCategory,
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
  const [category, setCategory] = useState<RejectionCategory | ''>('');
  const [offer, setOffer] = useState('');
  const [occurredOn, setOccurredOn] = useState('');
  const isOffer = next === 'OFFER' || next === 'ACCEPTED';
  const change = useApplicationAction(() =>
    applicationsApi.changeStatus(application.id, {
      status: next as ApplicationStatus,
      note: note.trim() || null,
      rejectionReason: next === 'REJECTED' ? reason.trim() || null : null,
      rejectionCategory: next === 'REJECTED' ? category || null : null,
      offerDetails: isOffer ? offer.trim() || null : null,
      occurredOn: occurredOn || null,
    }),
  );
  const reset = () => {
    setNext('');
    setNote('');
    setReason('');
    setCategory('');
    setOffer('');
    setOccurredOn('');
  };
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
            if (next) change.mutate(undefined, { onSuccess: reset });
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
              <span className="font-medium">Category (optional)</span>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value as RejectionCategory | '')}
              >
                <option value="">Not recorded</option>
                {REJECTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {REJECTION_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {isOffer && !application.offerDetails ? (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Offer details (optional)</span>
              <textarea
                value={offer}
                maxLength={APPLICATION_OFFER_DETAILS_MAX_LENGTH}
                rows={2}
                onChange={(e) => setOffer(e.target.value)}
                className={controlClasses(false, 'py-2')}
              />
            </label>
          ) : null}
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
              <span className="font-medium">Date it happened (optional)</span>
              <input
                type="date"
                value={occurredOn}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setOccurredOn(e.target.value)}
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
