import type { OutcomeMetrics } from '@job-assist/shared';
import type { ReactNode } from 'react';
import { Badge } from '../../../shared/ui/Badge';
import { formatRate } from './format';

export interface OutcomeTableRow extends OutcomeMetrics {
  key: string;
  label: ReactNode;
  /** Extra cells after the label (e.g. jobs matched). */
  extra?: ReactNode[];
}

/**
 * Outcome counts and rates per group. Groups below the minimum sample are marked as limited
 * data, and rates without a denominator show a dash.
 */
export function OutcomeTable({
  caption,
  labelHeader,
  extraHeaders = [],
  rows,
  minimumGroupSize,
}: {
  caption: string;
  labelHeader: string;
  extraHeaders?: string[];
  rows: OutcomeTableRow[];
  minimumGroupSize: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              {labelHeader}
            </th>
            {extraHeaders.map((h) => (
              <th key={h} scope="col" className="px-2 py-2 text-right font-medium">
                {h}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Applications
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Interviews
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Interview rate
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Offers
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-medium">
              Offer rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <span className="flex flex-wrap items-center gap-1.5">
                  {r.label}
                  {r.applications > 0 && !r.reliable ? (
                    <Badge className="cursor-help" tone="neutral">
                      <span title={`Fewer than ${minimumGroupSize} applications: not compared.`}>
                        Limited data
                      </span>
                    </Badge>
                  ) : null}
                </span>
              </th>
              {(r.extra ?? []).map((cell, i) => (
                <td key={i} className="px-2 py-2 text-right tabular-nums">
                  {cell}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums">{r.applications}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.interviews}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatRate(r.interviewRate)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.offers}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{formatRate(r.offerRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        “—” means the rate can’t be calculated (nothing recorded to divide by). Groups with fewer
        than {minimumGroupSize} applications are marked “Limited data” and not compared.
      </p>
    </div>
  );
}
