import type { ResumeContent } from '@job-assist/shared';
import { AiProviderError } from '../../ai/ai.errors.js';
import { AiService } from '../../ai/ai.service.js';
import { MockAiProvider } from '../../ai/providers/mock-ai.provider.js';
import { UnconfiguredAiProvider } from '../../ai/providers/unconfigured-ai.provider.js';
import { emptyResumeContent } from '../resume-content.schema.js';
import {
  groundInSource,
  RESUME_STRUCTURING_TASK,
  ResumeAiStructurer,
} from './resume-ai-structurer.js';

const SOURCE = `Priya Sharma
SKILLS
Angular, TypeScript
EXPERIENCE
Frontend Developer at Acme
- Built dashboards in Angular`;

function aiOutput(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    ...emptyResumeContent(),
    contact: { ...emptyResumeContent().contact, fullName: 'Priya Sharma' },
    skills: [
      { name: 'Angular', category: 'FRONTEND' },
      { name: 'React', category: 'FRONTEND' }, // not in the source: hallucinated
    ],
    experiences: [
      {
        company: 'Acme',
        jobTitle: 'Frontend Developer',
        location: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        responsibilities: ['Built dashboards in Angular'],
        achievements: ['Improved performance by 40%'], // invented metric
        technologies: ['Angular', 'AWS'], // AWS invented
      },
    ],
    estimatedYearsOfExperience: 5,
    ...overrides,
  };
}

describe('groundInSource', () => {
  it('removes every value that does not appear in the resume text', () => {
    const { content, removed } = groundInSource(aiOutput(), SOURCE);
    expect(content.skills.map((s) => s.name)).toEqual(['Angular']);
    expect(content.experiences[0]?.achievements).toEqual([]);
    expect(content.experiences[0]?.technologies).toEqual(['Angular']);
    expect(content.experiences[0]?.responsibilities).toEqual(['Built dashboards in Angular']);
    expect(removed).toBe(3);
  });

  it('keeps a headline only when it appears in the resume text', () => {
    expect(
      groundInSource(aiOutput({ headline: 'Frontend Developer' }), SOURCE).content.headline,
    ).toBe('Frontend Developer');
    expect(
      groundInSource(aiOutput({ headline: 'Senior Staff Engineer' }), SOURCE).content.headline,
    ).toBeNull();
  });

  it('never keeps an AI-computed years-of-experience figure', () => {
    expect(groundInSource(aiOutput(), SOURCE).content.estimatedYearsOfExperience).toBeNull();
  });
});

describe('ResumeAiStructurer', () => {
  it('is disabled and returns null when no AI provider is configured', async () => {
    const structurer = new ResumeAiStructurer(new AiService(new UnconfiguredAiProvider()));
    expect(structurer.enabled).toBe(false);
    await expect(structurer.structure(SOURCE)).resolves.toBeNull();
  });

  it('returns validated, grounded output from the provider', async () => {
    const provider = new MockAiProvider().respondTo(RESUME_STRUCTURING_TASK, aiOutput());
    const result = await new ResumeAiStructurer(new AiService(provider)).structure(SOURCE);
    if (result?.status !== 'VALID') throw new Error('expected VALID');
    expect(result.content.skills.map((s) => s.name)).toEqual(['Angular']);
    expect(result.removedUngroundedValues).toBe(3);
    expect(provider.requests[0]?.system).toMatch(/Never invent/);
  });

  it('retries invalid output once, then reports INVALID and keeps nothing', async () => {
    const provider = new MockAiProvider().respondTo(RESUME_STRUCTURING_TASK, {
      skills: 'not-a-list',
    });
    const result = await new ResumeAiStructurer(new AiService(provider)).structure(SOURCE);
    expect(result).toMatchObject({ status: 'INVALID', attempts: 2 });
    expect(result).not.toHaveProperty('content');
    expect(provider.requests).toHaveLength(2);
  });

  it('accepts a valid answer on the controlled retry', async () => {
    const outputs: unknown[] = [{ skills: 'bad' }, aiOutput()];
    const provider = {
      name: 'stub',
      generateStructured: vi.fn(() => Promise.resolve(outputs.shift())),
    };
    const result = await new ResumeAiStructurer(new AiService(provider)).structure(SOURCE);
    expect(result).toMatchObject({ status: 'VALID', attempts: 2 });
  });

  it('reports provider failures without retrying them itself', async () => {
    const provider = {
      name: 'stub',
      generateStructured: vi.fn(() =>
        Promise.reject(new AiProviderError('AI provider rate limit reached.', true)),
      ),
    };
    const result = await new ResumeAiStructurer(new AiService(provider)).structure(SOURCE);
    expect(result).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      reason: 'AI provider rate limit reached.',
    });
    expect(provider.generateStructured).toHaveBeenCalledTimes(1);
  });
});
