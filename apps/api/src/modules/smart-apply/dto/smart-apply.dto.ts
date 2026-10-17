import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  type AnswerQuestionRequest,
  DAILY_APPLICATION_LIMIT_MAX,
  DAILY_SUBMISSION_LIMIT_MAX,
  type ManualSubmissionRequest,
  type PrepareSmartApplicationRequest,
  SMART_ANSWER_MAX_LENGTH,
  SMART_APPLY_MODES,
  SMART_APPLY_STATES,
  type SmartApplyMode,
  type SmartApplyState,
  type UpdateSmartApplySettingsRequest,
} from '@job-assist/shared';

export class PrepareSmartApplicationDto implements PrepareSmartApplicationRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'jobId must be a job id.' })
  jobId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to the recommended version.' })
  @IsOptional()
  @IsUUID('all', { message: 'resumeVersionId must be a resume version id.' })
  resumeVersionId?: string;
}

const toStateList = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : value;

export class ListSmartApplicationsQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated states.', example: 'NEEDS_USER_INPUT' })
  @IsOptional()
  @Transform(toStateList)
  @IsIn(SMART_APPLY_STATES, { each: true })
  state?: SmartApplyState[];

  @ApiPropertyOptional({ enum: ['updatedAt', 'createdAt', 'matchScore'], default: 'updatedAt' })
  @IsOptional()
  @IsIn(['updatedAt', 'createdAt', 'matchScore'])
  sort?: 'updatedAt' | 'createdAt' | 'matchScore';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class AnswerQuestionDto implements AnswerQuestionRequest {
  @ApiProperty({ maxLength: SMART_ANSWER_MAX_LENGTH })
  @IsString()
  @MaxLength(SMART_ANSWER_MAX_LENGTH)
  answer!: string;

  @ApiProperty({ description: 'Confirms the answer is correct (required to use it).' })
  @IsBoolean()
  confirm!: boolean;

  @ApiPropertyOptional({ description: 'Save for reuse in later applications.' })
  @IsOptional()
  @IsBoolean()
  saveForReuse?: boolean;
}

export class ManualSubmissionDto implements ManualSubmissionRequest {
  @ApiProperty({ enum: [true], description: 'You submitted it yourself on the official site.' })
  @Equals(true, { message: 'Confirm that you submitted the application yourself.' })
  confirm!: true;

  @ApiPropertyOptional({ example: '2026-10-13' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'submittedOn must be a date (YYYY-MM-DD).' })
  submittedOn?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateSmartApplySettingsDto implements UpdateSmartApplySettingsRequest {
  @ApiPropertyOptional({ enum: SMART_APPLY_MODES })
  @IsOptional()
  @IsIn(SMART_APPLY_MODES)
  mode?: SmartApplyMode;

  @ApiPropertyOptional({ minimum: 1, maximum: DAILY_APPLICATION_LIMIT_MAX })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DAILY_APPLICATION_LIMIT_MAX)
  dailyApplicationLimit?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: DAILY_SUBMISSION_LIMIT_MAX })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DAILY_SUBMISSION_LIMIT_MAX)
  dailySubmissionLimit?: number;

  @ApiPropertyOptional({
    description: 'true gives consent to the current wording; false withdraws it.',
  })
  @IsOptional()
  @IsBoolean()
  autoSubmitConsent?: boolean;
}
