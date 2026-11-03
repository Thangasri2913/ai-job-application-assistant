import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches, MaxLength } from 'class-validator';
import {
  INTERVIEW_ANSWER_MAX_LENGTH,
  type InterviewPracticeQuery,
  type JobReadinessRequest,
  LEARNING_DIFFICULTIES,
  LEARNING_ID_PATTERN,
  LEARNING_ROLES,
  type LearningDifficulty,
  type LearningRole,
  PROJECT_STATUSES,
  SKILL_CORRECTIONS,
  type SubmitInterviewAnswerRequest,
  type UpdateProjectProgressRequest,
} from '@job-assist/shared';
import { z } from 'zod';

export class ListInterviewQuestionsQueryDto implements InterviewPracticeQuery {
  @ApiPropertyOptional({ enum: LEARNING_ROLES })
  @IsOptional()
  @IsIn(LEARNING_ROLES, { message: 'role must be a supported learning role.' })
  role?: LearningRole;

  @ApiPropertyOptional({ description: 'Skill id, e.g. "sql".' })
  @IsOptional()
  @Matches(LEARNING_ID_PATTERN, { message: 'skill must be a skill id.' })
  @MaxLength(80)
  skill?: string;

  @ApiPropertyOptional({ description: 'Course id: questions on the skills it teaches.' })
  @IsOptional()
  @Matches(LEARNING_ID_PATTERN, { message: 'courseId must be a course id.' })
  @MaxLength(80)
  courseId?: string;

  @ApiPropertyOptional({ enum: LEARNING_DIFFICULTIES })
  @IsOptional()
  @IsIn(LEARNING_DIFFICULTIES, {
    message: 'difficulty must be BEGINNER, INTERMEDIATE or ADVANCED.',
  })
  difficulty?: LearningDifficulty;
}

export class ListProjectChallengesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(LEARNING_ID_PATTERN, { message: 'courseId must be a course id.' })
  @MaxLength(80)
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(LEARNING_ID_PATTERN, { message: 'skill must be a skill id.' })
  @MaxLength(80)
  skill?: string;
}

const id = z.string().regex(LEARNING_ID_PATTERN, 'must be an id').max(80);

export const submitInterviewAnswerSchema: z.ZodType<SubmitInterviewAnswerRequest> = z.strictObject({
  answer: z
    .string()
    .max(INTERVIEW_ANSWER_MAX_LENGTH, `must be at most ${INTERVIEW_ANSWER_MAX_LENGTH} characters`)
    .refine((v) => v.trim().length > 0, 'Write an answer before asking for feedback.'),
});

export const updateProjectProgressSchema: z.ZodType<UpdateProjectProgressRequest> = z.strictObject({
  status: z.enum(PROJECT_STATUSES),
  checkedItemIds: z.array(id).max(50),
});

export const jobReadinessSchema: z.ZodType<JobReadinessRequest> = z.strictObject({
  jobId: z.uuid('must be a job id'),
  resumeVersionId: z.uuid('must be a resume version id').optional(),
  corrections: z
    .array(z.strictObject({ skillId: id, status: z.enum(SKILL_CORRECTIONS) }))
    .max(100)
    .optional(),
});
