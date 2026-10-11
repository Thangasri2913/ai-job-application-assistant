import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiFieldError } from '@job-assist/shared';
import { ErrorCode } from './error-codes.js';

/**
 * Domain-level HTTP error carrying a stable error code.
 * The message must be safe to show to end users.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ApiFieldError[],
    readonly meta?: Record<string, string>,
  ) {
    super(message, status);
  }

  static unauthorized(code: ErrorCode, message: string): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, code, message);
  }

  static validation(details: ApiFieldError[]): AppException {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
      'Some fields are invalid.',
      details,
    );
  }
}
