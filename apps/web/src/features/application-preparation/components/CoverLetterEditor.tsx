import {
  countWords,
  COVER_LETTER_MAX_LENGTH,
  type CoverLetterVersionItem,
} from '@job-assist/shared';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Button } from '../../../shared/ui/Button';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { TextArea } from '../../../shared/ui/TextArea';
import { useCoverLetter, usePreparationAction } from '../hooks/usePreparation';
import { preparationApi } from '../services/preparation-api';
import { ContentStatus } from './ApprovalStatus';

function Editor({
  applicationId,
  latest,
  disabled,
}: {
  applicationId: string;
  latest: CoverLetterVersionItem;
  disabled: boolean;
}) {
  const [text, setText] = useState(latest.text);
  const save = usePreparationAction(applicationId, () =>
    preparationApi.saveCoverLetter(applicationId, text),
  );
  const approve = usePreparationAction(applicationId, () =>
    preparationApi.approveCoverLetter(applicationId),
  );
  const dirty = text !== latest.text;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Version {latest.versionNumber}</span>
        <ContentStatus source={latest.source} status={latest.status} />
      </div>
      {latest.note ? <p className="text-sm text-muted">{latest.note}</p> : null}
      {latest.notClaimed.length > 0 ? (
        <p className="text-sm text-muted">
          Not claimed (not found in your resume or profile):{' '}
          <span className="text-fg">{latest.notClaimed.join(', ')}</span>. Add them only if they are
          genuinely true.
        </p>
      ) : null}
      <label htmlFor="cover-letter-text" className="sr-only">
        Cover letter
      </label>
      <TextArea
        id="cover-letter-text"
        rows={16}
        value={text}
        maxLength={COVER_LETTER_MAX_LENGTH}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your cover letter…"
      />
      <p className="text-xs text-muted">{countWords(text)} words</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!dirty || disabled}
          loading={save.isPending}
          onClick={() => save.mutate(undefined)}
        >
          Save draft
        </Button>
        <Button
          size="sm"
          disabled={dirty || disabled || latest.status === 'APPROVED' || text.trim().length < 50}
          loading={approve.isPending}
          onClick={() => approve.mutate(undefined)}
        >
          Approve
        </Button>
        {dirty ? (
          <span className="self-center text-xs text-muted">
            Save your changes before approving.
          </span>
        ) : null}
      </div>
      {latest.status === 'APPROVED' && latest.approvedAt ? (
        <p className="text-sm text-success">
          Approved {formatDate(latest.approvedAt)} and added to this application’s documents.
        </p>
      ) : null}
      {save.error || approve.error ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(save.error ?? approve.error)}
        </p>
      ) : null}
    </div>
  );
}

export function CoverLetterEditor({
  applicationId,
  busy,
}: {
  applicationId: string;
  busy: boolean;
}) {
  const letter = useCoverLetter(applicationId);
  const generate = usePreparationAction(applicationId, (mode: 'GENERATE' | 'MANUAL') =>
    preparationApi.generateCoverLetter(applicationId, mode),
  );
  const latest = letter.data?.latest ?? null;
  const disabled = busy || generate.isPending;
  return (
    <Card aria-labelledby="cover-letter-heading">
      <CardHeader
        id="cover-letter-heading"
        title="Cover letter"
        description={latest ? `${letter.data!.versions.length} version(s)` : 'Not generated'}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={latest ? 'secondary' : 'primary'}
          disabled={disabled}
          loading={generate.isPending && generate.variables === 'GENERATE'}
          onClick={() => generate.mutate('GENERATE')}
        >
          {latest ? 'Regenerate (new version)' : 'Generate cover letter'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => generate.mutate('MANUAL')}
        >
          Write my own
        </Button>
        {generate.isPending && generate.variables === 'GENERATE' ? (
          <span className="text-sm text-muted" aria-live="polite">
            Writing cover letter…
          </span>
        ) : null}
      </div>
      {generate.error ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {errorMessage(generate.error)}
        </p>
      ) : null}
      {letter.isPending ? (
        <LoadingState />
      ) : latest ? (
        <Editor
          key={`${latest.id}-${latest.updatedAt}`}
          applicationId={applicationId}
          latest={latest}
          disabled={disabled}
        />
      ) : null}
      {letter.data && letter.data.versions.length > 1 ? (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">Earlier versions (kept)</summary>
          <ul className="mt-2 grid gap-2">
            {letter.data.versions.slice(1).map((v) => (
              <li key={v.id} className="rounded-lg bg-surface-muted p-3">
                <p className="mb-1 flex flex-wrap items-center gap-2 font-medium">
                  Version {v.versionNumber} <ContentStatus source={v.source} status={v.status} />
                </p>
                <p className="line-clamp-3 whitespace-pre-line text-muted">{v.text || '(empty)'}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
