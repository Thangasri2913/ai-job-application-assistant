import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppException } from '../errors/app.exception.js';

/** Validates a body against a zod schema and returns the parsed (normalised) value. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const byField = new Map<string, string[]>();
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || '(body)';
      byField.set(field, [...(byField.get(field) ?? []), issue.message]);
    }
    throw AppException.validation([...byField].map(([field, messages]) => ({ field, messages })));
  }
}
