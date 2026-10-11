import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { ResumeContentView } from '../../resumes/components/ResumeContentView';
import { usePreparationAction, useSuggestions, useTailoredDraft } from '../hooks/usePreparation';
import { preparationApi } from '../services/preparation-api';
import { ResumeSuggestionCard } from './ResumeSuggestionCard';

export function ResumeSuggestions({
  applicationId,
  busy,
}: {
  applicationId: string;
  busy: boolean;
}) {
  const suggestions = useSuggestions(applicationId);
  const generate = usePreparationAction(applicationId, () =>
    preparationApi.generateSuggestions(applicationId),
  );
  const [showDraft, setShowDraft] = useState(false);
  const draft = useTailoredDraft(applicationId, showDraft);
  const list = suggestions.data?.suggestions ?? [];
  const pending = list.filter((s) => s.status === 'PENDING').length;
  const disabled = busy || generate.isPending;

  return (
    <Card aria-labelledby="suggestions-heading">
      <CardHeader
        id="suggestions-heading"
        title="Resume suggestions"
        description={list.length ? `${list.length} suggestions · ${pending} to review` : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant={list.length ? 'secondary' : 'primary'}
          loading={generate.isPending}
          disabled={disabled}
          onClick={() => generate.mutate(undefined)}
        >
          {list.length ? 'Regenerate suggestions' : 'Generate resume suggestions'}
        </Button>
        {generate.isPending ? (
          <span className="text-sm text-muted" aria-live="polite">
            Analyzing resume… generating suggestions…
          </span>
        ) : null}
        {list.some((s) => s.status === 'ACCEPTED' || s.status === 'EDITED') ? (
          <Button size="sm" variant="ghost" onClick={() => setShowDraft((v) => !v)}>
            {showDraft ? 'Hide tailored draft' : 'View tailored draft'}
          </Button>
        ) : null}
      </div>
      {generate.error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(generate.error)}
        </p>
      ) : null}
      {suggestions.data?.note ? (
        <p className="mb-3 text-sm text-muted">{suggestions.data.note}</p>
      ) : null}
      {suggestions.isPending ? (
        <LoadingState />
      ) : suggestions.isError ? (
        <ErrorState error={suggestions.error} onRetry={() => void suggestions.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">
          No suggestions yet. Suggestions never change your resume; you decide on each one.
        </p>
      ) : (
        <ul className="grid gap-3" aria-label="Resume suggestions">
          {list.map((s) => (
            <ResumeSuggestionCard
              key={`${s.id}-${s.status}`}
              applicationId={applicationId}
              suggestion={s}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
      {showDraft ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-4">
          <p className="mb-1 text-sm font-semibold">Tailored draft</p>
          <p className="mb-3 text-xs text-muted">
            {draft.data
              ? `${draft.data.sourceResumeName} v${draft.data.sourceVersionNumber} with your ${draft.data.appliedSuggestionIds.length} accepted change(s). The original version is unchanged.`
              : 'Loading…'}
          </p>
          {draft.data ? <ResumeContentView content={draft.data.content} /> : null}
        </div>
      ) : null}
    </Card>
  );
}
