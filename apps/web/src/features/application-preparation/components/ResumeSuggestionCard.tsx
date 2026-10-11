import { type ResumeSuggestionItem, SUGGESTION_TEXT_MAX_LENGTH } from '@job-assist/shared';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { TextArea } from '../../../shared/ui/TextArea';
import { usePreparationAction } from '../hooks/usePreparation';
import { preparationApi } from '../services/preparation-api';
import { ContentStatus } from './ApprovalStatus';

const SECTION_LABELS: Record<ResumeSuggestionItem['section'], string> = {
  SUMMARY: 'Summary',
  EXPERIENCE: 'Experience',
  PROJECT: 'Project',
  SKILLS: 'Skills',
  EDUCATION: 'Education',
  CERTIFICATIONS: 'Certifications',
};

const KIND_LABELS: Record<ResumeSuggestionItem['kind'], string> = {
  REWRITE: 'Rewording',
  REORDER: 'Order',
  EMPHASIZE: 'Emphasis',
  GAP: 'Gap',
};

/** Original / Suggested / Why, with the user's decision. Nothing is applied without it. */
export function ResumeSuggestionCard({
  applicationId,
  suggestion: s,
  disabled,
}: {
  applicationId: string;
  suggestion: ResumeSuggestionItem;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.userText ?? s.suggestedText ?? '');
  const decide = usePreparationAction(
    applicationId,
    (body: Parameters<typeof preparationApi.decide>[2]) =>
      preparationApi.decide(applicationId, s.id, body),
  );
  const informational = s.kind === 'GAP' || s.kind === 'EMPHASIZE';
  const editable = s.kind === 'REWRITE' || (s.kind === 'REORDER' && s.section === 'EXPERIENCE');
  const decided = s.status !== 'PENDING';

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{SECTION_LABELS[s.section]}</span>
        <Badge>{KIND_LABELS[s.kind]}</Badge>
        <ContentStatus source={s.source} status={s.status} />
      </div>
      {s.originalText && s.kind !== 'GAP' ? (
        <div className="mb-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Original</p>
          <p className="text-sm">{s.originalText}</p>
        </div>
      ) : null}
      {s.kind === 'REWRITE' ||
      (s.kind === 'REORDER' && s.section === 'SKILLS') ||
      editing ||
      s.status === 'EDITED' ? (
        <div className="mb-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {s.status === 'EDITED' ? 'Your version' : 'Suggested'}
          </p>
          {editing ? (
            <>
              <label htmlFor={`suggestion-${s.id}`} className="sr-only">
                Your wording
              </label>
              <TextArea
                id={`suggestion-${s.id}`}
                rows={3}
                value={text}
                maxLength={SUGGESTION_TEXT_MAX_LENGTH}
                onChange={(e) => setText(e.target.value)}
              />
            </>
          ) : (
            <p className="text-sm font-medium">
              {s.status === 'EDITED' ? s.userText : s.suggestedText}
            </p>
          )}
        </div>
      ) : null}
      <div className="mb-3">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Why?</p>
        <p className="text-sm text-muted">{s.reason}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              disabled={!text.trim() || disabled}
              loading={decide.isPending}
              onClick={() =>
                decide.mutate({ action: 'EDIT', text }, { onSuccess: () => setEditing(false) })
              }
            >
              Save my version
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : decided ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            loading={decide.isPending}
            onClick={() => decide.mutate({ action: 'RESET' })}
          >
            Undo decision
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              disabled={disabled}
              loading={decide.isPending && decide.variables?.action === 'ACCEPT'}
              onClick={() => decide.mutate({ action: 'ACCEPT' })}
            >
              {informational ? 'Acknowledge' : 'Accept'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              loading={decide.isPending && decide.variables?.action === 'REJECT'}
              onClick={() => decide.mutate({ action: 'REJECT' })}
            >
              {informational ? 'Dismiss' : 'Reject'}
            </Button>
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            ) : null}
          </>
        )}
      </div>
      {decide.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {errorMessage(decide.error)}
        </p>
      ) : null}
    </li>
  );
}
