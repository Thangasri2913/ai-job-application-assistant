import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  COURSE_STATUSES,
  type CourseCatalogueQuery,
  type CourseStatus,
  LEARNING_CATEGORIES,
  LEARNING_DIFFICULTIES,
  LEARNING_ID_PATTERN,
  LEARNING_ROLES,
  type LearningCategory,
  type LearningDifficulty,
  type LearningRecommendationRequest,
  type LearningRole,
  SKILL_CORRECTIONS,
  type SubmitActivityAttemptRequest,
  type SubmitDiagnosticRequest,
} from '@job-assist/shared';
import { z } from 'zod';

export class ListCoursesQueryDto implements CourseCatalogueQuery {
  @ApiPropertyOptional({ description: 'Search title, description and skills.', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: LEARNING_CATEGORIES })
  @IsOptional()
  @IsIn(LEARNING_CATEGORIES, { message: 'category must be a supported category.' })
  category?: LearningCategory;

  @ApiPropertyOptional({ description: 'Skill id, e.g. "sql".' })
  @IsOptional()
  @Matches(LEARNING_ID_PATTERN, { message: 'skill must be a skill id.' })
  @MaxLength(80)
  skill?: string;

  @ApiPropertyOptional({ enum: LEARNING_ROLES })
  @IsOptional()
  @IsIn(LEARNING_ROLES, { message: 'role must be a supported learning role.' })
  role?: LearningRole;

  @ApiPropertyOptional({ enum: LEARNING_DIFFICULTIES })
  @IsOptional()
  @IsIn(LEARNING_DIFFICULTIES, {
    message: 'difficulty must be BEGINNER, INTERMEDIATE or ADVANCED.',
  })
  difficulty?: LearningDifficulty;

  @ApiPropertyOptional({ enum: COURSE_STATUSES })
  @IsOptional()
  @IsIn(COURSE_STATUSES, { message: 'status must be PUBLISHED or PLANNED.' })
  status?: CourseStatus;
}

const id = z.string().regex(LEARNING_ID_PATTERN, 'must be an id').max(80);
const shortText = z.string().max(500, 'must be at most 500 characters');

export const submitActivityAttemptSchema: z.ZodType<SubmitActivityAttemptRequest> = z.strictObject({
  answer: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('MULTIPLE_CHOICE'), optionId: id }),
    z.strictObject({
      type: z.literal('FILL_IN_THE_GAP'),
      gaps: z.record(id, shortText).refine((g) => Object.keys(g).length <= 20, 'too many gaps'),
    }),
    z.strictObject({ type: z.literal('SHORT_ANSWER'), text: shortText }),
    z.strictObject({ type: z.literal('CHECKLIST'), checkedItemIds: z.array(id).max(20) }),
  ]),
});

export const submitDiagnosticSchema: z.ZodType<SubmitDiagnosticRequest> = z.strictObject({
  answers: z.array(z.strictObject({ questionId: id, optionId: id })).max(50),
});

export const learningRecommendationSchema: z.ZodType<LearningRecommendationRequest> =
  z.strictObject({
    role: z.enum(LEARNING_ROLES),
    resumeVersionId: z.uuid('must be a resume version id').optional(),
    corrections: z
      .array(z.strictObject({ skillId: id, status: z.enum(SKILL_CORRECTIONS) }))
      .max(100)
      .optional(),
  });
