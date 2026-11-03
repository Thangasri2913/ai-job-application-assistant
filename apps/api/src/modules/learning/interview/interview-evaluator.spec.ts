import { INTERVIEW_QUESTIONS } from '../catalogue/interview-questions.js';
import { evaluateInterviewAnswer, mentions } from './interview-evaluator.js';

const question = (id: string) => INTERVIEW_QUESTIONS.find((q) => q.id === id)!;

describe('interview practice rubric', () => {
  it.each(INTERVIEW_QUESTIONS.map((q) => [q.id, q] as const))(
    '%s: its own example answer mentions every key concept',
    (_id, q) => {
      const result = evaluateInterviewAnswer(q, q.exampleAnswer);
      expect(result.missingConceptIds).toEqual([]);
      expect(result.correctness.score).toBe(10);
    },
  );

  it('gives low concept coverage to an off-topic answer and says what is missing', () => {
    const q = question('iq-sql-where-having');
    const result = evaluateInterviewAnswer(
      q,
      'I like databases and I have used them a lot at work.',
    );
    expect(result.coveredConceptIds).toEqual([]);
    expect(result.correctness).toEqual({
      score: 0,
      summary: 'Mentions 0 of 3 key concepts the rubric looks for.',
    });
    expect(result.improvements[0]).toMatch(/^Consider explaining: where filters individual rows/);
  });

  it('credits a partial answer for the concepts it mentions', () => {
    const q = question('iq-be-status-codes');
    const result = evaluateInterviewAnswer(
      q,
      'I would return 400 for invalid input and 404 when the resource is missing.',
    );
    expect(result.coveredConceptIds).toEqual(['bad-request', 'not-found']);
    expect(result.correctness.score).toBe(5);
  });

  it('reuses the interview rules for clarity and length', () => {
    const q = question('iq-js-equality');
    const short = evaluateInterviewAnswer(q, '=== is strict.');
    expect(short.completeness.summary).toBe(
      'About 3 words; around 50 is typical for this question.',
    );
    expect(short.completeness.score).toBeLessThan(2);
    expect(short.improvements.some((i) => i.startsWith('Develop the answer further'))).toBe(true);
  });

  it('is deterministic and records the rubric version', () => {
    const q = question('iq-js-closures');
    expect(evaluateInterviewAnswer(q, q.exampleAnswer)).toEqual(
      evaluateInterviewAnswer(q, q.exampleAnswer),
    );
    expect(evaluateInterviewAnswer(q, 'x').rubricVersion).toBe('learning-interview-rubric-1');
  });

  it('matches patterns case-insensitively', () => {
    expect(mentions('Use a JOIN TABLE', ['join table'])).toBe(true);
    expect(mentions('nothing relevant', ['join table'])).toBe(false);
  });
});
