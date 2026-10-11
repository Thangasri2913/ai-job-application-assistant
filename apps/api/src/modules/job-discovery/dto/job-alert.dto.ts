import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ALERT_RESUME_MODES,
  ALERT_SCHEDULE_TYPES,
  type AlertResumeMode,
  type AlertScheduleType,
  type CreateJobAlertRequest,
  EMPLOYMENT_TYPES,
  type EmploymentType,
  JOB_ALERT_MAX_KEYWORDS,
  JOB_ALERT_MAX_LOCATIONS,
  JOB_ALERT_NAME_MAX_LENGTH,
  JOB_ALERT_TERM_MAX_LENGTH,
  JOB_RECOMMENDATION_STATUSES,
  type JobAlertSchedule,
  type JobRecommendationStatus,
  REMOTE_PREFERENCES,
  type RemotePreference,
  SENIORITY_LEVELS,
  type SeniorityLevel,
} from '@job-assist/shared';
import { RequiredText, StringList } from '../../../common/validation/decorators.js';

export class JobAlertScheduleDto implements JobAlertSchedule {
  @ApiProperty({ enum: ALERT_SCHEDULE_TYPES })
  @IsIn(ALERT_SCHEDULE_TYPES)
  type!: AlertScheduleType;

  @ApiProperty({ example: '08:00', description: 'Local time (HH:mm) in `timezone`.' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be HH:mm (24-hour).' })
  time!: string;

  @ApiProperty({ type: [Number], description: 'Weekdays, 0 = Sunday. One for WEEKLY.' })
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];

  @ApiProperty({ example: 'Asia/Kolkata' })
  @IsString()
  timezone!: string;
}

class JobAlertFields {
  @ApiPropertyOptional({ enum: REMOTE_PREFERENCES })
  @IsOptional()
  @IsIn(REMOTE_PREFERENCES)
  remotePreference?: RemotePreference;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(EMPLOYMENT_TYPES, { each: true })
  employmentTypes?: EmploymentType[];

  @ApiPropertyOptional({ enum: SENIORITY_LEVELS, nullable: true })
  @IsOptional()
  @IsIn(SENIORITY_LEVELS)
  experienceLevel?: SeniorityLevel | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 70 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minimumMatchScore?: number;

  @ApiPropertyOptional({ enum: ALERT_RESUME_MODES })
  @IsOptional()
  @IsIn(ALERT_RESUME_MODES)
  resumeMode?: AlertResumeMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: JobAlertScheduleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => JobAlertScheduleDto)
  schedule?: JobAlertScheduleDto;

  @StringList(JOB_ALERT_MAX_LOCATIONS, JOB_ALERT_TERM_MAX_LENGTH)
  locations?: string[];
}

/** Trims, drops blanks and case-insensitive duplicates. */
const cleanList = ({ value }: { value: unknown }) => {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'string') return [item];
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) return [];
    seen.add(trimmed.toLowerCase());
    return [trimmed];
  });
};

export class CreateJobAlertDto extends JobAlertFields implements CreateJobAlertRequest {
  @ApiProperty({ maxLength: JOB_ALERT_NAME_MAX_LENGTH })
  @RequiredText(JOB_ALERT_NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({ type: [String], example: ['Frontend Developer'] })
  @Transform(cleanList)
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one keyword.' })
  @ArrayMaxSize(JOB_ALERT_MAX_KEYWORDS)
  @IsString({ each: true })
  @MaxLength(JOB_ALERT_TERM_MAX_LENGTH, { each: true })
  keywords!: string[];
}

export class UpdateJobAlertDto extends JobAlertFields {
  @ApiPropertyOptional({ maxLength: JOB_ALERT_NAME_MAX_LENGTH })
  @IsOptional()
  @RequiredText(JOB_ALERT_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(cleanList)
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one keyword.' })
  @ArrayMaxSize(JOB_ALERT_MAX_KEYWORDS)
  @IsString({ each: true })
  @MaxLength(JOB_ALERT_TERM_MAX_LENGTH, { each: true })
  keywords?: string[];
}

export class ListRecommendationsQueryDto {
  @ApiPropertyOptional({
    enum: [...JOB_RECOMMENDATION_STATUSES, 'ACTIVE', 'ALL'],
    default: 'ACTIVE',
    description: 'ACTIVE = everything except dismissed.',
  })
  @IsOptional()
  @IsIn([...JOB_RECOMMENDATION_STATUSES, 'ACTIVE', 'ALL'])
  status: JobRecommendationStatus | 'ACTIVE' | 'ALL' = 'ACTIVE';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Matches(/^[0-9a-f-]{36}$/i, { message: 'alertId must be a UUID.' })
  alertId?: string;
}
