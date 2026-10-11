import { MATCH_LEVEL_LABELS, MATCH_SCORE_NAME, type MatchLevel } from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { LEVEL_TONE } from '../../jobs/components/match-format';

/** Compact compatibility score with its level. Never described as a hiring probability. */
export function MatchScoreBadge({ score, level }: { score: number; level: MatchLevel }) {
  return (
    <Badge tone={LEVEL_TONE[level]} className="tabular-nums">
      <span title={MATCH_SCORE_NAME}>
        {score}% · {MATCH_LEVEL_LABELS[level]}
      </span>
    </Badge>
  );
}
