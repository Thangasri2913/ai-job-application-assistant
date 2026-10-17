import { Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Button } from '../../../shared/ui/Button';
import { useSmartApplyAction } from '../hooks/useSmartApply';
import { smartApplyApi } from '../services/smart-apply-api';

/** Starts Smart Apply for a job and opens it. Nothing is submitted. */
export function PrepareApplicationButton({
  jobId,
  resumeVersionId,
  size = 'sm',
}: {
  jobId: string;
  resumeVersionId?: string | null;
  size?: 'sm' | 'md';
}) {
  const navigate = useNavigate();
  const prepare = useSmartApplyAction(() =>
    smartApplyApi.prepare({ jobId, ...(resumeVersionId ? { resumeVersionId } : {}) }),
  );
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        size={size}
        variant="secondary"
        disabled={prepare.isPending}
        onClick={() =>
          prepare.mutate(undefined, { onSuccess: (d) => void navigate(`/smart-apply/${d.id}`) })
        }
      >
        <Wand2 className="size-3.5" aria-hidden />
        Prepare application
      </Button>
      {prepare.error ? (
        <span role="alert" className="text-xs text-danger">
          {errorMessage(prepare.error)}
        </span>
      ) : null}
    </span>
  );
}
