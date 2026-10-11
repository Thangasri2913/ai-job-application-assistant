import type { ResumeDetail } from '@job-assist/shared';
import { CheckCircle2, CircleAlert, FileUp, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { cn } from '../../../shared/ui/cn';
import { Dialog } from '../../../shared/ui/Dialog';
import { controlClasses } from '../../../shared/ui/field-styles';
import { FormField } from '../../../shared/ui/FormField';
import { formatBytes } from '../../../shared/ui/format';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { TagInput } from '../../../shared/ui/TagInput';
import {
  isParsing,
  useInvalidateResumes,
  useParseStatus,
  useResumeAction,
} from '../hooks/useResumes';
import { resumesApi } from '../services/resumes-api';
import { checkResumeFile, nameFromFilename } from '../validation/resume-file';

type Stage =
  | { kind: 'select' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'processing'; resume: ResumeDetail }
  | { kind: 'error'; message: string };

export function UploadResumeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invalidate = useInvalidateResumes();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [name, setName] = useState('');
  // An auto-filled name follows the chosen file; a name the user typed is kept.
  const [nameEdited, setNameEdited] = useState(false);
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'select' });

  const processing = stage.kind === 'processing' ? stage.resume : null;
  const versionId = processing?.latestVersion?.id ?? null;
  const status = useParseStatus(processing?.id ?? null, versionId);
  const parseStatus = status.data?.parseStatus;
  const retry = useResumeAction(() => resumesApi.reparse(processing!.id, versionId!));

  const reset = () => {
    setFile(null);
    setFileError(null);
    setName('');
    setNameEdited(false);
    setCategory('');
    setTags([]);
    setStage({ kind: 'select' });
  };
  const close = () => {
    if (stage.kind === 'uploading') return; // don't abandon an in-flight upload
    reset();
    onClose();
  };

  const choose = (candidate: File | undefined) => {
    if (!candidate) return;
    const problem = checkResumeFile(candidate);
    setFileError(problem);
    setFile(problem ? null : candidate);
    if (!problem && !nameEdited) setName(nameFromFilename(candidate.name));
  };

  const upload = async () => {
    if (!file) return;
    setStage({ kind: 'uploading', percent: 0 });
    try {
      const resume = await resumesApi.upload(
        file,
        { name: name.trim() || undefined, category: category.trim() || undefined, tags },
        (percent) => setStage({ kind: 'uploading', percent }),
      );
      setStage({ kind: 'processing', resume });
      void invalidate();
    } catch (error) {
      setStage({ kind: 'error', message: errorMessage(error) });
    }
  };

  const reviewHref =
    processing && versionId ? `/resumes/${processing.id}/versions/${versionId}/review` : '#';

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Upload a resume"
      description="PDF or DOCX, up to 5 MB. Your original file is kept unchanged."
    >
      {stage.kind === 'select' || stage.kind === 'error' ? (
        <div className="flex flex-col gap-4">
          {stage.kind === 'error' ? <Alert>{stage.message}</Alert> : null}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
              dragging ? 'border-primary bg-primary-soft' : 'border-border',
            )}
          >
            <FileUp className="size-7 text-muted" aria-hidden />
            {file ? (
              <p className="text-sm">
                <span className="font-medium">{file.name}</span>{' '}
                <span className="text-muted">({formatBytes(file.size)})</span>
              </p>
            ) : (
              <p className="text-sm text-muted">Drag and drop your resume here, or</p>
            )}
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              {file ? 'Choose a different file' : 'Choose file'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              aria-label="Resume file"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {fileError ? (
            <p className="text-sm text-danger" role="alert">
              {fileError}
            </p>
          ) : null}

          <FormField label="Resume name" optional hint="e.g. Angular Developer Resume">
            {(a) => (
              <input
                {...a}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                maxLength={120}
                className={controlClasses(false, 'h-10')}
              />
            )}
          </FormField>
          <FormField label="Category" optional hint="e.g. Frontend, Full Stack, General.">
            {(a) => (
              <input
                {...a}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={60}
                className={controlClasses(false, 'h-10')}
              />
            )}
          </FormField>
          <FormField label="Tags" optional hint="Your own labels, e.g. Angular, Frontend.">
            {({ id }) => <TagInput id={id} value={tags} onChange={setTags} />}
          </FormField>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => void upload()} disabled={!file}>
              Upload
            </Button>
          </div>
        </div>
      ) : null}

      {stage.kind === 'uploading' ? (
        <div className="flex flex-col gap-3 py-4" aria-live="polite">
          <p className="text-sm font-medium">Uploading resume… {Math.round(stage.percent)}%</p>
          <ProgressBar value={stage.percent} label="Upload progress" />
        </div>
      ) : null}

      {processing ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center" aria-live="polite">
          {!parseStatus || isParsing(parseStatus) ? (
            <>
              <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
              <p className="font-medium">Extracting information…</p>
              <p className="text-sm text-muted">
                Your file is stored. We’re reading its text and organising the sections.
              </p>
            </>
          ) : parseStatus !== 'FAILED' ? (
            <>
              <CheckCircle2 className="size-8 text-success" aria-hidden />
              <p className="font-medium">Resume processed.</p>
              <p className="text-sm text-muted">
                Please review the extracted information. Nothing is added to your profile until you
                choose to.
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={close}>
                  Later
                </Button>
                <Link to={reviewHref} onClick={close} className={buttonClasses()}>
                  Review information
                </Link>
              </div>
            </>
          ) : (
            <>
              <CircleAlert className="size-8 text-danger" aria-hidden />
              <p className="font-medium">Resume could not be parsed.</p>
              <p className="text-sm text-muted">
                Your file is stored safely. {status.data?.parseError}
              </p>
              {retry.error ? (
                <p className="text-sm text-danger" role="alert">
                  {errorMessage(retry.error)}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button
                  variant="secondary"
                  loading={retry.isPending}
                  onClick={() => retry.mutate(undefined)}
                >
                  Retry
                </Button>
                <Button variant="secondary" onClick={reset}>
                  Upload another file
                </Button>
                <Link to={reviewHref} onClick={close} className={buttonClasses()}>
                  Continue manually
                </Link>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
