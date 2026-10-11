import type { ResumeContent } from '@job-assist/shared';
import { CircleAlert, FileSearch, Loader2, Lock } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card } from '../../../shared/ui/Card';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ImportToProfilePanel } from '../components/ImportToProfilePanel';
import { type ContentEditorHandle, ResumeContentEditor } from '../components/ResumeContentEditor';
import { ResumeContentView } from '../components/ResumeContentView';
import {
  isParsing,
  useExtractedData,
  useResume,
  useResumeAction,
  useSaveContent,
} from '../hooks/useResumes';
import { resumesApi } from '../services/resumes-api';

const EMPTY: ResumeContent = {
  contact: {
    fullName: null,
    email: null,
    phone: null,
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
  },
  headline: null,
  summary: null,
  skills: [],
  experiences: [],
  educations: [],
  projects: [],
  certifications: [],
  achievements: [],
  languages: [],
  estimatedYearsOfExperience: null,
};

export function ResumeReviewPage() {
  const { resumeId = '', versionId = '' } = useParams();
  const navigate = useNavigate();
  const resume = useResume(resumeId);
  const data = useExtractedData(resumeId, versionId);
  const editor = useRef<ContentEditorHandle>(null);
  const save = useSaveContent(resumeId, versionId);
  const activate = useResumeAction(() => resumesApi.activate(resumeId, versionId));
  const reparse = useResumeAction(() => resumesApi.reparse(resumeId, versionId));
  const [savedContent, setSavedContent] = useState<ResumeContent | null>(null);
  const [source, setSource] = useState<'parsed' | 'ai'>('parsed');

  if (data.isPending || resume.isPending)
    return <LoadingState label="Loading extracted information" />;
  if (data.isError) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />;
  if (resume.isError) return <ErrorState error={resume.error} />;

  const extracted = data.data;
  const version = resume.data.versions.find((v) => v.id === versionId);
  const title = `Review ${resume.data.name}${version ? ` · v${version.versionNumber}` : ''}`;
  const back = (
    <Link to={`/resumes/${resumeId}`} className={buttonClasses('secondary')}>
      Back to resume
    </Link>
  );

  if (isParsing(extracted.parseStatus)) {
    return (
      <>
        <PageHeader title={title} actions={back} />
        <Card className="flex flex-col items-center gap-3 py-12 text-center" aria-live="polite">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <p className="font-medium">Extracting information…</p>
          <p className="text-sm text-muted">This usually takes a few seconds.</p>
        </Card>
      </>
    );
  }

  const confirmed = savedContent ?? extracted.confirmed;

  if (!extracted.editable) {
    return (
      <>
        <PageHeader title={title} actions={back} />
        <div className="mb-4">
          <Alert tone="success">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5" aria-hidden /> This version is frozen so it always means
              the same thing. Create a new version to make changes.
            </span>
          </Alert>
        </div>
        <Card>
          {confirmed ? (
            <ResumeContentView content={confirmed} />
          ) : (
            <p className="text-sm text-muted">No reviewed content.</p>
          )}
        </Card>
      </>
    );
  }

  const startingPoint =
    confirmed ?? (source === 'ai' && extracted.ai ? extracted.ai : extracted.parsed) ?? EMPTY;

  const submit = async (makeCurrent: boolean) => {
    const content = await editor.current?.submit();
    if (!content) return;
    const result = await save.mutateAsync(content);
    setSavedContent(result.confirmed);
    if (makeCurrent) {
      await activate.mutateAsync(undefined);
      void navigate(`/resumes/${resumeId}`);
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        subtitle="Check what we extracted and correct anything that’s wrong before saving."
        actions={back}
      />

      {extracted.parseStatus === 'FAILED' ? (
        <div className="mb-5">
          <Alert>
            <p className="font-medium">Resume could not be parsed.</p>
            <p>{extracted.parseError}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={reparse.isPending}
                onClick={() => reparse.mutate(undefined)}
              >
                Try again
              </Button>
              <span className="self-center">
                or continue manually by filling in the details below.
              </span>
            </div>
          </Alert>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Extracted automatically — please review.</p>
            <p>
              These values were read from your file and may be incomplete or wrong. Nothing is saved
              or added to your profile until you choose to.
              {confirmed ? ' Showing your saved review.' : ''}
            </p>
            {extracted.aiStatus === 'INVALID' || extracted.aiStatus === 'FAILED' ? (
              <p className="mt-1">AI structuring was attempted but not used: {extracted.aiNote}</p>
            ) : null}
            {extracted.ai && !confirmed ? (
              <p className="mt-1">
                An AI-structured version is also available.{' '}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => setSource(source === 'ai' ? 'parsed' : 'ai')}
                >
                  {source === 'ai'
                    ? 'Use the rule-based extraction'
                    : 'Use the AI-structured version'}
                </button>
              </p>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <ResumeContentEditor
          key={`${source}-${confirmed ? 'saved' : 'new'}`}
          ref={editor}
          initial={startingPoint}
        />

        <aside className="flex flex-col gap-4 xl:sticky xl:top-24">
          <Card>
            <h2 className="text-base font-semibold">Save your review</h2>
            <p className="mt-1 mb-4 text-sm text-muted">
              Saving keeps your corrections on this draft. Making it current freezes it as the
              version used for this resume.
            </p>
            {save.isError || activate.isError ? (
              <div className="mb-3">
                <Alert>{errorMessage(save.error ?? activate.error)}</Alert>
              </div>
            ) : null}
            {savedContent && !activate.isPending ? (
              <p className="mb-3 text-sm text-success" role="status">
                Review saved.
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Button
                loading={save.isPending || activate.isPending}
                onClick={() => void submit(true).catch(() => undefined)}
              >
                Save and make current
              </Button>
              <Button
                variant="secondary"
                disabled={save.isPending || activate.isPending}
                onClick={() => void submit(false).catch(() => undefined)}
              >
                Save draft
              </Button>
            </div>
          </Card>

          {confirmed ? <ImportToProfilePanel content={confirmed} /> : null}

          {extracted.extractedText ? (
            <Card>
              <details>
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <FileSearch className="size-4" aria-hidden />
                  Original text from your file
                </summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-surface-muted p-3 text-xs whitespace-pre-wrap">
                  {extracted.extractedText}
                </pre>
              </details>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
