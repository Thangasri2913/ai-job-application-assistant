const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const formatDate = (iso: string) => dateFormatter.format(new Date(iso));

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** `YYYY-MM-DD` calendar date (no time zone) → "Oct 1, 2026". */
export const formatDay = (isoDate: string) => dayFormatter.format(new Date(`${isoDate}T00:00:00Z`));

/** `YYYY-MM-DD` calendar date → "Jul 2023". */
export const formatMonth = (isoDate: string | null) =>
  isoDate ? monthFormatter.format(new Date(`${isoDate}T00:00:00Z`)) : null;

export function formatDateRange(
  start: string | null,
  end: string | null,
  isCurrent = false,
): string {
  const from = formatMonth(start);
  const to = isCurrent ? 'Present' : formatMonth(end);
  if (from && to) return `${from} – ${to}`;
  return from ?? to ?? '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
