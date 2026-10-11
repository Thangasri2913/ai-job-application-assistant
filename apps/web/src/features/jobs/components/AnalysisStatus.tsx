import type { JobDetail } from '@job-assist/shared';
import { Loader2 } from 'lucide-react';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { isAnalysing } from '../hooks/useJobs';

/** Progress, failure and staleness of the job's analysis. Failures are always shown. */
export function AnalysisStatus({
  job,
  stale,
  onAnalyze,
  analyzing,
}: {
  job: JobDetail;
  stale: boolean;
  onAnalyze: () => void;
  analyzing: boolean;
}) {
  const latest = job.latestAnalysis;
  if (isAnalysing(latest?.status)) {
    return (
      <div
        className="mb-5 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-primary"
        aria-live="polite"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Analysing the job and comparing it with all your resumes…
      </div>
    );
  }
  if (latest?.status === 'FAILED') {
    return (
      <div className="mb-5">
        <Alert>
          <p className="font-medium">The analysis didn’t complete.</p>
          <p>{latest.error}</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            loading={analyzing}
            onClick={onAnalyze}
          >
            Try again
          </Button>
        </Alert>
      </div>
    );
  }
  const notice = !latest
    ? 'This job hasn’t been analysed yet.'
    : latest.outdated
      ? 'The job details changed after this analysis.'
      : stale
        ? 'Your resumes changed after this analysis (new versions, reviews or archived resumes).'
        : null;
  if (!notice) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
      <span>{notice}</span>
      <Button
        size="sm"
        loading={analyzing}
        onClick={onAnalyze}
        disabled={job.status === 'ARCHIVED'}
      >
        {latest ? 'Analyse again' : 'Analyse job'}
      </Button>
    </div>
  );
}
