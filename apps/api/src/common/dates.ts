import type { IsoDate } from '@job-assist/shared';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` → Date at UTC midnight (Postgres `date`). */
export function toDbDate(value: IsoDate | null | undefined): Date | null {
  if (!value) return null;
  if (!ISO_DATE.test(value)) throw new Error(`Invalid ISO date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Postgres `date` → `YYYY-MM-DD`. */
export function fromDbDate(value: Date | null): IsoDate | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
