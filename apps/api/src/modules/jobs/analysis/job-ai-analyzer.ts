import { Injectable, Logger } from '@nestjs/common';
import { EMPLOYMENT_TYPES, SENIORITY_LEVELS } from '@job-assist/shared';
import { z } from 'zod';
import {
  detectSkills,
  normalizeSkillName,
  skillKey,
} from '../../../common/skills/skill-normalization.js';
import {
  AiNotConfiguredError,
  AiOutputValidationError,
  AiProviderError,
} from '../../ai/ai.errors.js';
import { AiService } from '../../ai/ai.service.js';
import type { DraftRequirement } from './job-analyzer.js';

export const JOB_ANALYSIS_TASK = 'job.analyze';
export const JOB_ANALYSIS_PROMPT_VERSION = 'job-analysis@1';
export const MAX_AI_ATTEMPTS = 2;

const text = (max: number) => z.string().trim().min(1).max(max);
const quoted = z.object({
  text: text(400),
  /** Verbatim excerpt of the job description that supports the item. */
  evidence: text(400),
});

/** Strict schema for the model's answer. Anything that doesn't fit is rejected, never stored. */
export const jobAnalysisAiSchema = z.object({
  summary: text(600).nullable(),
  requiredSkills: z.array(z.object({ name: text(80), evidence: text(400) })).max(60),
  preferredSkills: z.array(z.object({ name: text(80), evidence: text(400) })).max(60),
  requiredExperience: z
    .array(quoted.extend({ minYears: z.number().int().min(0).max(40).nullable() }))
    .max(20),
  educationRequirements: z.array(quoted).max(10),
  responsibilities: z.array(quoted).max(40),
  otherRequirements: z
    .array(quoted.extend({ importance: z.enum(['REQUIRED', 'PREFERRED']) }))
    .max(30),
  keywords: z.array(text(60)).max(40),
  seniority: z.enum(SENIORITY_LEVELS).nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
  confidence: z.number().min(0).max(1),
});

export type JobAnalysisAiOutput = z.infer<typeof jobAnalysisAiSchema>;

const SYSTEM_PROMPT = `You extract structured requirements from a job description for a job-search assistant.
Rules:
- Use ONLY information stated in the job description. Do not invent requirements, skills, years, degrees or responsibilities.
- For every item, "evidence" must be an exact, verbatim excerpt (copied character for character) of the description that states it.
- Put a skill in requiredSkills only when the description presents it as required; put it in preferredSkills when it says nice-to-have, preferred, bonus, a plus, or similar. If unsure, use preferredSkills.
- Use canonical technology names (e.g. "React" for React.js/ReactJS, "PostgreSQL" for Postgres). Never merge different technologies (Java is not JavaScript; React is not React Native).
- minYears only when a number of years is stated; otherwise null.
- seniority and employmentType only when stated or unambiguous from the text; otherwise null.
- summary: two sentences describing the role, using only facts from the description.
- confidence: how complete and unambiguous the description is (0–1), not how good the job is.
- Do not estimate hiring chances or ATS compatibility.
Return JSON matching the provided schema.`;

export type AiJobAnalysisResult =
  | {
      status: 'VALID';
      provider: string;
      promptVersion: string;
      attempts: number;
      summary: string | null;
      requirements: DraftRequirement[];
      keywords: string[];
      seniority: JobAnalysisAiOutput['seniority'];
      employmentType: JobAnalysisAiOutput['employmentType'];
      confidence: number;
      removedUngroundedItems: number;
    }
  | {
      status: 'INVALID' | 'FAILED';
      provider: string;
      promptVersion: string;
      attempts: number;
      reason: string;
    };

const squash = (value: string) =>
  value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}+#.'" ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const textKey = (value: string) => squash(value).slice(0, 200);

/**
 * Keeps only what the description supports: evidence must occur in the text, and a skill
 * must actually be mentioned there (by any spelling). Everything else is dropped and counted.
 */
export function groundJobAnalysis(output: JobAnalysisAiOutput, description: string) {
  const source = squash(description);
  const mentionedSkills = new Set(detectSkills(description).map((s) => s.toLowerCase()));
  let removed = 0;
  const supported = (evidence: string) => {
    const ok = source.includes(squash(evidence));
    if (!ok) removed++;
    return ok;
  };
  const requirements: DraftRequirement[] = [];
  const pushSkill = (name: string, evidence: string, importance: 'REQUIRED' | 'PREFERRED') => {
    const canonical = normalizeSkillName(name);
    const mentioned = mentionedSkills.has(canonical.toLowerCase()) || source.includes(squash(name));
    if (!mentioned) {
      removed++;
      return;
    }
    if (!supported(evidence)) return;
    requirements.push({
      type: 'SKILL',
      name: canonical,
      normalizedName: skillKey(canonical),
      importance,
      origin: 'EXPLICIT',
      detectedBy: 'AI',
      evidence,
      minYears: null,
    });
  };
  for (const s of output.requiredSkills) pushSkill(s.name, s.evidence, 'REQUIRED');
  for (const s of output.preferredSkills) pushSkill(s.name, s.evidence, 'PREFERRED');

  const pushText = (
    type: DraftRequirement['type'],
    item: { text: string; evidence: string },
    importance: 'REQUIRED' | 'PREFERRED',
    minYears: number | null = null,
  ) => {
    if (!supported(item.evidence)) return;
    // A stated number of years must appear in the quoted evidence.
    const years =
      minYears !== null && new RegExp(`\\b${minYears}\\b`).test(item.evidence) ? minYears : null;
    requirements.push({
      type,
      name: item.evidence,
      normalizedName: textKey(item.evidence),
      importance,
      origin: 'EXPLICIT',
      detectedBy: 'AI',
      evidence: item.evidence,
      minYears: years,
    });
  };
  for (const e of output.requiredExperience) pushText('EXPERIENCE', e, 'REQUIRED', e.minYears);
  for (const e of output.educationRequirements) pushText('EDUCATION', e, 'REQUIRED');
  for (const r of output.responsibilities) pushText('RESPONSIBILITY', r, 'REQUIRED');
  for (const o of output.otherRequirements) pushText('OTHER', o, o.importance);

  const keywords = output.keywords.filter((k) => {
    const ok =
      source.includes(squash(k)) || mentionedSkills.has(normalizeSkillName(k).toLowerCase());
    if (!ok) removed++;
    return ok;
  });
  return { requirements, keywords, removed };
}

/**
 * Optional AI layer for job analysis. Runs only when an AI provider is configured; the
 * output is schema-validated (one controlled retry on invalid output) and grounded in the
 * description before anything is used. The rule-based analysis is always available.
 */
@Injectable()
export class JobAiAnalyzer {
  private readonly logger = new Logger(JobAiAnalyzer.name);

  constructor(private readonly ai: AiService) {}

  get enabled(): boolean {
    return this.ai.providerName !== 'none';
  }

  async analyze(job: {
    title: string;
    companyName: string;
    description: string;
  }): Promise<AiJobAnalysisResult | null> {
    if (!this.enabled) return null;
    const meta = { provider: this.ai.providerName, promptVersion: JOB_ANALYSIS_PROMPT_VERSION };
    for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
      try {
        const output = await this.ai.generateStructured({
          task: JOB_ANALYSIS_TASK,
          system: SYSTEM_PROMPT,
          input: `Job title: ${job.title}\nCompany: ${job.companyName}\n\n${job.description}`,
          schema: jobAnalysisAiSchema,
        });
        const grounded = groundJobAnalysis(output, `${job.title}\n${job.description}`);
        return {
          status: 'VALID',
          ...meta,
          attempts: attempt,
          summary: output.summary,
          requirements: grounded.requirements,
          keywords: grounded.keywords,
          seniority: output.seniority,
          employmentType: output.employmentType,
          confidence: output.confidence,
          removedUngroundedItems: grounded.removed,
        };
      } catch (error) {
        if (error instanceof AiNotConfiguredError) return null;
        if (error instanceof AiOutputValidationError) {
          if (attempt < MAX_AI_ATTEMPTS) continue;
          return {
            status: 'INVALID',
            ...meta,
            attempts: attempt,
            reason: 'AI output did not match the job-analysis schema and was discarded.',
          };
        }
        this.logger.warn({ err: error, attempt }, 'AI job analysis failed');
        const reason =
          error instanceof AiProviderError ? error.message : 'The AI service was unavailable.';
        return { status: 'FAILED', ...meta, attempts: attempt, reason };
      }
    }
    return null;
  }
}
