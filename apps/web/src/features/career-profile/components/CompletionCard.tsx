import { CheckCircle2, Circle } from 'lucide-react';
import type { ProfileCompletion } from '@job-assist/shared';
import { Card } from '../../../shared/ui/Card';
import { ProgressBar } from '../../../shared/ui/ProgressBar';

/** Shows the completion score and exactly which weighted items are done or missing. */
export function CompletionCard({
  completion,
  compact = false,
}: {
  completion: ProfileCompletion;
  compact?: boolean;
}) {
  const missing = completion.items.filter((i) => !i.complete);
  const done = completion.items.filter((i) => i.complete);
  const ordered = compact ? missing.slice(0, 4) : [...done, ...missing];

  return (
    <Card aria-labelledby="completion-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="completion-heading" className="text-base font-semibold">
          Profile completion
        </h2>
        <span className="text-2xl font-semibold tabular-nums">{completion.percentage}%</span>
      </div>
      <ProgressBar value={completion.percentage} label="Profile completion" />
      {missing.length === 0 ? (
        <p className="mt-4 text-sm text-success">Your profile is complete.</p>
      ) : (
        <>
          <p className="mt-4 mb-2 text-sm text-muted">
            {compact ? 'Complete these next:' : 'Each item adds the points shown.'}
          </p>
          <ul className="grid gap-1.5">
            {ordered.map((item) => (
              <li key={item.key} className="flex items-start gap-2 text-sm">
                {item.complete ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-label="To do" />
                )}
                <span className="flex-1">
                  <span className={item.complete ? 'text-muted' : 'font-medium'}>{item.label}</span>
                  {!item.complete ? <span className="block text-muted">{item.hint}</span> : null}
                </span>
                {!compact ? (
                  <span className="text-xs text-muted tabular-nums">+{item.weight}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
