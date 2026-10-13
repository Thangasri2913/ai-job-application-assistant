import { Injectable, Logger } from '@nestjs/common';
import { CAREER_INSIGHT_CATEGORIES, INSIGHT_CONFIDENCES } from '@job-assist/shared';
import { z } from 'zod';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';
import {
  AiNotConfiguredError,
  AiOutputValidationError,
  AiProviderError,
} from '../../ai/ai.errors.js';
import { AiUsageService } from '../../ai/ai-usage.service.js';
import { AiService } from '../../ai/ai.service.js';
import { numbersIn } from '../../application-preparation/grounding.js';
import { evidenceConfidence, type Fact, type InsightDraft, minConfidence } from './facts.js';

export const INSIGHTS_TASK = 'career.generate_insights';
export const INSIGHTS_PROMPT_VERSION = 'career-insights@1';

export const INSIGHTS_SYSTEM = `You write career insights for a job seeker from FACTS computed from their own application history.

Rules — follow all of them:
- Use ONLY the numbered FACTS. Every insight must cite the fact ids it is based on in "factIds".
- Never invent numbers, skills, roles, companies, outcomes or experience. Any number you write must appear in a fact you cite.
- Describe patterns in the user's data; never predict or guarantee interviews, offers or hiring.
- Do not claim the user has a skill or experience. For skill gaps, say the evidence was limited and suggest highlighting it only if it genuinely reflects their experience.
- When facts say the data is limited, say so; do not draw comparisons the facts don't make.
- Be concise and practical: a short title, a 1–3 sentence explanation, one concrete recommended action.
- Write at most 8 insights. Prefer fewer, well-supported insights.`;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const insightsSchema = z.object({
  insights: z
    .array(
      z.object({
        category: z.enum(CAREER_INSIGHT_CATEGORIES),
        title: text(3, 120),
        explanation: text(10, 600),
        recommendedAction: text(5, 300),
        factIds: z.array(text(2, 10)).min(1).max(5),
        confidence: z.enum(INSIGHT_CONFIDENCES),
      }),
    )
    .min(1)
    .max(8),
});
export type InsightsOutput = z.infer<typeof insightsSchema>;

const GUARANTEES =
  /\bguarantee|\bwill (?:get|land|receive|secure)\b|\bcertain(?:ly)? (?:to )?(?:get|be hired)|\bdefinitely\b|\bensures? (?:you|an?) (?:interview|offer|job)/i;

export type InsightsAiResult =
  | { status: 'VALID'; insights: InsightDraft[]; dropped: number }
  | { status: 'INVALID' | 'FAILED'; reason: string };

/**
 * Checks AI insights against the facts: cited ids must exist, numbers and skills must come
 * from the cited facts, and no outcome may be promised. Confidence is capped by the evidence.
 */
export function groundInsights(
  output: InsightsOutput,
  facts: Fact[],
): { accepted: InsightDraft[]; problems: string[] } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const accepted: InsightDraft[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  output.insights.forEach((insight, i) => {
    const ids = [...new Set(insight.factIds)];
    const cited = ids.map((id) => byId.get(id)).filter((f): f is Fact => f !== undefined);
    const label = `Insight ${i + 1}`;
    if (cited.length !== ids.length) {
      problems.push(`${label} cites unknown fact ids.`);
      return;
    }
    const written = `${insight.title}\n${insight.explanation}\n${insight.recommendedAction}`;
    const evidence = cited.map((f) => f.statement).join('\n');
    const allowedNumbers = new Set(numbersIn(evidence));
    const invented = numbersIn(written).filter((n) => !allowedNumbers.has(n));
    if (invented.length > 0) {
      problems.push(`${label} uses numbers not in its cited facts: ${invented.join(', ')}.`);
      return;
    }
    const evidenceSkills = new Set(detectSkills(evidence).map(skillKey));
    const newSkills = detectSkills(written).filter((s) => !evidenceSkills.has(skillKey(s)));
    if (newSkills.length > 0) {
      problems.push(`${label} mentions skills not in its cited facts: ${newSkills.join(', ')}.`);
      return;
    }
    if (GUARANTEES.test(written)) {
      problems.push(`${label} promises an outcome.`);
      return;
    }
    const key = insight.title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    accepted.push({
      category: insight.category,
      title: insight.title,
      explanation: insight.explanation,
      recommendedAction: insight.recommendedAction,
      factIds: ids,
      confidence: minConfidence(insight.confidence, evidenceConfidence(cited)),
    });
  });
  return { accepted, problems };
}

/** Optional AI wording for insights; the caller falls back to rule-based insights. */
@Injectable()
export class CareerInsightsAi {
  private readonly logger = new Logger(CareerInsightsAi.name);

  constructor(
    private readonly ai: AiService,
    private readonly usage: AiUsageService,
  ) {}

  get enabled(): boolean {
    return this.ai.enabled;
  }

  get provider(): string {
    return this.ai.providerName;
  }

  get model(): string | null {
    return this.ai.modelName;
  }

  async generate(userId: string, facts: Fact[]): Promise<InsightsAiResult | null> {
    if (!this.ai.enabled || facts.length === 0) return null;
    // Minimal input: computed statements only (no resume text, contact data or identifiers).
    const factLines = facts.map(
      (f) =>
        `${f.id} [${f.confidence.toLowerCase()} confidence, sample ${f.sampleSize ?? 'n/a'}]: ${f.statement}`,
    );
    let feedback: string[] = [];
    let result: InsightsAiResult | null = null;
    let attempts = 0;
    for (let attempt = 1; attempt <= 2 && !result; attempt++) {
      attempts = attempt;
      try {
        const output = await this.ai.generateStructured({
          task: INSIGHTS_TASK,
          system: INSIGHTS_SYSTEM,
          input: ['FACTS:', ...factLines, ...feedback].join('\n'),
          schema: insightsSchema,
        });
        const { accepted, problems } = groundInsights(output, facts);
        if (accepted.length > 0) {
          result = { status: 'VALID', insights: accepted, dropped: problems.length };
        } else {
          feedback = ['', `CORRECTION: ${problems.join(' ')} Cite only the facts above.`];
        }
      } catch (error) {
        if (error instanceof AiNotConfiguredError) return null;
        if (error instanceof AiOutputValidationError) {
          feedback = [
            '',
            'CORRECTION: Your previous output did not match the required JSON schema.',
          ];
          continue;
        }
        // Log the failure type only — never prompts, outputs or credentials.
        this.logger.warn(
          { err: error, task: INSIGHTS_TASK, attempt },
          'AI career insights call failed',
        );
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
      userId,
      applicationId: null,
      operation: INSIGHTS_TASK,
      provider: this.ai.providerName,
      model: this.ai.modelName,
      status: result.status === 'VALID' ? 'SUCCEEDED' : result.status,
      attempts,
    });
    return result;
  }
}
