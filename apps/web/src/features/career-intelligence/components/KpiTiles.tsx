import type { CareerTotals } from '@job-assist/shared';
import { formatRate } from './format';

/** Headline numbers: submitted applications and what came of them. */
export function KpiTiles({ totals }: { totals: CareerTotals }) {
  const o = totals.outcomes;
  const tiles: [string, string, string | null][] = [
    ['Applications', String(totals.submitted), `${totals.tracked} tracked`],
    ['Interviews', String(o.interviews), null],
    ['Offers', String(o.offers), o.accepted > 0 ? `${o.accepted} accepted` : null],
    [
      'Interview rate',
      formatRate(o.interviewRate),
      o.interviewRate === null
        ? 'No submitted applications yet'
        : `of ${totals.submitted} submitted`,
    ],
    [
      'Offer rate',
      formatRate(o.offerRate),
      o.offerRate === null ? 'No submitted applications yet' : `of ${totals.submitted} submitted`,
    ],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map(([label, value, hint]) => (
        <div key={label} className="rounded-xl border border-border bg-surface p-4">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          {hint ? <dd className="text-xs text-muted">{hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
