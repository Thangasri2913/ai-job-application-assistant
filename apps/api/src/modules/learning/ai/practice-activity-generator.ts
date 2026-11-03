import { Injectable, Logger } from '@nestjs/common';
import { SKILL_LEVEL_LABELS, type SkillLevel } from '@job-assist/shared';
import { z } from 'zod';
import { AiService } from '../../ai/ai.service.js';
import {
  AI_UNREVIEWED,
  fillInTheGapSchema,
  multipleChoiceSchema,
  type ParsedActivity,
  shortAnswerSchema,
} from '../catalogue/content.js';

/** Only automatically gradable activity types may be generated. */
export const generatedActivitySchema = z.union([
  multipleChoiceSchema,
  fillInTheGapSchema,
  shortAnswerSchema,
]);

export const PRACTICE_ACTIVITY_TASK = 'learning.practice-activity';

export interface PracticeActivityRequest {
  /** Skill display name, e.g. "SQL". */
  skill: string;
  level: Exclude<SkillLevel, 0>;
  /** Lesson topic, e.g. "Joins". */
  topic: string;
}

export type PracticeActivityDraft =
  { status: 'OK'; activity: ParsedActivity } | { status: 'UNAVAILABLE' | 'FAILED'; reason: string };

const SYSTEM = `You write one short practice activity for a learner.
Rules:
- Return exactly one activity matching the JSON schema: MULTIPLE_CHOICE, FILL_IN_THE_GAP or SHORT_ANSWER.
- Use plain text only. No HTML, no Markdown links, no URLs, no citations, no book or article titles.
- Questions must have one unambiguous correct answer. Explain why it is correct.
- Do not ask for or include personal information.
- If you cannot write a correct activity for the topic, still return a simple, correct multiple-choice question about its basics.`;

const URL_PATTERN = /\bhttps?:\/\/|\bwww\./i;

/**
 * Foundation for AI-generated practice (ADR-0022). Not yet exposed through an endpoint.
 *
 * - Provider-independent: goes through AiService, which validates the output against the same
 *   schema static activities must pass.
 * - Only non-personal input is sent (skill, level, topic) — never resume or progress data.
 * - Output is untrusted: links are rejected (sources are curated, never generated), and the
 *   result is always labelled AI-generated and unreviewed.
 * - Fails gracefully: with no provider configured, or on any provider/validation error, it
 *   returns a status the caller can show — never raw provider errors.
 */
@Injectable()
export class PracticeActivityGenerator {
  private readonly logger = new Logger(PracticeActivityGenerator.name);

  constructor(private readonly ai: AiService) {}

  get available(): boolean {
    return this.ai.enabled;
  }

  async draft(request: PracticeActivityRequest): Promise<PracticeActivityDraft> {
    if (!this.ai.enabled)
      return { status: 'UNAVAILABLE', reason: 'AI-generated practice is not configured.' };
    try {
      const activity = await this.ai.generateStructured({
        task: PRACTICE_ACTIVITY_TASK,
        system: SYSTEM,
        input: JSON.stringify({
          skill: request.skill.slice(0, 80),
          level: SKILL_LEVEL_LABELS[request.level],
          topic: request.topic.slice(0, 120),
        }),
        schema: generatedActivitySchema,
      });
      if (URL_PATTERN.test(JSON.stringify(activity)))
        return {
          status: 'FAILED',
          reason: 'The generated activity was rejected because it contained links.',
        };
      // Provenance is decided here, never by the model.
      return { status: 'OK', activity: { ...activity, provenance: AI_UNREVIEWED } };
    } catch (error) {
      this.logger.warn(
        { task: PRACTICE_ACTIVITY_TASK, error: error instanceof Error ? error.name : 'unknown' },
        'Practice activity generation failed',
      );
      return { status: 'FAILED', reason: 'A practice activity could not be generated right now.' };
    }
  }
}
