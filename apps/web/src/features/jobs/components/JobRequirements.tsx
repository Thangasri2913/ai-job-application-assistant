import type { JobRequirementItem, JobRequirementType } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';

function SkillChips({
  skills,
  tone,
}: {
  skills: JobRequirementItem[];
  tone: 'primary' | 'neutral';
}) {
  if (skills.length === 0) return <p className="text-sm text-muted">None stated.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <li key={s.id}>
          <Badge tone={tone}>
            <span title={s.evidence ?? undefined}>
              {s.name}
              {s.origin === 'INFERRED' ? ' *' : ''}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function Lines({ items }: { items: JobRequirementItem[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((r) => (
        <li key={r.id}>
          {r.name}
          {r.importance === 'PREFERRED' ? (
            <span className="text-muted"> (nice to have)</span>
          ) : null}
          {r.detectedBy === 'AI' ? <span className="text-muted"> · found by AI</span> : null}
        </li>
      ))}
    </ul>
  );
}

const SECTIONS: { type: Exclude<JobRequirementType, 'SKILL'>; title: string }[] = [
  { type: 'EXPERIENCE', title: 'Experience' },
  { type: 'EDUCATION', title: 'Education' },
  { type: 'RESPONSIBILITY', title: 'Responsibilities' },
  { type: 'OTHER', title: 'Other requirements' },
];

/** Required and preferred requirements, kept apart; each item quotes the posting (hover a skill). */
export function JobRequirements({ requirements }: { requirements: JobRequirementItem[] }) {
  const skills = requirements.filter((r) => r.type === 'SKILL');
  const hasInferred = skills.some((s) => s.origin === 'INFERRED');
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="req-required">
        <h3
          id="req-required"
          className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase"
        >
          Required skills
        </h3>
        <SkillChips skills={skills.filter((s) => s.importance === 'REQUIRED')} tone="primary" />
      </section>
      <section aria-labelledby="req-preferred">
        <h3
          id="req-preferred"
          className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase"
        >
          Preferred skills
        </h3>
        <SkillChips skills={skills.filter((s) => s.importance === 'PREFERRED')} tone="neutral" />
      </section>
      {hasInferred ? (
        <p className="text-xs text-muted">
          * Mentioned in the posting without saying whether it is required; treated as required.
        </p>
      ) : null}
      {SECTIONS.map(({ type, title }) => {
        const items = requirements.filter((r) => r.type === type);
        if (items.length === 0) return null;
        return (
          <section key={type} aria-labelledby={`req-${type}`}>
            <h3
              id={`req-${type}`}
              className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase"
            >
              {title}
            </h3>
            <Lines items={items} />
          </section>
        );
      })}
    </div>
  );
}
