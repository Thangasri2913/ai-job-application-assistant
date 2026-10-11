import {
  EVALUATION_DIMENSION_LABELS,
  EVALUATION_DIMENSIONS,
  INTERVIEW_FEEDBACK_LABEL,
  type InterviewEvaluationItem,
  RULES_FEEDBACK_LABEL,
  type StarLevel,
} from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';

const STAR_TONE: Record<StarLevel, 'success' | 'primary' | 'warning' | 'danger'> = {
  STRONG: 'success',
  PRESENT: 'primary',
  WEAK: 'warning',
  MISSING: 'danger',
};
const STAR_TEXT: Record<StarLevel, string> = {
  STRONG: 'Strong',
  PRESENT: 'Present',
  WEAK: 'Weak',
  MISSING: 'Missing',
};

/** Practice feedback for one answer. Labelled as practice feedback, never as a measurement. */
export function AnswerFeedback({ evaluation: e }: { evaluation: InterviewEvaluationItem }) {
  return (
    <div
      className="grid gap-3 rounded-xl bg-surface-muted/60 p-4 text-sm"
      aria-label="Answer feedback"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xl font-semibold tabular-nums">Score: {e.overallScore}/10</span>
        <Badge tone={e.source === 'AI' ? 'primary' : 'neutral'}>
          {e.source === 'AI' ? INTERVIEW_FEEDBACK_LABEL : RULES_FEEDBACK_LABEL}
        </Badge>
      </div>
      {e.feedback ? <p>{e.feedback}</p> : null}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        {EVALUATION_DIMENSIONS.map((d) => (
          <div key={d} className="flex justify-between gap-2">
            <dt className="text-muted">{EVALUATION_DIMENSION_LABELS[d]}</dt>
            <dd className="tabular-nums">
              {e.dimensions[d] === null ? '—' : `${e.dimensions[d]}/10`}
            </dd>
          </div>
        ))}
      </dl>
      {e.star ? (
        <div>
          <p className="mb-1 font-medium">STAR structure</p>
          <ul className="flex flex-wrap gap-2" aria-label="STAR structure">
            {(['situation', 'task', 'action', 'result'] as const).map((k) => (
              <li key={k}>
                <Badge tone={STAR_TONE[e.star![k]]}>
                  {k[0]!.toUpperCase() + k.slice(1)}: {STAR_TEXT[e.star![k]]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {e.technical ? (
        <p className="text-muted">
          Technical — correctness {e.technical.correctness}/10 · depth {e.technical.depth}/10 ·
          trade-offs {e.technical.tradeOffs}/10 · practical experience{' '}
          {e.technical.practicalExperience}/10
        </p>
      ) : null}
      {e.strengths.length ? (
        <div>
          <p className="font-medium">Strengths</p>
          <ul className="space-y-0.5">
            {e.strengths.map((s) => (
              <li key={s}>
                <span className="text-success">✓</span> {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {e.improvements.length ? (
        <div>
          <p className="font-medium">Improve</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {e.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {e.note ? <p className="text-xs text-muted">{e.note}</p> : null}
    </div>
  );
}
