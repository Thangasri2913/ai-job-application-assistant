import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  type CreateJobRequest,
  EMPLOYMENT_TYPES,
  type EmploymentType,
  JOB_COMPANY_MAX_LENGTH,
  JOB_DESCRIPTION_MAX_LENGTH,
  JOB_DESCRIPTION_MIN_LENGTH,
  JOB_LOCATION_MAX_LENGTH,
  JOB_SEARCH_MAX_LENGTH,
  JOB_SORTS,
  JOB_SOURCE_MAX_LENGTH,
  JOB_TITLE_MAX_LENGTH,
  type JobSort,
  type SelectResumeRequest,
  type UpdateJobRequest,
} from '@job-assist/shared';
import { OptionalText, OptionalUrl, RequiredText } from '../../../common/validation/decorators.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DESCRIPTION_TOO_SHORT = `Paste the full job description (at least ${JOB_DESCRIPTION_MIN_LENGTH} characters) so it can be analysed.`;

export class CreateJobDto implements CreateJobRequest {
  @ApiProperty({ maxLength: JOB_TITLE_MAX_LENGTH, example: 'Frontend Developer' })
  @RequiredText(JOB_TITLE_MAX_LENGTH)
  title!: string;

  @ApiProperty({ maxLength: JOB_COMPANY_MAX_LENGTH, example: 'Example Corp' })
  @RequiredText(JOB_COMPANY_MAX_LENGTH)
  companyName!: string;

  @ApiProperty({ minLength: JOB_DESCRIPTION_MIN_LENGTH, maxLength: JOB_DESCRIPTION_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(JOB_DESCRIPTION_MIN_LENGTH, { message: DESCRIPTION_TOO_SHORT })
  @MaxLength(JOB_DESCRIPTION_MAX_LENGTH)
  description!: string;

  @OptionalUrl() jobUrl?: string | null;
  @OptionalText(JOB_LOCATION_MAX_LENGTH) location?: string | null;
  @OptionalText(JOB_SOURCE_MAX_LENGTH) source?: string | null;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES, nullable: true })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: EmploymentType | null;
}

export class UpdateJobDto implements UpdateJobRequest {
  @ApiPropertyOptional({ maxLength: JOB_TITLE_MAX_LENGTH })
  @IsOptional()
  @RequiredText(JOB_TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({ maxLength: JOB_COMPANY_MAX_LENGTH })
  @IsOptional()
  @RequiredText(JOB_COMPANY_MAX_LENGTH)
  companyName?: string;

  @ApiPropertyOptional({
    minLength: JOB_DESCRIPTION_MIN_LENGTH,
    maxLength: JOB_DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(JOB_DESCRIPTION_MIN_LENGTH, { message: DESCRIPTION_TOO_SHORT })
  @MaxLength(JOB_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @OptionalUrl() jobUrl?: string | null;
  @OptionalText(JOB_LOCATION_MAX_LENGTH) location?: string | null;
  @OptionalText(JOB_SOURCE_MAX_LENGTH) source?: string | null;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES, nullable: true })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: EmploymentType | null;
}

export class ListJobsQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED', 'ALL'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'ALL'])
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL' = 'ACTIVE';

  @ApiPropertyOptional({
    description: 'Case-insensitive search in title, company, location and source.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(JOB_SEARCH_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({ enum: JOB_SORTS, default: 'created' })
  @IsOptional()
  @IsIn(JOB_SORTS)
  sort: JobSort = 'created';
}

export class SelectResumeDto implements SelectResumeRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'resumeVersionId must be a resume version id.' })
  resumeVersionId!: string;
}
