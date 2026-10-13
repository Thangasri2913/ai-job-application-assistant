import {
  CAREER_INSIGHT_CATEGORY_LABELS,
  type CareerInsightItem,
  type InsightConfidence,
} from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';

const CONFIDENCE_TONE: Record<InsightConfidence, 'neutral' | 'primary' | 'success'> = {
  LOW: 'neutral',
  MEDIUM: 'primary',
  HIGH: 'success',
};

/** Evidence-based insight cards: the claim, the computed facts behind it, and one action. */
export function InsightCards({ insights }: { insights: CareerInsightItem[] }) {
  return (
    <ul aria-label="Career insights" className="grid gap-3 lg:grid-cols-2">
      {insights.map((i) => (
        <li key={i.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="primary">{CAREER_INSIGHT_CATEGORY_LABELS[i.category]}</Badge>
            <Badge tone={CONFIDENCE_TONE[i.confidence]}>
              {i.confidence.charAt(0) + i.confidence.slice(1).toLowerCase()} confidence
            </Badge>
          </div>
          <h3 className="mt-2 font-semibold">{i.title}</h3>
          <p className="mt-1 text-sm">{i.explanation}</p>
          <p className="mt-2 text-sm">
            <span className="font-medium">Suggested action: </span>
            {i.recommendedAction}
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-primary">
              Evidence ({i.evidence.length})
            </summary>
            <ul aria-label="Evidence" className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
              {i.evidence.map((e) => (
                <li key={e.factId}>{e.statement}</li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
