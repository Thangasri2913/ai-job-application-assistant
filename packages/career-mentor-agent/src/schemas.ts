import {
  LEARNING_ROLES,
  MENTOR_FALLBACK_REASONS,
  MENTOR_INTENTS,
  MENTOR_MESSAGE_MAX_LENGTH,
  MENTOR_RECOMMENDATION_TYPES,
  MENTOR_TOOLS,
  type MentorAskRequest,
} from '@job-assist/shared';
import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

/** Request contract. The host API uses this same schema to validate the HTTP body. */
export const mentorAskSchema: z.ZodType<MentorAskRequest> = z
  .strictObject({
    intent: z.enum(MENTOR_INTENTS),
    message: z
      .string()
      .max(MENTOR_MESSAGE_MAX_LENGTH, `must be at most ${MENTOR_MESSAGE_MAX_LENGTH} characters`)
      .optional(),
    jobId: z.uuid('must be a job id').optional(),
  })
  .refine((v) => !v.jobId || v.intent === 'JOB_FIT', {
    message: 'jobId is only used with the JOB_FIT intent',
    path: ['jobId'],
  });

export const MAX_RECOMMENDATIONS = 8;

/** Response contract, validated before every answer leaves the agent. */
export const mentorResponseSchema = z.strictObject({
  intent: z.enum(MENTOR_INTENTS),
  summary: text(1200),
  explanation: text(400).nullable(),
  recommendations: z
    .array(
      z.strictObject({
        type: z.enum(MENTOR_RECOMMENDATION_TYPES),
        id: text(200),
        courseId: z.string().max(80).nullable(),
        title: text(300),
        reason: text(600),
        // In-app links only.
        href: z.string().regex(/^\/(learn|jobs)\//, 'must be an in-app link'),
        evidence: z.array(text(300)).max(5),
      }),
    )
    .max(MAX_RECOMMENDATIONS),
  uncertainty: z.array(text(400)).max(8),
  proposedActions: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({
          type: z.literal('SET_TARGET_ROLE'),
          role: z.enum(LEARNING_ROLES),
          label: text(120),
          description: text(300),
        }),
        z.strictObject({
          type: z.literal('ADD_COURSE'),
          courseId: text(80),
          label: text(120),
          description: text(300),
        }),
      ]),
    )
    .max(3),
  factsUsed: z.array(z.strictObject({ label: text(80), value: text(200) })).max(12),
  toolsUsed: z.array(z.enum(MENTOR_TOOLS)),
  source: z.enum(['AI', 'RULES']),
  fallbackReason: z.enum(MENTOR_FALLBACK_REASONS).nullable(),
  followUpQuestion: text(300).nullable(),
  disclaimer: text(500),
});

/**
 * What the model may return (prompt mentor-compose@3): only which verified candidates to show,
 * in which order, by label. There is no text field, and unknown keys are rejected, so the model
 * cannot supply any wording, fact, reason, id, link or action.
 */
export const mentorAiDraftSchema = z.strictObject({
  picks: z.array(z.string().regex(/^R\d{1,2}$/)).max(MAX_RECOMMENDATIONS),
});
export type MentorAiDraft = z.infer<typeof mentorAiDraftSchema>;
