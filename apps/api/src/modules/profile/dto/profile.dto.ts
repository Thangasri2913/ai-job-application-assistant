import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import {
  EMPLOYMENT_TYPES,
  type EmploymentType,
  NAME_MAX_LENGTH,
  type UpdateProfileRequest,
  WORK_MODES,
  type WorkMode,
} from '@job-assist/shared';
import {
  OptionalText,
  OptionalUrl,
  RequiredText,
  StringList,
} from '../../../common/validation/decorators.js';

export class UpdateProfileDto implements UpdateProfileRequest {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH })
  @RequiredText(NAME_MAX_LENGTH)
  fullName!: string;

  @OptionalText(40) phone!: string | null;
  @OptionalText(120) location!: string | null;
  @OptionalText(80) country!: string | null;
  @OptionalUrl() linkedinUrl!: string | null;
  @OptionalUrl() githubUrl!: string | null;
  @OptionalUrl() portfolioUrl!: string | null;

  @StringList(20, 120) preferredRoles: string[] = [];
  @StringList(20, 120) preferredLocations: string[] = [];

  @ApiPropertyOptional({ enum: WORK_MODES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(WORK_MODES, { each: true })
  workModes: WorkMode[] = [];

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Minimum expected yearly salary.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  salaryMin!: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Maximum expected yearly salary.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  salaryMax!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'INR' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'salaryCurrency must be a 3-letter ISO currency code.' })
  salaryCurrency!: string | null;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(EMPLOYMENT_TYPES, { each: true })
  employmentTypes: EmploymentType[] = [];

  @OptionalText(80) noticePeriod!: string | null;
  @OptionalText(200) workAuthorization!: string | null;
  @OptionalText(150) headline!: string | null;
  @OptionalText(4000) summary!: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 3.3,
    description: 'Stored exactly as entered.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 1 },
    { message: 'yearsOfExperience allows at most one decimal place.' },
  )
  @Min(0)
  @Max(70)
  yearsOfExperience!: number | null;

  @OptionalText(120) currentJobTitle!: string | null;
  @OptionalText(120) currentCompany!: string | null;
  @StringList(20, 120) previousJobTitles: string[] = [];
  @StringList(20, 120) previousCompanies: string[] = [];
}
