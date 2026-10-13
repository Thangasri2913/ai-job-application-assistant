import type { SkillCoverageLevel, SkillIntelligenceRow } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { formatRate } from './format';

const LEVEL: Record<SkillCoverageLevel, { label: string; tone: 'success' | 'warning' | 'danger' }> =
  {
    STRONG: { label: 'Well covered', tone: 'success' },
    PARTIAL: { label: 'Partly covered', tone: 'warning' },
    LIMITED: { label: 'Limited evidence', tone: 'danger' },
  };

/** Skills your analysed target jobs ask for, and how your best-matching resume covers them. */
export function SkillTable({ skills }: { skills: SkillIntelligenceRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">Skill intelligence</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Skill
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Target jobs
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Required in
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Resume coverage
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-medium">
              Interview rate (applications)
            </th>
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s.skill} className="border-b border-border last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <span className="flex flex-wrap items-center gap-1.5">
                  {s.skill}
                  {s.isGap ? <Badge tone="warning">Worth strengthening</Badge> : null}
                </span>
              </th>
              <td className="px-2 py-2 text-right tabular-nums">{s.jobs}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.requiredIn}</td>
              <td className="px-2 py-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={LEVEL[s.coverageLevel].tone}>{LEVEL[s.coverageLevel].label}</Badge>
                  <span className="text-xs text-muted">
                    {s.coverage.matched} shown · {s.coverage.partial} partial · {s.coverage.missing}{' '}
                    not found
                  </span>
                </span>
              </td>
              <td className="py-2 pl-2 text-right tabular-nums">
                {s.outcomes.applications > 0
                  ? `${formatRate(s.outcomes.interviewRate)} (${s.outcomes.applications})`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
