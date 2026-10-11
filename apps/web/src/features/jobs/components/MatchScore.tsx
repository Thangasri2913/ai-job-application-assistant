import {
  MATCH_DIMENSION_LABELS,
  MATCH_DIMENSIONS,
  MATCH_LEVEL_LABELS,
  MATCH_SCORE_NAME,
  type MatchDimension,
  type MatchDimensionScores,
  type MatchLevel,
} from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';
import { ProgressBar } from '../../../shared/ui/ProgressBar';
import { LEVEL_TONE } from './match-format';

/** Overall compatibility plus each dimension. Dimensions the job doesn't mention are shown as such. */
export function MatchScore({
  score,
  level,
  scores,
  weights,
}: {
  score: number;
  level: MatchLevel;
  scores: MatchDimensionScores;
  weights?: Record<MatchDimension, number>;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="text-center sm:pr-4">
        <div className="text-4xl font-semibold tabular-nums" aria-label={`${score} percent`}>
          {score}%
        </div>
        <Badge tone={LEVEL_TONE[level]} className="mt-2">
          {MATCH_LEVEL_LABELS[level]}
        </Badge>
        <p className="mt-2 max-w-40 text-xs text-muted">{MATCH_SCORE_NAME}</p>
      </div>
      <dl className="grid gap-2.5">
        {MATCH_DIMENSIONS.map((d) => {
          const value = scores[d];
          return (
            <div key={d} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
              <dt>
                {MATCH_DIMENSION_LABELS[d]}
                {weights ? <span className="ml-1 text-xs text-muted">({weights[d]}%)</span> : null}
              </dt>
              <dd className="contents">
                {value === null ? (
                  <span className="col-span-2 text-xs text-muted">Not stated in the job</span>
                ) : (
                  <>
                    <ProgressBar value={value} label={`${MATCH_DIMENSION_LABELS[d]} score`} />
                    <span className="text-right tabular-nums">{value}%</span>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
