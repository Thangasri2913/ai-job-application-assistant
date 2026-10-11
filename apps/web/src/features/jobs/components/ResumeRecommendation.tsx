import {
  MATCH_LEVEL_LABELS,
  type JobDetail,
  type MatchAnalysisItem,
  type ResumeRecommendationItem,
} from '@job-assist/shared';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { useJobAction } from '../hooks/useJobs';
import { jobsApi } from '../services/jobs-api';
import { LEVEL_TONE } from './match-format';

/**
 * The recommended resume and why, plus the user's own choice. The recommendation is
 * advisory: any compared resume can be chosen instead.
 */
export function ResumeRecommendation({
  job,
  recommendation,
  reason,
  matches,
}: {
  job: JobDetail;
  recommendation: ResumeRecommendationItem | null;
  reason: string | null;
  matches: MatchAnalysisItem[];
}) {
  const select = useJobAction((versionId: string) => jobsApi.selectResume(job.id, versionId));
  const clear = useJobAction(() => jobsApi.clearSelection(job.id));
  const selectedId = job.selectedResume?.resumeVersionId ?? null;
  const [choice, setChoice] = useState<string | null>(null);
  const others = matches.filter(
    (m) => m.resumeVersionId && m.resumeVersionId !== recommendation?.resumeVersionId,
  );

  if (!recommendation) {
    return <p className="text-sm text-muted">{reason ?? 'No recommendation is available.'}</p>;
  }
  const recommendedSelected = selectedId !== null && selectedId === recommendation.resumeVersionId;

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-success/40 bg-success-soft/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-success uppercase">
              Recommended resume
            </p>
            <p className="text-lg font-semibold">
              {recommendation.resumeName}
              {recommendation.versionNumber ? (
                <span className="ml-2 text-sm font-normal text-muted">
                  v{recommendation.versionNumber}
                </span>
              ) : null}
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-semibold tabular-nums">{recommendation.score}%</span>
            <Badge tone={LEVEL_TONE[recommendation.level]} className="ml-2">
              {MATCH_LEVEL_LABELS[recommendation.level]}
            </Badge>
          </div>
        </div>
        <h3 className="mt-3 text-sm font-medium">Why</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
          {recommendation.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {recommendation.gaps.length > 0 ? (
          <>
            <h3 className="mt-3 text-sm font-medium">Potential gaps</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {recommendation.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="mt-4">
          {recommendedSelected ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" aria-hidden /> You’re using the recommended resume
            </p>
          ) : (
            <Button
              size="sm"
              loading={select.isPending && select.variables === recommendation.resumeVersionId}
              disabled={!recommendation.resumeVersionId}
              onClick={() =>
                recommendation.resumeVersionId && select.mutate(recommendation.resumeVersionId)
              }
            >
              Use recommended resume
            </Button>
          )}
        </div>
      </div>

      {others.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Or choose another resume</legend>
          {others.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="resume-choice"
                value={m.resumeVersionId!}
                checked={(choice ?? selectedId) === m.resumeVersionId}
                onChange={() => setChoice(m.resumeVersionId)}
              />
              <span>
                {m.resumeName} <span className="text-muted">— {m.overallScore}%</span>
              </span>
              {selectedId === m.resumeVersionId ? <Badge tone="primary">Your choice</Badge> : null}
            </label>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!choice || choice === selectedId}
              loading={select.isPending && select.variables === choice}
              onClick={() => choice && select.mutate(choice)}
            >
              Use selected resume
            </Button>
            {selectedId ? (
              <Button
                size="sm"
                variant="ghost"
                loading={clear.isPending}
                onClick={() => clear.mutate(undefined)}
              >
                Clear choice
              </Button>
            ) : null}
          </div>
        </fieldset>
      ) : null}
      {select.error || clear.error ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(select.error ?? clear.error)}
        </p>
      ) : null}
    </div>
  );
}
