import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { ApiErrorResponse } from '@job-assist/shared';
import { AppException } from '../errors/app.exception.js';
import { DEFAULT_CODE_BY_STATUS, ErrorCode } from '../errors/error-codes.js';

/**
 * Converts every thrown error into the shared `ApiErrorResponse` shape.
 * Unknown errors become a generic 500 — internal details are logged, never returned.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string | number }>();
    const response = http.getResponse<Response>();

    const body = this.toErrorBody(exception, request);

    if (body.statusCode >= 500) {
      this.logger.error(
        { err: exception, requestId: body.requestId },
        `Unhandled error on ${request.method} ${body.path}`,
      );
    }

    response.status(body.statusCode).json(body);
  }

  toErrorBody(exception: unknown, request: Request & { id?: string | number }): ApiErrorResponse {
    const base = {
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      requestId: request.id === undefined ? undefined : String(request.id),
    };

    if (exception instanceof AppException) {
      return {
        ...base,
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
        ...(exception.meta ? { meta: exception.meta } : {}),
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        ...base,
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many requests. Please wait a moment and try again.',
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const isServerError = statusCode >= 500;
      return {
        ...base,
        statusCode,
        code:
          DEFAULT_CODE_BY_STATUS[statusCode] ??
          (isServerError ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST),
        message: isServerError ? 'Something went wrong on our side.' : this.messageOf(exception),
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong on our side.',
    };
  }

  private messageOf(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    const message = (response as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
    return exception.message;
  }
}
