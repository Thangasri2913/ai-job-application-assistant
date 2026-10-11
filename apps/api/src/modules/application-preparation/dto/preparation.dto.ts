import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ANSWER_MAX_LENGTH,
  COVER_LETTER_MAX_LENGTH,
  type CreateQuestionRequest,
  QUESTION_MAX_LENGTH,
  SUGGESTION_TEXT_MAX_LENGTH,
  type SuggestionDecisionRequest,
  type UpdateCoverLetterRequest,
  type UpdateQuestionRequest,
} from '@job-assist/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const limit = () => [
  IsOptional(),
  ValidateIf((_o, v) => v !== null),
  IsInt(),
  Min(1),
  Max(100_000),
];
function Limit(): PropertyDecorator {
  return (target, key) => limit().forEach((d) => d(target, key));
}

export class SuggestionDecisionDto implements SuggestionDecisionRequest {
  @ApiProperty({ enum: ['ACCEPT', 'REJECT', 'EDIT', 'RESET'] })
  @IsIn(['ACCEPT', 'REJECT', 'EDIT', 'RESET'])
  action!: 'ACCEPT' | 'REJECT' | 'EDIT' | 'RESET';

  @ApiPropertyOptional({ maxLength: SUGGESTION_TEXT_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(SUGGESTION_TEXT_MAX_LENGTH)
  text?: string;
}

export class GenerateCoverLetterDto {
  @ApiPropertyOptional({
    enum: ['GENERATE', 'MANUAL'],
    default: 'GENERATE',
    description: 'MANUAL starts an empty version to write yourself.',
  })
  @IsOptional()
  @IsIn(['GENERATE', 'MANUAL'])
  mode: 'GENERATE' | 'MANUAL' = 'GENERATE';
}

export class UpdateCoverLetterDto implements UpdateCoverLetterRequest {
  @ApiProperty({ maxLength: COVER_LETTER_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @MaxLength(COVER_LETTER_MAX_LENGTH)
  text!: string;
}

export class CreateQuestionDto implements CreateQuestionRequest {
  @ApiProperty({
    maxLength: QUESTION_MAX_LENGTH,
    example: 'Describe your experience with React. (Maximum 200 words)',
  })
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Enter the question.' })
  @MaxLength(QUESTION_MAX_LENGTH)
  question!: string;

  @ApiPropertyOptional({ nullable: true }) @Limit() maxWords?: number | null;
  @ApiPropertyOptional({ nullable: true }) @Limit() maxCharacters?: number | null;
}

export class UpdateQuestionDto implements UpdateQuestionRequest {
  @ApiPropertyOptional({ nullable: true, maxLength: ANSWER_MAX_LENGTH })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(ANSWER_MAX_LENGTH)
  userAnswer?: string | null;

  @ApiPropertyOptional({ nullable: true }) @Limit() maxWords?: number | null;
  @ApiPropertyOptional({ nullable: true }) @Limit() maxCharacters?: number | null;
}
