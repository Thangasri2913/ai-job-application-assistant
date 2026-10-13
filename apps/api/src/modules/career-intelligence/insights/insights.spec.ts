import type { AiUsageService } from '../../ai/ai-usage.service.js';
import { AiService } from '../../ai/ai.service.js';
import { MockAiProvider } from '../../ai/providers/mock-ai.provider.js';
import { UnconfiguredAiProvider } from '../../ai/providers/unconfigured-ai.provider.js';
import { buildReport } from '../analytics/report.js';
import type { ApplicationRecord } from '../analytics/types.js';
import { buildFacts, type Fact, factsFingerprint } from './facts.js';
import {
  CareerInsightsAi,
  groundInsights,
  INSIGHTS_TASK,
  type InsightsOutput,
} from './insights-ai.js';
import { ruleInsights } from './rules.js';

const fact = (id: string, statement: string, o: Partial<Fact> = {}): Fact => ({
  id,
  kind: 'SKILL_GAP',
  statement,
  sampleSize: 6,
  confidence: 'LOW',
  data: { skill: 'React' },
  ...o,
});

const FACTS: Fact[] = [
  fact(
    'F1',
    'React appears in 6 of your 9 analysed target jobs (required in 4); your best-matching resume showed limited evidence for it in 5 of them.',
  ),
  fact(
    'F2',
    'You have 12 submitted applications: 3 reached an interview (25%), 1 received an offer (8%) and 6 received a response (50%).',
    {
      kind: 'TOTALS',
      sampleSize: 12,
      confidence: 'MEDIUM',
      data: undefined,
    },
  ),
];

const insight = (o: Partial<InsightsOutput['insights'][number]> = {}) => ({
  category: 'SKILL_PRIORITY' as const,
  title: 'React may be worth strengthening',
  explanation:
    'React appears in 6 of your 9 analysed target jobs, while limited evidence was found in your resumes.',
  recommendedAction: 'If it reflects your real experience, highlight React in the resume you use.',
  factIds: ['F1'],
  confidence: 'HIGH' as const,
  ...o,
});

describe('facts', () => {
  const app = (status: ApplicationRecord['status'][]): ApplicationRecord => ({
    id: 'a',
    status: status[status.length - 1]!,
    reached: status,
    appliedAt: new Date('2026-10-01'),
    createdAt: new Date('2026-10-01'),
    source: null,
    jobTitle: 'Frontend Developer',
    companyName: 'Acme',
    location: null,
    workMode: null,
    seniority: null,
    resume: {
      resumeId: 'r',
      resumeName: 'Angular Resume',
      resumeVersionId: 'v',
      versionNumber: 1,
      isCurrent: true,
      resumeArchived: false,
    },
    matchScore: 70,
    requiredSkills: [],
    rejectionCategory: null,
  });

  it('builds numbered facts and a stable fingerprint that changes with the data', () => {
    const now = new Date('2026-10-12');
    const base = { targetJobs: [], resumeVersions: [], interviewSessions: [] };
    const facts = buildFacts(buildReport({ ...base, applications: [app(['APPLIED'])] }, now));
    expect(facts.map((f) => [f.id, f.kind])).toEqual([
      ['F1', 'TOTALS'],
      ['F2', 'LIMITATION'],
    ]);
    expect(facts[0]!.statement).toBe(
      'You have 1 submitted application: 0 reached an interview (0%), 0 received an offer (0%) and 0 received a response (0%).',
    );
    const again = buildFacts(
      buildReport({ ...base, applications: [app(['APPLIED'])] }, new Date()),
    );
    expect(factsFingerprint(again)).toBe(factsFingerprint(facts));
    const changed = buildFacts(
      buildReport({ ...base, applications: [app(['APPLIED', 'INTERVIEW'])] }, now),
    );
    expect(factsFingerprint(changed)).not.toBe(factsFingerprint(facts));
  });
});

describe('rule-based insights', () => {
  it('turns facts into insights that cite them, with no promises', () => {
    const drafts = ruleInsights([
      ...FACTS,
      fact(
        'F3',
        'You have 2 submitted applications; at least 10 are needed before outcome patterns are identified.',
        {
          kind: 'LIMITATION',
          confidence: 'HIGH',
        },
      ),
    ]);
    expect(drafts.map((d) => [d.category, d.factIds])).toEqual([
      ['SKILL_PRIORITY', ['F1']],
      ['RECOMMENDATION', ['F3']],
    ]);
    expect(drafts[0]!.explanation).toBe(FACTS[0]!.statement);
    expect(drafts[0]!.recommendedAction).toMatch(/If you have genuine React/);
    for (const d of drafts)
      expect(`${d.title} ${d.explanation} ${d.recommendedAction}`).not.toMatch(/guarantee/i);
  });
});

describe('AI insight grounding', () => {
  it('accepts grounded insights and caps confidence by the evidence', () => {
    const { accepted, problems } = groundInsights({ insights: [insight()] }, FACTS);
    expect(problems).toEqual([]);
    expect(accepted[0]).toMatchObject({ factIds: ['F1'], confidence: 'LOW' });
  });

  it('rejects unknown facts, invented numbers, new skills and promises', () => {
    const { accepted, problems } = groundInsights(
      {
        insights: [
          insight({ factIds: ['F9'] }),
          insight({ explanation: 'React appears in 14 of your target jobs.' }),
          insight({ recommendedAction: 'Learn Kubernetes and highlight React.' }),
          insight({ recommendedAction: 'Adding React will get you interviews.' }),
        ],
      },
      FACTS,
    );
    expect(accepted).toEqual([]);
    expect(problems).toEqual([
      'Insight 1 cites unknown fact ids.',
      'Insight 2 uses numbers not in its cited facts: 14.',
      'Insight 3 mentions skills not in its cited facts: Kubernetes.',
      'Insight 4 promises an outcome.',
    ]);
  });
});

describe('CareerInsightsAi', () => {
  const usage = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AiUsageService;

  it('returns null when AI is not configured (rules are used)', async () => {
    const ai = new CareerInsightsAi(new AiService(new UnconfiguredAiProvider()), usage);
    expect(await ai.generate('u1', FACTS)).toBeNull();
  });

  it('sends only the computed facts and returns validated insights', async () => {
    const provider = new MockAiProvider().respondTo(INSIGHTS_TASK, { insights: [insight()] });
    const result = await new CareerInsightsAi(new AiService(provider), usage).generate('u1', FACTS);
    expect(result).toMatchObject({ status: 'VALID', dropped: 0 });
    const input = provider.requests[0]!.input;
    expect(input).toContain('F1 [low confidence, sample 6]: React appears in 6');
    expect(input).not.toMatch(/@|password|token/i);
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: INSIGHTS_TASK,
        status: 'SUCCEEDED',
        applicationId: null,
      }),
    );
  });

  it('retries once with a correction, then reports invalid output (nothing stored)', async () => {
    const provider = new MockAiProvider().respondTo(INSIGHTS_TASK, {
      insights: [insight({ explanation: 'React appears in 40 jobs.' })],
    });
    const result = await new CareerInsightsAi(new AiService(provider), usage).generate('u1', FACTS);
    expect(result).toEqual({
      status: 'INVALID',
      reason: 'The AI output did not pass validation and was discarded.',
    });
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]!.input).toMatch(
      /CORRECTION: Insight 1 uses numbers not in its cited facts: 40/,
    );
  });

  it('rejects output that does not match the schema', async () => {
    const provider = new MockAiProvider().respondTo(INSIGHTS_TASK, { insights: [{ title: 'x' }] });
    const result = await new CareerInsightsAi(new AiService(provider), usage).generate('u1', FACTS);
    expect(result?.status).toBe('INVALID');
    expect(provider.requests[1]!.input).toMatch(/did not match the required JSON schema/);
  });
});
