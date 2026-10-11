import type { JobRecommendationItem } from '@job-assist/shared';
import { Bookmark, X } from 'lucide-react';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { useDiscoveryAction } from '../hooks/useDiscovery';
import { discoveryApi } from '../services/discovery-api';
import { MatchScoreBadge } from './MatchScoreBadge';
import { ResumeRecommendation } from './ResumeRecommendation';

/** "Why this job was recommended", shown on the Job Details page when opened from a recommendation. */
export function RecommendationContext({
  recommendation: r,
}: {
  recommendation: JobRecommendationItem;
}) {
  const save = useDiscoveryAction(() => discoveryApi.save(r.id));
  const dismiss = useDiscoveryAction(() => discoveryApi.dismiss(r.id));
  const terminal = r.status === 'DISMISSED' || r.status === 'APPLIED';
  return (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <MatchScoreBadge score={r.matchScore} level={r.level} />
        {r.alert ? <span className="text-muted">from “{r.alert.name}”</span> : null}
      </div>
      <p>{r.reason}</p>
      {r.reasons.length > 0 ? (
        <ul aria-label="Recommendation reasons" className="list-disc space-y-0.5 pl-5 text-muted">
          {r.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <ResumeRecommendation resume={r.resume} />
      <p className="text-xs text-muted">
        Compatibility compares the posting with what your resume states. It is not a prediction of
        being hired.
      </p>
      {save.error || dismiss.error ? (
        <Alert>{errorMessage(save.error ?? dismiss.error)}</Alert>
      ) : null}
      {r.status === 'SAVED' ? (
        <p className="font-medium text-success">Saved to your jobs.</p>
      ) : r.status === 'DISMISSED' ? (
        <p className="text-muted">Dismissed.</p>
      ) : r.status === 'APPLIED' ? (
        <p className="font-medium text-success">You are tracking an application for this job.</p>
      ) : null}
      {!terminal ? (
        <div className="flex flex-wrap gap-2">
          {r.status !== 'SAVED' ? (
            <Button
              size="sm"
              variant="secondary"
              loading={save.isPending}
              onClick={() => save.mutate(undefined)}
            >
              <Bookmark className="size-3.5" aria-hidden />
              Save job
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            loading={dismiss.isPending}
            onClick={() => dismiss.mutate(undefined)}
          >
            <X className="size-3.5" aria-hidden />
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}
