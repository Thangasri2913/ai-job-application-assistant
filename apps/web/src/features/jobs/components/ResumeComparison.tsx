import { MATCH_LEVEL_LABELS, type MatchAnalysisItem } from '@job-assist/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../../shared/ui/Badge';
import { LEVEL_TONE } from './match-format';
import { MatchEvidence } from './MatchEvidence';
import { MatchScore } from './MatchScore';

function Row({ match, recommended }: { match: MatchAnalysisItem; recommended: boolean }) {
  const [open, setOpen] = useState(false);
  const detailsId = `match-${match.id}`;
  return (
    <li className="py-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {match.resumeId ? (
              <Link
                to={`/resumes/${match.resumeId}`}
                className="font-medium hover:text-primary hover:underline"
              >
                {match.resumeName}
              </Link>
            ) : (
              <span className="font-medium">{match.resumeName ?? 'Deleted resume'}</span>
            )}
            {match.versionNumber ? (
              <span className="text-sm text-muted">v{match.versionNumber}</span>
            ) : null}
            {recommended ? <Badge tone="success">Recommended</Badge> : null}
            {match.isDefaultResume ? <Badge>Default</Badge> : null}
          </div>
          <p className="mt-1 text-sm">
            <span className="text-muted">Strengths: </span>
            {match.strengths.slice(0, 2).join(' · ') || 'None found'}
          </p>
          <p className="text-sm">
            <span className="text-muted">Gaps: </span>
            {match.gaps.slice(0, 2).join(' · ') || 'None found'}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:flex-col sm:items-end">
          <span className="text-xl font-semibold tabular-nums">{match.overallScore}%</span>
          <Badge tone={LEVEL_TONE[match.level]}>{MATCH_LEVEL_LABELS[match.level]}</Badge>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        {open ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
        {open ? 'Hide details' : `Why ${match.overallScore}%?`}
      </button>
      {open ? (
        <div id={detailsId} className="mt-3 grid gap-5 rounded-xl bg-surface-muted/50 p-4">
          <MatchScore score={match.overallScore} level={match.level} scores={match.scores} />
          <MatchEvidence match={match} />
        </div>
      ) : null}
    </li>
  );
}

/** Every compared resume, best first, each with its own explanation. */
export function ResumeComparison({
  matches,
  recommendedVersionId,
}: {
  matches: MatchAnalysisItem[];
  recommendedVersionId: string | null;
}) {
  return (
    <ul className="divide-y divide-border" aria-label="Compared resumes">
      {matches.map((m) => (
        <Row
          key={m.id}
          match={m}
          recommended={m.resumeVersionId !== null && m.resumeVersionId === recommendedVersionId}
        />
      ))}
    </ul>
  );
}
