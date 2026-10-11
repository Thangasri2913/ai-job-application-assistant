import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import type { ImportToProfileRequest } from '@job-assist/shared';
import { OptionalText, OptionalUrl } from '../../../common/validation/decorators.js';
import {
  CertificationDto,
  EducationDto,
  ExperienceDto,
  LanguageDto,
  ProjectDto,
  SkillDto,
} from './sections.dto.js';

export class ImportDetailsDto {
  @OptionalText(40) phone?: string | null;
  @OptionalText(120) location?: string | null;
  @OptionalUrl() linkedinUrl?: string | null;
  @OptionalUrl() githubUrl?: string | null;
  @OptionalUrl() portfolioUrl?: string | null;
  @OptionalText(150) headline?: string | null;
  @OptionalText(4000) summary?: string | null;
  @OptionalText(120) currentJobTitle?: string | null;
}

const list = <T>(type: () => new () => T, max: number) => [
  ApiPropertyOptional({ type, isArray: true }),
  IsOptional(),
  IsArray(),
  ArrayMaxSize(max),
  ValidateNested({ each: true }),
  Type(type),
];

function Apply(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((d) => d(target, key));
}

/** Items the user explicitly selected during resume review. */
export class ImportToProfileDto implements ImportToProfileRequest {
  @ApiPropertyOptional({ type: ImportDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImportDetailsDto)
  details?: ImportDetailsDto;

  @Apply(list(() => SkillDto, 200)) skills?: SkillDto[];
  @Apply(list(() => ExperienceDto, 50)) experiences?: ExperienceDto[];
  @Apply(list(() => EducationDto, 20)) educations?: EducationDto[];
  @Apply(list(() => ProjectDto, 50)) projects?: ProjectDto[];
  @Apply(list(() => CertificationDto, 50)) certifications?: CertificationDto[];
  @Apply(list(() => LanguageDto, 30)) languages?: LanguageDto[];
}
