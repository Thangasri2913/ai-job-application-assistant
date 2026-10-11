import type { ValidationError } from 'class-validator';
import type { ApiFieldError } from '@job-assist/shared';
import { AppException } from './app.exception.js';

/** Flattens nested class-validator errors into `{ field: 'a.b', messages }` entries. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): ApiFieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: ApiFieldError[] = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function validationExceptionFactory(errors: ValidationError[]): AppException {
  return AppException.validation(flattenValidationErrors(errors));
}
