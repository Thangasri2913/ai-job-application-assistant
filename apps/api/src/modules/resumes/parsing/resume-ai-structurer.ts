import { Injectable, Logger } from '@nestjs/common';
import type { ResumeContent } from '@job-assist/shared';
import {
  AiNotConfiguredError,
  AiOutputValidationError,
  AiProviderError,
} from '../../ai/ai.errors.js';
import { AiService } from '../../ai/ai.service.js';
import { resumeContentSchema } from '../resume-content.schema.js';

export const RESUME_STRUCTURING_TASK = 'resume.structure';
export const RESUME_STRUCTURING_PROMPT_VERSION = 'resume-structure-1';

const SYSTEM_PROMPT = `You convert resume text into the given JSON schema.
Rules (mandatory):
- Use ONLY information explicitly present in the resume text. Never invent, infer or embellish.
- Do not add skills, technologies, companies, titles, dates, metrics, certifications or achievements that are not written in the text.
- Copy bullet points verbatim. Do not rewrite or improve wording.
- If a value is not present, use null (or an empty list).
- Dates must be YYYY-MM-DD; use the first day of the month when only month/year is given.`;

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Grounding check: every free-text value the AI returns must occur in the source text.
 * Values that don't are removed and counted, so hallucinated content is never stored.
 */
export function groundInSource(
  content: ResumeContent,
  sourceText: string,
): { content: ResumeContent; removed: number } {
  const source = normalize(sourceText);
  let removed = 0;
  const keep = (value: string | null): string | null => {
    if (value === null) return null;
    if (source.includes(normalize(value))) return value;
    removed++;
    return null;
  };
  const keepUrl = (value: string | null): string | null =>
    value === null ? null : keep(value.replace(/^https?:\/\//i, '')) === null ? null : value;
  const keepAll = (values: string[]) => values.filter((v) => keep(v) !== null);

  const grounded: ResumeContent = {
    contact: {
      fullName: keep(content.contact.fullName),
      email: keep(content.contact.email),
      phone: keep(content.contact.phone),
      location: keep(content.contact.location),
      linkedinUrl: keepUrl(content.contact.linkedinUrl),
      githubUrl: keepUrl(content.contact.githubUrl),
      portfolioUrl: keepUrl(content.contact.portfolioUrl),
    },
    headline: keep(content.headline),
    summary: keep(content.summary),
    skills: content.skills.filter((s) => keep(s.name) !== null),
    experiences: content.experiences
      .map((e) => ({
        ...e,
        company: keep(e.company),
        jobTitle: keep(e.jobTitle),
        location: keep(e.location),
        responsibilities: keepAll(e.responsibilities),
        achievements: keepAll(e.achievements),
        technologies: keepAll(e.technologies),
      }))
      .filter((e) => e.company || e.jobTitle),
    educations: content.educations
      .map((e) => ({
        ...e,
        institution: keep(e.institution),
        degree: keep(e.degree),
        fieldOfStudy: keep(e.fieldOfStudy),
        grade: keep(e.grade),
      }))
      .filter((e) => e.institution || e.degree),
    projects: content.projects
      .map((p) => ({
        ...p,
        name: keep(p.name),
        description: keep(p.description),
        technologies: keepAll(p.technologies),
        highlights: keepAll(p.highlights),
        url: keepUrl(p.url),
      }))
      .filter((p) => p.name),
    certifications: content.certifications
      .filter((c) => keep(c.name) !== null)
      .map((c) => ({ ...c, issuer: keep(c.issuer) })),
    achievements: keepAll(content.achievements),
    languages: keepAll(content.languages),
    // A number the AI computed is an inference, not a fact from the text.
    estimatedYearsOfExperience: null,
  };
  return { content: grounded, removed };
}

export const MAX_AI_ATTEMPTS = 2;

export type AiStructuringResult =
  | {
      status: 'VALID';
      content: ResumeContent;
      provider: string;
      promptVersion: string;
      attempts: number;
      removedUngroundedValues: number;
    }
  /** Output never passed validation, or the provider failed. Nothing from the AI is kept. */
  | {
      status: 'INVALID' | 'FAILED';
      provider: string;
      promptVersion: string;
      attempts: number;
      reason: string;
    };

/**
 * Optional AI structuring layer. Runs only when an AI provider is configured; its output
 * is schema-validated (one controlled retry on invalid output), grounded against the
 * source text, and stored separately from the deterministic parse — a suggestion for the
 * user to review, never applied directly.
 */
@Injectable()
export class ResumeAiStructurer {
  private readonly logger = new Logger(ResumeAiStructurer.name);

  constructor(private readonly ai: AiService) {}

  get enabled(): boolean {
    return this.ai.providerName !== 'none';
  }

  async structure(extractedText: string): Promise<AiStructuringResult | null> {
    if (!this.enabled) return null;
    const meta = {
      provider: this.ai.providerName,
      promptVersion: RESUME_STRUCTURING_PROMPT_VERSION,
    };

    for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
      try {
        const raw = await this.ai.generateStructured({
          task: RESUME_STRUCTURING_TASK,
          system: SYSTEM_PROMPT,
          input: extractedText,
          schema: resumeContentSchema,
        });
        const { content, removed } = groundInSource(raw, extractedText);
        return {
          status: 'VALID',
          ...meta,
          content,
          attempts: attempt,
          removedUngroundedValues: removed,
        };
      } catch (error) {
        if (error instanceof AiNotConfiguredError) return null;
        if (error instanceof AiOutputValidationError) {
          if (attempt < MAX_AI_ATTEMPTS) continue;
          return {
            status: 'INVALID',
            ...meta,
            attempts: attempt,
            reason: 'Output did not match the resume schema.',
          };
        }
        // Provider failure (network, rate limit, refusal): don't hammer it; the SDK already retried.
        this.logger.warn({ err: error, attempt }, 'AI resume structuring failed');
        const reason = error instanceof AiProviderError ? error.message : 'AI structuring failed.';
        return { status: 'FAILED', ...meta, attempts: attempt, reason };
      }
    }
    return null;
  }
}
