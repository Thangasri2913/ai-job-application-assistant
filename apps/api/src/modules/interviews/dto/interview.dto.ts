import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  type CreateInterviewRequest,
  INTERVIEW_ANSWER_MAX_LENGTH,
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_FOCUSES,
  INTERVIEW_QUESTION_COUNTS,
  INTERVIEW_SESSION_TYPES,
  type InterviewDifficulty,
  type InterviewFocus,
  type InterviewQuestionCount,
  type InterviewSessionType,
  type SubmitAnswerRequest,
} from '@job-assist/shared';

export class CreateInterviewDto implements CreateInterviewRequest {
  @ApiProperty({ enum: INTERVIEW_SESSION_TYPES })
  @IsIn(INTERVIEW_SESSION_TYPES)
  type!: InterviewSessionType;

  @ApiPropertyOptional({ enum: INTERVIEW_FOCUSES })
  @IsOptional()
  @IsIn(INTERVIEW_FOCUSES)
  focus?: InterviewFocus;

  @ApiPropertyOptional({ enum: INTERVIEW_DIFFICULTIES, default: 'MEDIUM' })
  @IsOptional()
  @IsIn(INTERVIEW_DIFFICULTIES)
  difficulty?: InterviewDifficulty;

  @ApiPropertyOptional({ enum: INTERVIEW_QUESTION_COUNTS, default: 10 })
  @IsOptional()
  @IsIn(INTERVIEW_QUESTION_COUNTS)
  questionCount?: InterviewQuestionCount;
}

export class SubmitAnswerDto implements SubmitAnswerRequest {
  @ApiProperty({ maxLength: INTERVIEW_ANSWER_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Write an answer first.' })
  @MaxLength(INTERVIEW_ANSWER_MAX_LENGTH)
  answer!: string;
}
