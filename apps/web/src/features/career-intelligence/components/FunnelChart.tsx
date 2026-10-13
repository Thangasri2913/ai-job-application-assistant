import type { FunnelStageMetric } from '@job-assist/shared';
import { formatRate } from './format';

/**
 * Cumulative application funnel as a single-series horizontal bar list: one hue (magnitude),
 * thin bars from a shared baseline, values at the bar tip in text ink, and a hover/focus
 * tooltip with the conversion from the previous stage. The table view is the list itself.
 */
export function FunnelChart({ stages }: { stages: FunnelStageMetric[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ol aria-label="Application funnel" className="grid gap-2.5">
      {stages.map((s, i) => {
        const conversion =
          i === 0
            ? 'All tracked applications'
            : `${formatRate(s.conversionFromPrevious)} of ${stages[i - 1]!.label.toLowerCase()}`;
        return (
          <li
            key={s.stage}
            tabIndex={0}
            aria-label={`${s.label}: ${s.count}. ${conversion}.`}
            className="group relative grid grid-cols-[8rem_1fr] items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="text-sm text-muted">{s.label}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-5 rounded-r-[4px] bg-primary transition-opacity group-hover:opacity-80"
                style={{ width: `${s.count === 0 ? 0 : Math.max(2, (s.count / max) * 100)}%` }}
              />
              <span className="text-sm font-medium tabular-nums" aria-hidden>
                {s.count}
              </span>
            </span>
            <span
              role="tooltip"
              className="pointer-events-none invisible absolute top-full left-32 z-10 mt-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md group-hover:visible group-focus-visible:visible"
            >
              <span className="font-medium">{s.label}</span> · {s.count} · {conversion}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
