import type { AiUsageRecord, AiUsageService } from '../../ai/ai-usage.service.js';
import { AiService } from '../../ai/ai.service.js';
import { MockAiProvider } from '../../ai/providers/mock-ai.provider.js';
import { UnconfiguredAiProvider } from '../../ai/providers/unconfigured-ai.provider.js';
import { context } from '../preparation.fixture.js';
import { ANSWER_TASK, COVER_LETTER_TASK, RESUME_TAILORING_TASK } from '../prompts.js';
import { PreparationAi } from './preparation-ai.js';

function setup(provider: MockAiProvider | UnconfiguredAiProvider) {
  const records: AiUsageRecord[] = [];
  const usage = {
    record: (r: AiUsageRecord) => (records.push(r), Promise.resolve()),
  } as unknown as AiUsageService;
  return { ai: new PreparationAi(new AiService(provider), usage), records };
}

const LETTER = `Dear Hiring Team,

I am applying for the Frontend Developer position at ABC Technologies. In my current role as Frontend Developer at Acme, I developed dashboards for industrial IoT applications using Angular and integrated REST APIs and WebSocket feeds for 12 device types. I work daily with TypeScript and RxJS.

Regards,
Thanga Sri`;

describe('PreparationAi', () => {
  it('does nothing without a provider', async () => {
    const { ai, records } = setup(new UnconfiguredAiProvider());
    expect(ai.enabled).toBe(false);
    expect(await ai.generateCoverLetter(context())).toBeNull();
    expect(records).toEqual([]);
  });

  it('keeps only rewrites of real resume lines that add no new facts', async () => {
    const provider = new MockAiProvider().respondTo(RESUME_TAILORING_TASK, {
      suggestions: [
        {
          section: 'EXPERIENCE',
          originalText: 'Developed dashboards for industrial IoT applications using Angular',
          suggestedText: 'Developed interactive Angular dashboards for an industrial IoT platform',
          reason: 'Highlights dashboard development',
          jobRequirement: 'Dashboards',
          confidence: 0.9,
        },
        {
          section: 'EXPERIENCE',
          originalText: 'Reviewed pull requests',
          suggestedText: 'Reviewed 200 pull requests',
          reason: 'x',
          jobRequirement: null,
          confidence: 0.5,
        }, // new number
        {
          section: 'EXPERIENCE',
          originalText: 'Reviewed pull requests',
          suggestedText: 'Reviewed pull requests and ran Docker builds',
          reason: 'x',
          jobRequirement: 'Docker',
          confidence: 0.5,
        }, // new skill
        {
          section: 'EXPERIENCE',
          originalText: 'Led a team of engineers',
          suggestedText: 'Led a team',
          reason: 'x',
          jobRequirement: null,
          confidence: 0.5,
        }, // not in resume
      ],
    });
    const { ai, records } = setup(provider);
    const result = await ai.analyzeResumeTailoring(context());
    expect(result).toMatchObject({ status: 'VALID', dropped: 3 });
    expect(result?.status === 'VALID' && result.value.map((s) => s.suggestedText)).toEqual([
      'Developed interactive Angular dashboards for an industrial IoT platform',
    ]);
    // The prompt carries this user's resume lines and the non-fabrication rules.
    expect(provider.requests[0]!.input).toContain(
      '- Developed dashboards for industrial IoT applications using Angular',
    );
    expect(provider.requests[0]!.system).toMatch(/Never invent experience/);
    expect(provider.requests[0]!.system).toMatch(/Do not claim ATS compatibility as fact/);
    expect(records).toEqual([
      expect.objectContaining({
        userId: 'u1',
        applicationId: 'a1',
        operation: RESUME_TAILORING_TASK,
        provider: 'mock',
        status: 'SUCCEEDED',
        attempts: 1,
      }),
    ]);
  });

  it('accepts a grounded cover letter', async () => {
    const { ai } = setup(
      new MockAiProvider().respondTo(COVER_LETTER_TASK, {
        coverLetter: LETTER,
        notClaimed: ['Docker'],
      }),
    );
    expect(await ai.generateCoverLetter(context())).toMatchObject({
      status: 'VALID',
      value: { notClaimed: ['Docker'] },
    });
  });

  it('retries a cover letter that claims unsupported skills, then discards it', async () => {
    const provider = new MockAiProvider().respondTo(COVER_LETTER_TASK, {
      coverLetter: `${LETTER}\nI also have 5 years of AWS and Docker experience.`,
      notClaimed: [],
    });
    const { ai, records } = setup(provider);
    const result = await ai.generateCoverLetter(context());
    expect(result).toMatchObject({ status: 'INVALID', attempts: 2 });
    expect(provider.requests[1]!.input).toMatch(
      /CORRECTION: .*skills not in your data: AWS, Docker; numbers not in your data: 5/,
    );
    expect(records[0]).toMatchObject({ status: 'INVALID', attempts: 2 });
  });

  it('rejects malformed output after one retry', async () => {
    const provider = new MockAiProvider().respondTo(COVER_LETTER_TASK, { letter: 'hi' });
    const { ai } = setup(provider);
    expect(await ai.generateCoverLetter(context())).toMatchObject({
      status: 'INVALID',
      attempts: 2,
    });
    expect(provider.requests).toHaveLength(2);
  });

  it('reports provider failures without retrying', async () => {
    const { ai, records } = setup(new MockAiProvider());
    expect(await ai.generateCoverLetter(context())).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      reason: 'The AI service failed.',
    });
    expect(records[0]).toMatchObject({ status: 'FAILED' });
  });

  it('enforces answer limits: retries, then shortens', async () => {
    const long = 'I developed dashboards for industrial IoT applications using Angular. '
      .repeat(10)
      .trim();
    const provider = new MockAiProvider().respondTo(ANSWER_TASK, {
      answer: long,
      insufficientInformation: false,
      missingInformation: [],
      assumptions: [],
    });
    const { ai } = setup(provider);
    const result = await ai.generateApplicationAnswer(
      context(),
      'Describe your Angular experience (max 20 words)',
      { maxWords: 20, maxCharacters: null },
    );
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[0]!.input).toMatch(/LIMIT: at most 20 words/);
    expect(
      result?.status === 'VALID' && result.value.answer.split(/\s+/).length,
    ).toBeLessThanOrEqual(20);
  });

  it('passes through an honest "insufficient information" answer', async () => {
    const { ai } = setup(
      new MockAiProvider().respondTo(ANSWER_TASK, {
        answer: '',
        insufficientInformation: true,
        missingInformation: ['Your reasons for joining ABC'],
        assumptions: [],
      }),
    );
    expect(
      await ai.generateApplicationAnswer(context(), 'Why ABC?', {
        maxWords: null,
        maxCharacters: null,
      }),
    ).toMatchObject({
      status: 'VALID',
      value: {
        insufficientInformation: true,
        missingInformation: ['Your reasons for joining ABC'],
      },
    });
  });
});
