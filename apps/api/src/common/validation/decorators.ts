import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Optional free text; blank strings become null. */
export function OptionalText(maxLength = 500) {
  return applyDecorators(
    ApiPropertyOptional({ type: String, nullable: true, maxLength }),
    Transform(trimOrNull),
    IsOptional(),
    IsString(),
    MaxLength(maxLength),
  );
}

/** Required, trimmed, non-empty text. */
export function RequiredText(maxLength = 200) {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString(),
    MinLength(1, { message: '$property must not be empty.' }),
    MaxLength(maxLength),
  );
}

/** Optional http(s) URL; blank becomes null. */
export function OptionalUrl() {
  return applyDecorators(
    ApiPropertyOptional({ type: String, nullable: true, format: 'uri' }),
    Transform(trimOrNull),
    IsOptional(),
    IsUrl(
      { protocols: ['http', 'https'], require_protocol: true },
      { message: '$property must be a valid http(s) URL.' },
    ),
    MaxLength(500),
  );
}

/** Optional `YYYY-MM-DD`; blank becomes null. */
export function OptionalIsoDate() {
  return applyDecorators(
    ApiPropertyOptional({ type: String, nullable: true, example: '2024-03-01' }),
    Transform(trimOrNull),
    IsOptional(),
    Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
      message: '$property must be a date (YYYY-MM-DD).',
    }),
  );
}

/** List of short strings; trims, drops blanks and duplicates (case-insensitive). */
export function StringList(maxItems = 50, maxLength = 500) {
  return applyDecorators(
    ApiPropertyOptional({ type: [String] }),
    Transform(({ value }: { value: unknown }) => {
      if (!Array.isArray(value)) return value;
      const seen = new Set<string>();
      const result: unknown[] = [];
      for (const item of value) {
        if (typeof item !== 'string') {
          result.push(item);
          continue;
        }
        const trimmed = item.trim();
        if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
        seen.add(trimmed.toLowerCase());
        result.push(trimmed);
      }
      return result;
    }),
    IsOptional(),
    IsArray(),
    ArrayMaxSize(maxItems),
    IsString({ each: true }),
    MaxLength(maxLength, { each: true }),
  );
}
