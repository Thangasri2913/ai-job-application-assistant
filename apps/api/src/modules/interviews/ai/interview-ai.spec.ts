import type { AiUsageRecord, AiUsageService } from '../../ai/ai-usage.service.js';
import { AiService } from '../../ai/ai.service.js';
import { MockAiProvider } from '../../ai/providers/mock-ai.provider.js';
import { context } from '../../application-preparation/preparation.fixture.js';
import { EVALUATE_TASK, QUESTIONS_TASK } from '../prompts.js';
import { InterviewAi } from './interview-ai.js';

function setup(provider: MockAiProvider) {
  const records: AiUsageRecord[] = [];
  const usage = {
    record: (r: AiUsageRecord) => (records.push(r), Promise.resolve()),
  } as unknown as AiUsageService;
  return { ai: new InterviewAi(new AiService(provider), usage), records };
}

const q = (question: string, category = 'TECHNICAL') => ({
  question,
  category,
  difficulty: 'EASY',
  expectedTopics: ['x'],
  rationale: 'r',
});

describe('InterviewAi', () => {
  it('drops duplicates and questions that presume experience the candidate lacks', async () => {
    const provider = new MockAiProvider().respondTo(QUESTIONS_TASK, {
      questions: [
        q('How would you optimise change detection in a large Angular dashboard?'),
        q('How would you optimise change detection in a large Angular dashboard?'),
        q('Tell me about your experience with Docker in production.'), // not in the resume
        q('The role requires Docker. What is your experience with containers?'),
        q('How have you integrated REST APIs and WebSocket feeds?'),
        q('Tell me about the 37 microservices you built.'), // invented number
      ],
    });
    const { ai, records } = setup(provider);
    const result = await ai.generateInterviewQuestions(context(), {
      focus: 'TECHNICAL',
      difficulty: 'MEDIUM',
      count: 5,
    });
    expect(result?.status === 'VALID' && result.value.questions.map((x) => x.question)).toEqual([
      'How would you optimise change detection in a large Angular dashboard?',
      'The role requires Docker. What is your experience with containers?',
      'How have you integrated REST APIs and WebSocket feeds?',
    ]);
    expect(
      result?.status === 'VALID' && result.value.questions.every((x) => x.difficulty === 'MEDIUM'),
    ).toBe(true);
    expect(provider.requests[0]!.system).toMatch(/Do not encourage the candidate to misrepresent/);
    expect(provider.requests[0]!.input).toContain(
      'Developed dashboards for industrial IoT applications using Angular',
    );
    expect(records[0]).toMatchObject({ operation: QUESTIONS_TASK, status: 'SUCCEEDED' });
  });

  it('rejects feedback that hands the candidate invented metrics', async () => {
    const provider = new MockAiProvider().respondTo(EVALUATE_TASK, {
      overallScore: 7,
      dimensions: {
        relevance: 8,
        clarity: 7,
        technicalAccuracy: 7,
        structure: 6,
        specificity: 6,
        communication: 7,
        completeness: 6,
      },
      strengths: ['Clear'],
      improvements: ['Say that you improved load time by 40%'],
      star: null,
      technical: { correctness: 7, depth: 6, tradeOffs: 5, practicalExperience: 7, clarity: 7 },
      feedback: 'Good answer.',
    });
    const { ai, records } = setup(provider);
    const result = await ai.evaluateInterviewAnswer(context(), {
      question: 'How do you optimise Angular?',
      category: 'TECHNICAL',
      difficulty: 'MEDIUM',
      expectedTopics: ['OnPush'],
      answer: 'I use OnPush.',
    });
    expect(result).toMatchObject({ status: 'INVALID' });
    expect(provider.requests[1]!.input).toMatch(/CORRECTION: .*\(40\)/);
    expect(records[0]).toMatchObject({ status: 'INVALID', attempts: 2 });
  });
});
