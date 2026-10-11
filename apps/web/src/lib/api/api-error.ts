import type { ApiErrorResponse, ApiFieldError } from '@job-assist/shared';

/** Error thrown by the API client. `message` is always safe to show to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: ApiFieldError[];
  /** Extra safe identifiers from the server, e.g. `existingJobId`. */
  readonly meta: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: ApiFieldError[] = [],
    meta: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.meta = meta;
  }

  static fromResponse(status: number, body: unknown): ApiError {
    if (isApiErrorBody(body))
      return new ApiError(status, body.code, body.message, body.details ?? [], body.meta ?? {});
    if (status >= 500)
      return new ApiError(
        status,
        'INTERNAL_ERROR',
        'Something went wrong on our side. Please try again.',
      );
    return new ApiError(status, 'UNKNOWN', 'Something went wrong. Please try again.');
  }

  static network(): ApiError {
    return new ApiError(
      0,
      'NETWORK_ERROR',
      'Can’t reach the server. Check your connection and try again.',
    );
  }
}

function isApiErrorBody(body: unknown): body is ApiErrorResponse {
  return typeof body === 'object' && body !== null && 'code' in body && 'message' in body;
}

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}
