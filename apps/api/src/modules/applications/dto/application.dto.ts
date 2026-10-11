import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  APPLICATION_DOCUMENT_NAME_MAX_LENGTH,
  APPLICATION_DOCUMENT_TYPES,
  APPLICATION_NOTE_MAX_LENGTH,
  APPLICATION_REJECTION_REASON_MAX_LENGTH,
  APPLICATION_SEARCH_MAX_LENGTH,
  APPLICATION_SORTS,
  APPLICATION_SOURCE_MAX_LENGTH,
  APPLICATION_STATUSES,
  type ApplicationDocumentType,
  type ApplicationNoteRequest,
  type ApplicationSort,
  type ApplicationStatus,
  type ChangeApplicationStatusRequest,
  type CreateApplicationRequest,
  INITIAL_APPLICATION_STATUSES,
  type InitialApplicationStatus,
  type UpdateApplicationRequest,
} from '@job-assist/shared';
import {
  OptionalIsoDate,
  OptionalText,
  OptionalUrl,
} from '../../../common/validation/decorators.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateApplicationDto implements CreateApplicationRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'jobId must be a job id.' })
  jobId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'The exact resume version used. Never changes afterwards.',
  })
  @IsUUID('all', { message: 'resumeVersionId must be a resume version id.' })
  resumeVersionId!: string;

  @ApiPropertyOptional({ enum: INITIAL_APPLICATION_STATUSES, default: 'SAVED' })
  @IsOptional()
  @IsIn(INITIAL_APPLICATION_STATUSES)
  status?: InitialApplicationStatus;

  @OptionalText(APPLICATION_SOURCE_MAX_LENGTH) source?: string | null;
  @OptionalUrl() applicationUrl?: string | null;
  @OptionalIsoDate() appliedAt?: string | null;
  @OptionalText(APPLICATION_NOTE_MAX_LENGTH) note?: string | null;
}

export class UpdateApplicationDto implements UpdateApplicationRequest {
  @OptionalText(APPLICATION_SOURCE_MAX_LENGTH) source?: string | null;
  @OptionalUrl() applicationUrl?: string | null;
  @OptionalIsoDate() appliedAt?: string | null;
  @OptionalText(APPLICATION_REJECTION_REASON_MAX_LENGTH) rejectionReason?: string | null;
}

export class ChangeStatusDto implements ChangeApplicationStatusRequest {
  @ApiProperty({ enum: APPLICATION_STATUSES })
  @IsIn(APPLICATION_STATUSES, { message: 'status must be a known application status.' })
  status!: ApplicationStatus;

  @OptionalText(APPLICATION_NOTE_MAX_LENGTH) note?: string | null;
  @OptionalText(APPLICATION_REJECTION_REASON_MAX_LENGTH) rejectionReason?: string | null;
}

export class NoteDto implements ApplicationNoteRequest {
  @ApiProperty({ maxLength: APPLICATION_NOTE_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Write something in the note.' })
  @MaxLength(APPLICATION_NOTE_MAX_LENGTH)
  body!: string;
}

/** Multipart fields sent with an application document. */
export class UploadDocumentDto {
  @ApiProperty({ enum: APPLICATION_DOCUMENT_TYPES })
  @IsIn(APPLICATION_DOCUMENT_TYPES, { message: 'type must be a known document type.' })
  type!: ApplicationDocumentType;

  @OptionalText(APPLICATION_DOCUMENT_NAME_MAX_LENGTH) name?: string | null;
}

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED', 'ALL'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'ARCHIVED', 'ALL'])
  archived: 'ACTIVE' | 'ARCHIVED' | 'ALL' = 'ACTIVE';

  @ApiPropertyOptional({ enum: APPLICATION_STATUSES })
  @IsOptional()
  @IsIn(APPLICATION_STATUSES)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ description: 'Search in job title, company, resume name and source.' })
  @IsOptional()
  @IsString()
  @MaxLength(APPLICATION_SEARCH_MAX_LENGTH)
  q?: string;

  @OptionalIsoDate() appliedFrom?: string | null;
  @OptionalIsoDate() appliedTo?: string | null;

  @ApiPropertyOptional({ enum: APPLICATION_SORTS, default: 'updated' })
  @IsOptional()
  @IsIn(APPLICATION_SORTS)
  sort: ApplicationSort = 'updated';
}
