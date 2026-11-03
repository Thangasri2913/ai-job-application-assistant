import { AiService } from '../../ai/ai.service.js';
import { MockAiProvider } from '../../ai/providers/mock-ai.provider.js';
import { UnconfiguredAiProvider } from '../../ai/providers/unconfigured-ai.provider.js';
import {
  PRACTICE_ACTIVITY_TASK,
  PracticeActivityGenerator,
} from './practice-activity-generator.js';

const valid = {
  id: 'generated-join-check',
  type: 'MULTIPLE_CHOICE',
  variant: 'SQL',
  prompt: 'Which join keeps every row of the left table?',
  options: [
    { id: 'a', text: 'LEFT JOIN', correct: true, feedback: 'Right.' },
    { id: 'b', text: 'INNER JOIN', feedback: 'Inner joins drop unmatched rows.' },
  ],
  explanation: 'LEFT JOIN keeps all left-hand rows.',
  provenance: {
    origin: 'ORIGINAL',
    review: { status: 'REVIEWED', reviewedBy: 'Model', reviewedAt: '2026-01-01' },
  },
};
const request = { skill: 'SQL', level: 2 as const, topic: 'Joins' };

const generator = (provider: MockAiProvider | UnconfiguredAiProvider) =>
  new PracticeActivityGenerator(new AiService(provider));

describe('PracticeActivityGenerator', () => {
  it('reports UNAVAILABLE without calling anything when no provider is configured', async () => {
    const g = generator(new UnconfiguredAiProvider());
    expect(g.available).toBe(false);
    expect(await g.draft(request)).toEqual({ status: 'UNAVAILABLE', reason: expect.any(String) });
  });

  it('returns a validated activity, always labelled AI-generated and unreviewed', async () => {
    const provider = new MockAiProvider().respondTo(PRACTICE_ACTIVITY_TASK, valid);
    const draft = await generator(provider).draft(request);
    expect(draft.status).toBe('OK');
    if (draft.status !== 'OK') return;
    expect(draft.activity.provenance).toEqual({
      origin: 'AI_GENERATED',
      review: { status: 'UNREVIEWED' },
    });
    // Only non-personal input is sent.
    expect(JSON.parse(provider.requests[0]!.input)).toEqual({
      skill: 'SQL',
      level: 'Core concepts',
      topic: 'Joins',
    });
  });

  it('rejects output that fails the schema, without exposing it', async () => {
    const provider = new MockAiProvider().respondTo(PRACTICE_ACTIVITY_TASK, {
      ...valid,
      options: valid.options.map((o) => ({ ...o, correct: false })),
    });
    const draft = await generator(provider).draft(request);
    expect(draft).toEqual({
      status: 'FAILED',
      reason: 'A practice activity could not be generated right now.',
    });
  });

  it('rejects generated links (sources must be curated)', async () => {
    const provider = new MockAiProvider().respondTo(PRACTICE_ACTIVITY_TASK, {
      ...valid,
      explanation: 'See https://example.com/sql-joins for more.',
    });
    expect((await generator(provider).draft(request)).status).toBe('FAILED');
  });

  it('fails gracefully when the provider errors', async () => {
    const draft = await generator(new MockAiProvider()).draft(request);
    expect(draft).toEqual({
      status: 'FAILED',
      reason: expect.not.stringContaining('MockAiProvider'),
    });
  });
});
