import type { MatchAnalysisItem } from '@job-assist/shared';
import { STATUS_DISPLAY } from './match-format';

/** Every claim behind a score, citing the stored resume/profile data. Nothing is generated here. */
export function MatchEvidence({ match }: { match: MatchAnalysisItem }) {
  const { evidence } = match;
  return (
    <div className="grid gap-4 text-sm">
      <section>
        <h4 className="mb-1.5 font-medium">Skills</h4>
        {evidence.skills.length === 0 ? (
          <p className="text-muted">The job lists no specific skills.</p>
        ) : (
          <ul className="grid gap-1">
            {evidence.skills.map((s) => {
              const display = STATUS_DISPLAY[s.status];
              return (
                <li key={s.normalizedName} className="grid grid-cols-[1.25rem_1fr] gap-1">
                  <span aria-label={display.label} className={display.className}>
                    {display.symbol}
                  </span>
                  <span>
                    <span className="font-medium">{s.skill}</span>
                    {s.importance === 'PREFERRED' ? (
                      <span className="text-muted"> (preferred)</span>
                    ) : null}
                    <span className="text-muted"> — {s.evidence}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-1.5 font-medium">Experience</h4>
        <ul className="list-disc space-y-0.5 pl-5 text-muted">
          {evidence.experience.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {evidence.experience.relevantTitles.map((t) => (
            <li key={t}>Relevant role: {t}</li>
          ))}
          {evidence.experience.notes.length === 0 &&
          evidence.experience.relevantTitles.length === 0 ? (
            <li>No experience requirement to compare.</li>
          ) : null}
        </ul>
      </section>

      {evidence.responsibilities.length > 0 ? (
        <section>
          <h4 className="mb-1.5 font-medium">Responsibilities</h4>
          <ul className="grid gap-1.5">
            {evidence.responsibilities.map((r) => {
              const display = STATUS_DISPLAY[r.status];
              return (
                <li key={r.responsibility} className="grid grid-cols-[1.25rem_1fr] gap-1">
                  <span aria-label={display.label} className={display.className}>
                    {display.symbol}
                  </span>
                  <span>
                    {r.responsibility}
                    {r.matchedLine ? (
                      <span className="block text-muted">Resume: “{r.matchedLine}”</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {evidence.projects.length > 0 ? (
        <section>
          <h4 className="mb-1.5 font-medium">Relevant projects</h4>
          <ul className="list-disc space-y-0.5 pl-5">
            {evidence.projects.map((p) => (
              <li key={p.project}>
                {p.project} <span className="text-muted">— {p.matchedSkills.join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {evidence.education.requirement ? (
        <section>
          <h4 className="mb-1.5 font-medium">Education</h4>
          <p className="text-muted">{evidence.education.notes.join(' ')}</p>
        </section>
      ) : null}

      {evidence.keywords.matched.length + evidence.keywords.missing.length > 0 ? (
        <section>
          <h4 className="mb-1.5 font-medium">Keywords</h4>
          <p className="text-muted">
            Found: {evidence.keywords.matched.join(', ') || 'none'}
            {evidence.keywords.missing.length > 0
              ? ` · Not found: ${evidence.keywords.missing.join(', ')}`
              : ''}
          </p>
        </section>
      ) : null}
    </div>
  );
}
