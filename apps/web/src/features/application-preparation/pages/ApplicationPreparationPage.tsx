import { Link, useParams } from 'react-router';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { ApplicationQuestions } from '../components/ApplicationQuestions';
import { CoverLetterEditor } from '../components/CoverLetterEditor';
import { PreparationHeader } from '../components/PreparationHeader';
import { ResumeSuggestions } from '../components/ResumeSuggestions';
import { usePreparation } from '../hooks/usePreparation';

/**
 * AI-assisted preparation of one application. Everything here is a suggestion until the user
 * accepts, edits or approves it; nothing is submitted anywhere.
 */
export function ApplicationPreparationPage() {
  const { applicationId = '' } = useParams();
  const prep = usePreparation(applicationId);

  if (prep.isPending) return <LoadingState label="Preparing…" />;
  if (prep.isError) return <ErrorState error={prep.error} onRetry={() => void prep.refetch()} />;
  const p = prep.data;
  const busy = p.busyOperation !== null;

  return (
    <>
      <PageHeader
        title="Application preparation"
        subtitle={`${p.job.title} · ${p.job.companyName}. Suggestions use only your resume and profile; you review and approve everything.`}
        actions={
          <Link to={`/applications/${applicationId}`} className={buttonClasses('secondary', 'md')}>
            Back to application
          </Link>
        }
      />
      {busy ? (
        <p
          className="mb-5 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-primary"
          aria-live="polite"
        >
          Something is being generated for this application… other generations are paused until it
          finishes.
        </p>
      ) : null}
      <div className="grid gap-6">
        <PreparationHeader prep={p} />
        <ResumeSuggestions applicationId={applicationId} busy={busy} />
        <CoverLetterEditor applicationId={applicationId} busy={busy} />
        <ApplicationQuestions applicationId={applicationId} busy={busy} />
      </div>
    </>
  );
}
