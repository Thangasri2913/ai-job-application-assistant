import { Injectable, Logger } from '@nestjs/common';
import {
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_QUESTION_CATEGORIES,
  STAR_LEVELS,
} from '@job-assist/shared';
import { z } from 'zod';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';
import {
  AiNotConfiguredError,
  AiOutputValidationError,
  AiProviderError,
} from '../../ai/ai.errors.js';
import { AiUsageService } from '../../ai/ai-usage.service.js';
import { AiService } from '../../ai/ai.service.js';
import { contextInput } from '../../application-preparation/ai/preparation-ai.js';
import { numbersIn } from '../../application-preparation/grounding.js';
import type { PreparationContext } from '../../application-preparation/preparation-context.js';
import {
  EVALUATE_SYSTEM,
  EVALUATE_TASK,
  QUESTIONS_SYSTEM,
  QUESTIONS_TASK,
  REPORT_SYSTEM,
  REPORT_TASK,
} from '../prompts.js';
import type { DraftEvaluation, EvaluationInput } from '../rules/answer-evaluator.js';
import type { DraftQuestion, QuestionSettings } from '../rules/question-generator.js';

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const score = z.number().min(0).max(10);

export const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: text(10, 500),
        category: z.enum(INTERVIEW_QUESTION_CATEGORIES),
        difficulty: z.enum(INTERVIEW_DIFFICULTIES),
        expectedTopics: z.array(text(1, 80)).min(1).max(8),
        rationale: text(1, 300),
      }),
    )
    .min(1)
    .max(20),
});

const starLevel = z.enum(STAR_LEVELS);
export const evaluationSchema = z.object({
  overallScore: score,
  dimensions: z.object({
    relevance: score,
    clarity: score,
    technicalAccuracy: score.nullable(),
    structure: score,
    specificity: score,
    communication: score,
    completeness: score,
  }),
  strengths: z.array(text(1, 300)).max(6),
  improvements: z.array(text(1, 300)).max(6),
  star: z
    .object({ situation: starLevel, task: starLevel, action: starLevel, result: starLevel })
    .nullable(),
  technical: z
    .object({
      correctness: score,
      depth: score,
      tradeOffs: score,
      practicalExperience: score,
      clarity: score,
    })
    .nullable(),
  feedback: text(1, 1500),
});

export const reportSchema = z.object({
  summary: text(1, 1200),
  strengths: z.array(text(1, 300)).max(4),
  improvements: z.array(text(1, 300)).max(4),
});

export type AiResult<T> =
  { status: 'VALID'; value: T } | { status: 'INVALID' | 'FAILED'; reason: string };

const normalize = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** "your experience with React" etc. — a question presuming experience. */
const PRESUMES =
  /\byour (?:professional |hands-on )?(?:experience|work|projects?|role) (?:with|in|using) ([\w.#+ -]{1,40})/gi;

/**
 * Structured AI operations for interview practice. Output is schema-validated and checked:
 * questions may not presume experience the candidate doesn't have or introduce numbers not in
 * the job or candidate data; feedback may not supply metrics. One retry with feedback, then the
 * caller falls back to rule-based generation. Every call is recorded in usage.
 */
@Injectable()
export class InterviewAi {
  private readonly logger = new Logger(InterviewAi.name);

  constructor(
    private readonly ai: AiService,
    private readonly usage: AiUsageService,
  ) {}

  get enabled(): boolean {
    return this.ai.enabled;
  }

  generateInterviewQuestions(
    ctx: PreparationContext,
    settings: QuestionSettings,
    avoid: string[] = [],
  ) {
    const allowedNumbers = new Set([...ctx.facts.numbers, ...numbersIn(ctx.job.description)]);
    const avoidSet = new Set(avoid.map(normalize));
    return this.run(
      ctx,
      QUESTIONS_TASK,
      QUESTIONS_SYSTEM,
      questionsSchema,
      (feedback) =>
        contextInput(ctx, [
          '',
          `JOB DESCRIPTION:\n${ctx.job.description.slice(0, 6000)}`,
          `SETTINGS: ${settings.count} questions, focus ${settings.focus}, difficulty ${settings.difficulty}`,
          ...feedback,
        ]),
      (output) => {
        const seen = new Set<string>(avoidSet);
        const kept: DraftQuestion[] = [];
        let dropped = 0;
        for (const q of output.questions) {
          const key = normalize(q.question);
          const presumed = [...q.question.matchAll(PRESUMES)]
            .flatMap((m) => detectSkills(m[1]!))
            .filter((s) => !ctx.facts.skillKeys.has(skillKey(s)));
          const newNumbers = numbersIn(q.question).filter((n) => !allowedNumbers.has(n));
          if (seen.has(key) || presumed.length || newNumbers.length) {
            dropped++;
            continue;
          }
          seen.add(key);
          kept.push({ ...q, difficulty: settings.difficulty });
        }
        return kept.length >= Math.min(settings.count, 3)
          ? { ok: true as const, value: { questions: kept.slice(0, settings.count), dropped } }
          : {
              ok: false as const,
              feedback:
                'Too many questions were duplicates, presumed experience the candidate lacks, or used numbers not in the data.',
            };
      },
    );
  }

  evaluateInterviewAnswer(ctx: PreparationContext, input: EvaluationInput) {
    const allowed = new Set([
      ...numbersIn(input.answer),
      ...ctx.facts.numbers,
      ...numbersIn(input.question),
    ]);
    return this.run(
      ctx,
      EVALUATE_TASK,
      EVALUATE_SYSTEM,
      evaluationSchema,
      (feedback) =>
        contextInput(ctx, [
          '',
          `QUESTION (${input.category}, ${input.difficulty}): ${input.question}`,
          `EXPECTED TOPICS: ${input.expectedTopics.join(', ')}`,
          `CANDIDATE ANSWER:\n${input.answer}`,
          ...feedback,
        ]),
      (output): { ok: true; value: DraftEvaluation } | { ok: false; feedback: string } => {
        // Coaching must not hand the candidate metrics they never stated.
        const invented = numbersIn(
          [...output.strengths, ...output.improvements, output.feedback].join(' '),
        ).filter((n) => !allowed.has(n) && Number(n) > 10);
        if (invented.length)
          return {
            ok: false,
            feedback: `Your feedback contained numbers the candidate never stated (${invented.join(', ')}). Do not supply metrics.`,
          };
        return { ok: true, value: output };
      },
    );
  }

  generateInterviewReport(ctx: PreparationContext, perQuestion: string) {
    return this.run(
      ctx,
      REPORT_TASK,
      REPORT_SYSTEM,
      reportSchema,
      (feedback) =>
        [
          `JOB: ${ctx.job.title} at ${ctx.job.companyName}`,
          'PER-QUESTION FEEDBACK:',
          perQuestion,
          ...feedback,
        ].join('\n'),
      (output) => {
        const invented = numbersIn(
          [output.summary, ...output.strengths, ...output.improvements].join(' '),
        ).filter((n) => !numbersIn(perQuestion).includes(n) && Number(n) > 10);
        return invented.length
          ? { ok: false as const, feedback: 'Do not introduce numbers.' }
          : { ok: true as const, value: output };
      },
    );
  }

  private async run<T, V>(
    ctx: PreparationContext,
    task: string,
    system: string,
    schema: z.ZodType<T>,
    input: (feedback: string[]) => string,
    accept: (output: T) => { ok: true; value: V } | { ok: false; feedback: string },
  ): Promise<AiResult<V> | null> {
    if (!this.ai.enabled) return null;
    let feedback: string[] = [];
    let result: AiResult<V> | null = null;
    let attempts = 0;
    for (let attempt = 1; attempt <= 2 && !result; attempt++) {
      attempts = attempt;
      try {
        const verdict = accept(
          await this.ai.generateStructured({ task, system, input: input(feedback), schema }),
        );
        if (verdict.ok) result = { status: 'VALID', value: verdict.value };
        else feedback = ['', `CORRECTION: ${verdict.feedback}`];
      } catch (error) {
        if (error instanceof AiNotConfiguredError) return null;
        if (error instanceof AiOutputValidationError) {
          feedback = [
            '',
            'CORRECTION: Your previous output did not match the required JSON schema.',
          ];
          continue;
        }
        this.logger.warn({ err: error, task, attempt }, 'AI interview call failed');
        result = {
          status: 'FAILED',
          reason:
            error instanceof AiProviderError
              ? 'The AI service is unavailable right now.'
              : 'The AI service failed.',
        };
      }
    }
    result ??= {
      status: 'INVALID',
      reason: 'The AI output did not pass validation and was discarded.',
    };
    await this.usage.record({
      userId: ctx.userId,
      applicationId: ctx.applicationId,
      operation: task,
      provider: this.ai.providerName,
      model: this.ai.modelName,
      status: result.status === 'VALID' ? 'SUCCEEDED' : result.status,
      attempts,
    });
    return result;
  }
}
