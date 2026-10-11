import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  type CreateResumeFromProfileRequest,
  type CreateVersionRequest,
  type DuplicateResumeRequest,
  RESUME_CATEGORY_MAX_LENGTH,
  RESUME_MAX_TAGS,
  RESUME_NAME_MAX_LENGTH,
  RESUME_SEARCH_MAX_LENGTH,
  RESUME_SORTS,
  RESUME_TAG_MAX_LENGTH,
  type ResumeSort,
  type UpdateResumeRequest,
} from '@job-assist/shared';
import { OptionalText } from '../../../common/validation/decorators.js';

/** Trims, collapses whitespace, drops blanks and case-insensitive duplicates. Accepts an array, a JSON array string or a comma-separated string (multipart forms). */
export function normalizeTags(value: unknown): unknown {
  let list: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        list = JSON.parse(trimmed);
      } catch {
        return value;
      }
    } else list = trimmed === '' ? [] : trimmed.split(',');
  }
  if (!Array.isArray(list)) return list;
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of list) {
    if (typeof item !== 'string') {
      result.push(item);
      continue;
    }
    const tag = item.trim().replace(/\s+/g, ' ');
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    result.push(tag);
  }
  return result;
}

function Tags() {
  return function (target: object, key: string) {
    ApiPropertyOptional({ type: [String], maxItems: RESUME_MAX_TAGS })(target, key);
    Transform(({ value }: { value: unknown }) => normalizeTags(value))(target, key);
    IsOptional()(target, key);
    IsArray()(target, key);
    ArrayMaxSize(RESUME_MAX_TAGS)(target, key);
    IsString({ each: true })(target, key);
    MaxLength(RESUME_TAG_MAX_LENGTH, { each: true })(target, key);
  };
}

function Name(required: boolean) {
  return function (target: object, key: string) {
    ApiPropertyOptional({ maxLength: RESUME_NAME_MAX_LENGTH })(target, key);
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
    )(target, key);
    if (!required) IsOptional()(target, key);
    IsString()(target, key);
    MinLength(1, { message: 'Name must not be empty.' })(target, key);
    MaxLength(RESUME_NAME_MAX_LENGTH)(target, key);
  };
}

/** Multipart fields accompanying an uploaded resume file. */
export class UploadResumeDto {
  @Name(false) name?: string;
  @OptionalText(500) description?: string | null;
  @OptionalText(RESUME_CATEGORY_MAX_LENGTH) category?: string | null;
  @Tags() tags?: string[];
}

export class UpdateResumeDto implements UpdateResumeRequest {
  @Name(false) name?: string;
  @OptionalText(500) description?: string | null;
  @OptionalText(RESUME_CATEGORY_MAX_LENGTH) category?: string | null;
  @Tags() tags?: string[];
}

export class CreateResumeFromProfileDto implements CreateResumeFromProfileRequest {
  @Name(true) name!: string;
  @OptionalText(500) description?: string;
  @OptionalText(RESUME_CATEGORY_MAX_LENGTH) category?: string;
  @Tags() tags?: string[];
}

export class DuplicateResumeDto implements DuplicateResumeRequest {
  @Name(false) name?: string;
}

export class CreateVersionDto implements CreateVersionRequest {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  baseVersionId?: string;

  @OptionalText(500) notes?: string;
}

/** Multipart fields accompanying a new file version. */
export class UploadVersionDto {
  @OptionalText(500) notes?: string;
}

export class ListResumesQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED', 'ALL'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'ALL'])
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL' = 'ACTIVE';

  @ApiPropertyOptional({ description: 'Only resumes with this tag (case-insensitive).' })
  @IsOptional()
  @IsString()
  @MaxLength(RESUME_TAG_MAX_LENGTH)
  tag?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive search in name, description, category and tags.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(RESUME_SEARCH_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({ description: 'Only resumes in this category (case-insensitive).' })
  @IsOptional()
  @IsString()
  @MaxLength(RESUME_CATEGORY_MAX_LENGTH)
  category?: string;

  @ApiPropertyOptional({ enum: RESUME_SORTS, default: 'updated' })
  @IsOptional()
  @IsIn(RESUME_SORTS)
  sort: ResumeSort = 'updated';
}
