import {
  RESUME_VERSION_SOURCE_LABELS,
  type ResumeExtractedData,
  type ResumeVersionSummary,
} from '@job-assist/shared';
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  FilePlus2,
  Pencil,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card, CardHeader } from '../../../shared/ui/Card';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { formatBytes, formatDate } from '../../../shared/ui/format';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { ResumeContentView } from '../components/ResumeContentView';
import { ResumeMetaDialog } from '../components/ResumeMetaDialog';
import {
  ParseStatusBadge,
  ProvenanceBadges,
  VersionStatusBadge,
} from '../components/resume-status';
import {
  isParsing,
  useInvalidateResumes,
  useResume,
  useResumeAction,
  useExtractedData,
  useResumeVersion,
} from '../hooks/useResumes';
import { resumesApi } from '../services/resumes-api';
import { checkResumeFile } from '../validation/resume-file';

function VersionRow({ resumeId, version }: { resumeId: string; version: ResumeVersionSummary }) {
  const [downloadError, setDownloadError] = useState<unknown>(null);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">v{version.versionNumber}</span>
          <VersionStatusBadge version={version} />
          {isParsing(version.parseStatus) ? <Badge tone="primary">Processing…</Badge> : null}
          {version.parseStatus === 'FAILED' ? (
            <Badge tone="danger">Couldn’t read file</Badge>
          ) : null}
        </div>
        <div className="mt-1">
          <ProvenanceBadges version={version} />
        </div>
        <p className="text-sm text-muted">
          {RESUME_VERSION_SOURCE_LABELS[version.source]} · {formatDate(version.createdAt)}
          {version.notes ? ` · ${version.notes}` : ''}
        </p>
        {downloadError ? (
          <p className="text-sm text-danger">{errorMessage(downloadError)}</p>
        ) : null}
      </div>
      <div className="flex gap-1">
        <Link
          to={`/resumes/${resumeId}/versions/${version.id}/review`}
          className={buttonClasses(version.status === 'DRAFT' ? 'primary' : 'ghost', 'sm')}
        >
          {version.status === 'DRAFT' ? 'Review' : 'View'}
        </Link>
        {version.hasFile ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Download v${version.versionNumber} file`}
            onClick={() =>
              resumesApi.download(resumeId, version.id, 'resume').catch(setDownloadError)
            }
          >
            <Download className="size-4" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

const AI_STATUS_TEXT: Record<ResumeExtractedData['aiStatus'], string> = {
  DISABLED: 'Not used (no AI provider configured)',
  VALID: 'Used — suggestions validated and checked against your file',
  INVALID: 'Attempted — output failed validation and was discarded',
  FAILED: 'Attempted — the AI service was unavailable',
};

/** How the newest version's file was processed. Errors are shown, never hidden. */
function ParsingInformation({
  version,
  data,
  resumeId,
}: {
  version: ResumeVersionSummary;
  data: ResumeExtractedData;
  resumeId: string;
}) {
  const parsed = data.parsed;
  return (
    <Card aria-labelledby="parsing-heading">
      <CardHeader
        id="parsing-heading"
        title="Parsing information"
        description={`v${version.versionNumber}`}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Status</dt>
        <dd>
          <ParseStatusBadge status={data.parseStatus} />
        </dd>
        {data.parserVersion ? (
          <>
            <dt className="text-muted">Parser</dt>
            <dd>{data.parserVersion}</dd>
          </>
        ) : null}
        <dt className="text-muted">AI structuring</dt>
        <dd>
          {AI_STATUS_TEXT[data.aiStatus]}
          {data.aiNote ? <span className="block text-muted">{data.aiNote}</span> : null}
        </dd>
        {parsed ? (
          <>
            <dt className="text-muted">Found in file</dt>
            <dd>
              {parsed.skills.length} skills · {parsed.experiences.length} experience ·{' '}
              {parsed.educations.length} education · {parsed.projects.length} projects
            </dd>
          </>
        ) : null}
      </dl>
      {data.parseError ? (
        <div className="mt-3">
          <Alert>{data.parseError}</Alert>
        </div>
      ) : null}
      {data.extractedText ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">
            Text extracted from the file
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-surface-muted p-3 text-xs whitespace-pre-wrap">
            {data.extractedText}
          </pre>
        </details>
      ) : null}
      {data.editable ? (
        <Link
          to={`/resumes/${resumeId}/versions/${version.id}/review`}
          className={`${buttonClasses('secondary', 'sm')} mt-3`}
        >
          Review extracted information
        </Link>
      ) : null}
    </Card>
  );
}

export function ResumeDetailPage() {
  const { resumeId = '' } = useParams();
  const navigate = useNavigate();
  const resume = useResume(resumeId);
  const current = useResumeVersion(resumeId, resume.data?.currentVersion?.id ?? '');
  // Extraction for the current version (provenance labels) and for the newest version (parsing panel).
  const currentExtraction = useExtractedData(resumeId, resume.data?.currentVersion?.id ?? '');
  const latestVersion = resume.data?.versions[0];
  const latestExtraction = useExtractedData(resumeId, latestVersion?.id ?? '');
  const invalidate = useInvalidateResumes();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const duplicate = useResumeAction(() => resumesApi.duplicate(resumeId));
  const archive = useResumeAction(() =>
    resume.data?.status === 'ARCHIVED'
      ? resumesApi.restore(resumeId)
      : resumesApi.archive(resumeId),
  );
  const toggleDefault = useResumeAction(() =>
    resume.data?.isDefault ? resumesApi.clearDefault(resumeId) : resumesApi.setDefault(resumeId),
  );
  const newVersion = useResumeAction(() => resumesApi.createVersion(resumeId, {}));
  const remove = useResumeAction(() => resumesApi.remove(resumeId));
  const actionError =
    duplicate.error ?? archive.error ?? toggleDefault.error ?? newVersion.error ?? remove.error;

  if (resume.isPending) return <LoadingState label="Loading resume" />;
  if (resume.isError)
    return <ErrorState error={resume.error} onRetry={() => void resume.refetch()} />;
  const r = resume.data;
  const archived = r.status === 'ARCHIVED';
  const draft = r.versions.find((v) => v.status === 'DRAFT');
  const currentFile = current.data?.file;

  const uploadNewVersion = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkResumeFile(file);
    setUploadError(problem);
    if (problem) return;
    setUploadProgress(0);
    try {
      const version = await resumesApi.uploadVersion(resumeId, file, setUploadProgress);
      await invalidate();
      void navigate(`/resumes/${resumeId}/versions/${version.id}/review`);
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploadProgress(null);
    }
  };

  return (
    <>
      <PageHeader
        title={r.name}
        subtitle={r.description ?? undefined}
        actions={
          <Link to="/resumes" className={buttonClasses('secondary')}>
            All resumes
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {r.isDefault ? (
          <Badge tone="primary">
            <Star className="mr-1 size-3" fill="currentColor" aria-hidden />
            Default resume
          </Badge>
        ) : null}
        <Badge tone={archived ? 'neutral' : 'success'}>{archived ? 'Archived' : 'Active'}</Badge>
        {r.tags.map((tag) => (
          <span key={tag} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted">
            {tag}
          </span>
        ))}
        <span className="text-sm text-muted">Updated {formatDate(r.updatedAt)}</span>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden />
          Edit details
        </Button>
        {!archived ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={newVersion.isPending}
              onClick={() =>
                newVersion.mutate(undefined, {
                  onSuccess: (v) => void navigate(`/resumes/${resumeId}/versions/${v.id}/review`),
                })
              }
              disabled={r.versions.length === 0}
            >
              <FilePlus2 className="size-3.5" aria-hidden />
              Edit information
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={uploadProgress !== null}
            >
              <Upload className="size-3.5" aria-hidden />
              Upload new file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx"
              className="sr-only"
              aria-label="New resume file"
              onChange={(e) => {
                void uploadNewVersion(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          loading={duplicate.isPending}
          onClick={() =>
            duplicate.mutate(undefined, {
              onSuccess: (copy) => void navigate(`/resumes/${copy.id}`),
            })
          }
        >
          <Copy className="size-3.5" aria-hidden />
          Duplicate
        </Button>
        {!archived ? (
          <Button
            variant="secondary"
            size="sm"
            loading={toggleDefault.isPending}
            onClick={() => toggleDefault.mutate(undefined)}
          >
            <Star className="size-3.5" aria-hidden />
            {r.isDefault ? 'Remove default' : 'Set as default'}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          loading={archive.isPending}
          onClick={() => archive.mutate(undefined)}
        >
          {archived ? (
            <ArchiveRestore className="size-3.5" aria-hidden />
          ) : (
            <Archive className="size-3.5" aria-hidden />
          )}
          {archived ? 'Restore' : 'Archive'}
        </Button>
        {currentFile && r.currentVersion ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void resumesApi.download(resumeId, r.currentVersion!.id, currentFile.originalFilename)
            }
          >
            <Download className="size-3.5" aria-hidden />
            Download
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </Button>
      </div>

      {uploadProgress !== null ? (
        <div className="mb-5 grid gap-2" aria-live="polite">
          <p className="text-sm">Uploading new version… {Math.round(uploadProgress)}%</p>
          <ProgressBar value={uploadProgress} label="Upload progress" />
        </div>
      ) : null}
      {uploadError ? (
        <div className="mb-5">
          <Alert>{uploadError}</Alert>
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-5">
          <Alert>{errorMessage(actionError)}</Alert>
        </div>
      ) : null}

      {draft ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          <span>
            {isParsing(draft.parseStatus)
              ? `v${draft.versionNumber} is being processed…`
              : `v${draft.versionNumber} is a draft waiting for your review.`}
          </span>
          {!isParsing(draft.parseStatus) ? (
            <Link
              to={`/resumes/${resumeId}/versions/${draft.id}/review`}
              className={buttonClasses('primary', 'sm')}
            >
              Review now
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <Card aria-labelledby="current-heading">
          <CardHeader
            id="current-heading"
            title={
              r.currentVersion
                ? `Current version · v${r.currentVersion.versionNumber}`
                : 'Current version'
            }
            description={
              currentFile
                ? `${currentFile.originalFilename} · ${formatBytes(currentFile.sizeBytes)}`
                : r.currentVersion
                  ? 'No file — structured content only'
                  : undefined
            }
          />
          {r.currentVersion ? (
            <div className="mb-4">
              <ProvenanceBadges version={r.currentVersion} />
            </div>
          ) : null}
          {!r.currentVersion ? (
            <p className="text-sm text-muted">
              No version is current yet. Review the draft to make it current.
            </p>
          ) : current.isPending ? (
            <LoadingState />
          ) : current.data?.content ? (
            <ResumeContentView
              content={current.data.content}
              extracted={currentExtraction.data?.parsed}
            />
          ) : (
            <p className="text-sm text-muted">This version has no structured content.</p>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card aria-labelledby="versions-heading" id="versions">
            <CardHeader id="versions-heading" title="Version history" />
            <ul className="divide-y divide-border">
              {r.versions.map((v) => (
                <VersionRow key={v.id} resumeId={resumeId} version={v} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Earlier versions are kept unchanged so you always know exactly what you used.
            </p>
          </Card>
          {latestVersion && latestExtraction.data ? (
            <ParsingInformation
              version={latestVersion}
              data={latestExtraction.data}
              resumeId={resumeId}
            />
          ) : null}
        </div>
      </div>

      <ResumeMetaDialog resume={r} open={editing} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${r.name}”?`}
        confirmLabel="Delete permanently"
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => void navigate('/resumes', { replace: true }),
          })
        }
      >
        <p>
          This permanently deletes the resume, all {r.versionCount} version
          {r.versionCount === 1 ? '' : 's'} and the uploaded files. This can’t be undone.
        </p>
        <p className="mt-2">
          If you might need it later, archive it instead — archived resumes are kept but hidden.
        </p>
      </ConfirmDialog>
    </>
  );
}
