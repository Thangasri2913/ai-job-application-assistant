import {
  APPLICATION_DOCUMENT_NAME_MAX_LENGTH,
  APPLICATION_DOCUMENT_TYPE_LABELS,
  APPLICATION_DOCUMENT_TYPES,
  type ApplicationDetail,
  type ApplicationDocument,
  type ApplicationDocumentType,
} from '@job-assist/shared';
import { Download, FileText, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { controlClasses } from '../../../shared/ui/field-styles';
import { formatBytes, formatDate } from '../../../shared/ui/format';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { Select } from '../../../shared/ui/Select';
import { checkResumeFile } from '../../resumes/validation/resume-file';
import { resumesApi } from '../../resumes/services/resumes-api';
import { useApplicationAction, useInvalidateApplications } from '../hooks/useApplications';
import { applicationsApi } from '../services/applications-api';

function DocumentRow({ applicationId, doc }: { applicationId: string; doc: ApplicationDocument }) {
  const remove = useApplicationAction(() => applicationsApi.deleteDocument(applicationId, doc.id));
  const [error, setError] = useState<unknown>(null);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <FileText className="size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{doc.name}</p>
        <p className="text-xs text-muted">
          {APPLICATION_DOCUMENT_TYPE_LABELS[doc.type]} · {formatBytes(doc.sizeBytes)} ·{' '}
          {formatDate(doc.createdAt)}
        </p>
        {error || remove.error ? (
          <p className="text-xs text-danger">{errorMessage(error ?? remove.error)}</p>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Download ${doc.name}`}
        onClick={() =>
          applicationsApi
            .downloadDocument(applicationId, doc.id, doc.originalFilename)
            .catch(setError)
        }
      >
        <Download className="size-4" aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Remove ${doc.name}`}
        loading={remove.isPending}
        onClick={() => remove.mutate(undefined)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}

/** The resume used (read-only, from the resume library) plus documents for this application. */
export function ApplicationDocuments({
  application,
  documents,
}: {
  application: ApplicationDetail;
  documents: ApplicationDocument[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateApplications();
  const [type, setType] = useState<ApplicationDocumentType>('COVER_LETTER');
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const used = application.resumeUsed;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkResumeFile(file);
    if (problem) return setError(problem);
    setError(null);
    setProgress(0);
    try {
      await applicationsApi.uploadDocument(application.id, file, { type, name }, setProgress);
      setName('');
      await invalidate();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="grid gap-4">
      <ul className="divide-y divide-border" aria-label="Application documents">
        <li className="flex items-center gap-3 py-2.5">
          <FileText className="size-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {used.resumeName} v{used.versionNumber} <Badge>Resume used</Badge>
            </p>
            <p className="text-xs text-muted">From your resume library; never modified.</p>
          </div>
          {used.hasFile ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Download the resume used"
              onClick={() =>
                void resumesApi.download(
                  used.resumeId,
                  used.resumeVersionId,
                  `${used.resumeName}.pdf`,
                )
              }
            >
              <Download className="size-4" aria-hidden />
            </Button>
          ) : null}
        </li>
        {documents.map((d) => (
          <DocumentRow key={d.id} applicationId={application.id} doc={d} />
        ))}
      </ul>

      {application.archivedAt ? null : (
        <div className="grid gap-2 rounded-xl border border-dashed border-border p-3">
          <p className="text-sm font-medium">Add a document</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Type</span>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as ApplicationDocumentType)}
              >
                {APPLICATION_DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {APPLICATION_DOCUMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span>Name (optional)</span>
              <input
                value={name}
                maxLength={APPLICATION_DOCUMENT_NAME_MAX_LENGTH}
                onChange={(e) => setName(e.target.value)}
                className={controlClasses(false, 'h-10')}
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              loading={progress !== null}
              onClick={() => input.current?.click()}
            >
              Choose PDF or DOCX
            </Button>
            <span className="text-xs text-muted">Up to 5 MB.</span>
          </div>
          <input
            ref={input}
            type="file"
            accept=".pdf,.docx"
            className="sr-only"
            aria-label="Document file"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {progress !== null ? <ProgressBar value={progress} label="Upload progress" /> : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
