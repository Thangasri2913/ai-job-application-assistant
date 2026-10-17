import type { SubmissionEligibility } from '@job-assist/shared';
import { CircleCheck, CircleSlash } from 'lucide-react';

/** Why the application can or can't be submitted automatically. */
export function EligibilityPanel({ eligibility }: { eligibility: SubmissionEligibility }) {
  return (
    <section aria-labelledby="eligibility-title" className="grid gap-2 text-sm">
      <h3 id="eligibility-title" className="font-semibold">
        {eligibility.autoSubmitEligible
          ? 'Eligible for authorised automatic submission'
          : 'You submit this application on the official site'}
      </h3>
      <p className="text-muted">{eligibility.summary}</p>
      <ul aria-label="Eligibility checks" className="grid gap-1">
        {eligibility.checks.map((c) => (
          <li key={c.code} className="flex items-start gap-2">
            {c.satisfied ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Met" />
            ) : (
              <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Not met" />
            )}
            <span>{c.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
