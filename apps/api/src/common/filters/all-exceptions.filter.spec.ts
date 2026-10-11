import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-codes.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

const request = {
  originalUrl: '/api/v1/things',
  url: '/api/v1/things',
  method: 'GET',
  id: 'req-123',
} as unknown as Request & { id: string };

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('preserves AppException code, message and details', () => {
    const body = filter.toErrorBody(
      AppException.validation([{ field: 'email', messages: ['bad'] }]),
      request,
    );
    expect(body).toMatchObject({
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      details: [{ field: 'email', messages: ['bad'] }],
      path: '/api/v1/things',
      requestId: 'req-123',
    });
  });

  it('maps framework HttpExceptions to default codes', () => {
    expect(filter.toErrorBody(new NotFoundException('Nope'), request)).toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'Nope',
    });
    expect(filter.toErrorBody(new BadRequestException(), request).code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('maps throttling to 429 RATE_LIMITED', () => {
    expect(filter.toErrorBody(new ThrottlerException(), request)).toMatchObject({
      statusCode: 429,
      code: ErrorCode.RATE_LIMITED,
    });
  });

  it('never leaks internal error messages', () => {
    const body = filter.toErrorBody(new Error('connection string postgres://secret@db'), request);
    expect(body.statusCode).toBe(500);
    expect(body.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
