import {
  type DismissNextStepRequest,
  LEARNING_CATEGORIES,
  LEARNING_ID_PATTERN,
  LEARNING_ROLES,
  MAX_INTEREST_SKILLS,
  type UpdateLearningPreferencesRequest,
  WEEKLY_GOAL_MINUTES,
} from '@job-assist/shared';
import { z } from 'zod';

const id = z.string().regex(LEARNING_ID_PATTERN, 'must be an id').max(80);

export const updateLearningPreferencesSchema: z.ZodType<UpdateLearningPreferencesRequest> =
  z.strictObject({
    targetRole: z.enum(LEARNING_ROLES).nullable(),
    interestCategories: z.array(z.enum(LEARNING_CATEGORIES)).max(LEARNING_CATEGORIES.length),
    interestSkillIds: z
      .array(id)
      .max(MAX_INTEREST_SKILLS, `choose at most ${MAX_INTEREST_SKILLS} skills`),
    weeklyGoalMinutes: z
      .number()
      .int()
      .refine((v) => (WEEKLY_GOAL_MINUTES as readonly number[]).includes(v), {
        message: `must be one of ${WEEKLY_GOAL_MINUTES.join(', ')}`,
      })
      .nullable(),
  });

/** Next-step keys look like "revise:lesson:sql-fundamentals:sql-joins" or "role:QA_TESTER:sql". */
export const dismissNextStepSchema: z.ZodType<DismissNextStepRequest> = z.strictObject({
  key: z
    .string()
    .max(200)
    .regex(/^[a-z-]+:[A-Za-z0-9:_-]+$/, 'must be a next-step key'),
});
