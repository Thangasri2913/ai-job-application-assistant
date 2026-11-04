import { X } from 'lucide-react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { Card } from '../../../shared/ui/Card';
import { LoadingState } from '../../../shared/ui/LoadingState';
import { useDismissNextStep, useNextSteps, useRestoreNextSteps } from '../hooks/useLearn';

const CONFIDENCE = {
  HIGH: { label: 'Strong evidence', tone: 'success' },
  MEDIUM: { label: 'Some evidence', tone: 'neutral' },
  LOW: { label: 'Little evidence yet', tone: 'warning' },
} as const;

/** Ranked, explained suggestions with a way to dismiss each one. */
export function NextStepsCard() {
  const query = useNextSteps();
  const dismiss = useDismissNextStep();
  const restore = useRestoreNextSteps();
  const error = query.error ?? dismiss.error ?? restore.error;
  const basedOn = query.data?.basedOn;
  const sparse =
    basedOn && basedOn.practiceAnswers < 5 && basedOn.diagnostics === 0 && !basedOn.targetRole;

  return (
    <Card aria-labelledby="next-steps">
      <h2 id="next-steps" className="text-base font-semibold">
        Suggested next steps
      </h2>
      {query.isPending ? (
        <LoadingState label="Working out suggestions" />
      ) : query.isError ? (
        <div className="mt-3">
          <Alert>
            {errorMessage(error)}{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          </Alert>
        </div>
      ) : (
        <>
          {sparse ? (
            <p className="mt-1 text-sm text-muted">
              These are general suggestions: there is little learning activity to personalise them
              yet.
            </p>
          ) : null}
          {query.data.steps.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No suggestions right now.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {query.data.steps.slice(0, 5).map((step) => (
                <li key={step.key} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{step.title}</p>
                    <Badge tone={CONFIDENCE[step.confidence].tone}>
                      {CONFIDENCE[step.confidence].label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm">
                    <span className="font-medium">Why: </span>
                    {step.reason}
                  </p>
                  {step.evidence.length ? (
                    <details className="mt-1 text-xs text-muted">
                      <summary className="cursor-pointer">What this is based on</summary>
                      <ul className="mt-1 list-disc pl-5">
                        {step.evidence.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Link
                      to={step.href}
                      className={buttonClasses(step.rank === 1 ? 'primary' : 'secondary', 'sm')}
                    >
                      {step.rank === 1 ? 'Start' : 'Open'}
                      <span className="sr-only">: {step.title}</span>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={dismiss.isPending}
                      aria-label={`Dismiss suggestion: ${step.title}`}
                      onClick={() => dismiss.mutate(step.key)}
                    >
                      <X className="size-4" aria-hidden />
                      Not now
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {query.data.dismissedCount ? (
            <p className="mt-3 text-sm">
              {query.data.dismissedCount} dismissed{' '}
              {query.data.dismissedCount === 1 ? 'suggestion is' : 'suggestions are'} hidden.{' '}
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-2"
                disabled={restore.isPending}
                onClick={() => restore.mutate()}
              >
                Show them again
              </button>
            </p>
          ) : null}
          {dismiss.isError || restore.isError ? (
            <div className="mt-2">
              <Alert>{errorMessage(dismiss.error ?? restore.error)}</Alert>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
