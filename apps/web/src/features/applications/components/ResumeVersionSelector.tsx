import { Badge } from '../../../shared/ui/Badge';

export interface ResumeVersionOption {
  resumeVersionId: string;
  resumeName: string;
  versionNumber: number;
  /** Compatibility score from the job's analysis, when it was compared. */
  score: number | null;
  recommended: boolean;
  isDefault: boolean;
}

/**
 * Pick the exact resume version for an application. The AI recommendation is marked, but
 * the choice is the user's.
 */
export function ResumeVersionSelector({
  options,
  value,
  onChange,
  name = 'resumeVersionId',
}: {
  options: ResumeVersionOption[];
  value: string;
  onChange: (resumeVersionId: string) => void;
  name?: string;
}) {
  if (options.length === 0) {
    return (
      <p className="text-sm text-muted">
        You have no reviewed active resumes. Review a resume first.
      </p>
    );
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Resume used for this application</legend>
      {options.map((o) => (
        <label
          key={o.resumeVersionId}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40"
        >
          <input
            type="radio"
            name={name}
            value={o.resumeVersionId}
            checked={value === o.resumeVersionId}
            onChange={() => onChange(o.resumeVersionId)}
          />
          <span className="flex-1">
            <span className="font-medium">{o.resumeName}</span>{' '}
            <span className="text-muted">v{o.versionNumber}</span>
          </span>
          {o.score !== null ? <span className="tabular-nums text-muted">{o.score}%</span> : null}
          {o.recommended ? <Badge tone="success">AI recommended</Badge> : null}
          {o.isDefault ? <Badge>Default</Badge> : null}
        </label>
      ))}
      <p className="text-xs text-muted">
        The exact version you choose is stored with the application and never changes, even if you
        update this resume later.
      </p>
    </fieldset>
  );
}
