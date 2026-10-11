import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  type AchievementInput,
  type CertificationInput,
  type LanguageInput,
  type EducationInput,
  type ExperienceInput,
  type ProjectInput,
  SKILL_CATEGORIES,
  type SkillCategory,
  type SkillInput,
} from '@job-assist/shared';
import {
  OptionalIsoDate,
  OptionalText,
  OptionalUrl,
  RequiredText,
  StringList,
} from '../../../common/validation/decorators.js';

export class SkillDto implements SkillInput {
  @ApiProperty() @RequiredText(80) name!: string;

  @ApiProperty({ enum: SKILL_CATEGORIES })
  @IsIn(SKILL_CATEGORIES)
  category!: SkillCategory;
}

export class ExperienceDto implements ExperienceInput {
  @ApiProperty() @RequiredText(150) company!: string;
  @ApiProperty() @RequiredText(150) jobTitle!: string;
  @OptionalText(150) location!: string | null;
  @OptionalIsoDate() startDate!: string | null;
  @OptionalIsoDate() endDate!: string | null;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent = false;

  @OptionalText(4000) description!: string | null;
  @StringList(50, 1000) responsibilities: string[] = [];
  @StringList(50, 1000) achievements: string[] = [];
  @StringList(60, 80) technologies: string[] = [];
}

export class EducationDto implements EducationInput {
  @ApiProperty() @RequiredText(200) institution!: string;
  @OptionalText(150) degree!: string | null;
  @OptionalText(150) fieldOfStudy!: string | null;
  @OptionalIsoDate() startDate!: string | null;
  @OptionalIsoDate() endDate!: string | null;
  @OptionalText(40) grade!: string | null;
}

export class ProjectDto implements ProjectInput {
  @ApiProperty() @RequiredText(150) name!: string;
  @OptionalText(4000) description!: string | null;
  @OptionalText(120) role!: string | null;
  @StringList(60, 80) technologies: string[] = [];
  @StringList(50, 1000) responsibilities: string[] = [];
  @StringList(50, 1000) achievements: string[] = [];
  @OptionalUrl() url!: string | null;
}

export class CertificationDto implements CertificationInput {
  @ApiProperty() @RequiredText(200) name!: string;
  @OptionalText(150) issuer!: string | null;
  @OptionalIsoDate() issueDate!: string | null;
  @OptionalIsoDate() expiryDate!: string | null;
  @OptionalText(120) credentialId!: string | null;
  @OptionalUrl() credentialUrl!: string | null;
}

export class LanguageDto implements LanguageInput {
  @ApiProperty() @RequiredText(80) name!: string;
  @OptionalText(80) proficiency!: string | null;
}

export class AchievementDto implements AchievementInput {
  @ApiProperty() @RequiredText(200) title!: string;
  @OptionalText(2000) description!: string | null;
  @OptionalIsoDate() date!: string | null;
}

export class ReorderDto {
  @ApiProperty({
    type: [String],
    description: 'All item ids of the section, in the desired order.',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids!: string[];
}
