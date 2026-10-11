/**
 * Error body returned by every failing API request.
 * Produced by the API's global exception filter.
 */
export interface ApiErrorResponse {
  statusCode: number;
  /** Stable, machine-readable code, e.g. `VALIDATION_FAILED`, `INVALID_CREDENTIALS`. */
  code: string;
  /** Human-readable summary, safe to show to the user. */
  message: string;
  /** Field-level validation problems, when applicable. */
  details?: ApiFieldError[];
  /** Extra safe identifiers for the client, e.g. `{ existingJobId }` on a duplicate job. */
  meta?: Record<string, string>;
  requestId?: string;
  timestamp: string;
  path: string;
}

export interface ApiFieldError {
  field: string;
  messages: string[];
}

/** Envelope for paginated list endpoints. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const API_PREFIX = 'api';
export const API_VERSION = '1';
