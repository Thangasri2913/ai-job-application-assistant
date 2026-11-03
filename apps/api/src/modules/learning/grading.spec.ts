import { activitySourceSchema } from './catalogue/content.js';
import { gradeActivity, InvalidAnswerError, normaliseAnswer } from './grading.js';

const parse = (a: unknown) => activitySourceSchema.parse(a);

const mc = parse({
  id: 'mc',
  type: 'MULTIPLE_CHOICE',
  variant: 'CONCEPT',
  prompt: 'Which clause filters rows?',
  options: [
    { id: 'a', text: 'WHERE', correct: true, feedback: 'Right.' },
    { id: 'b', text: 'ORDER BY', feedback: 'ORDER BY sorts.' },
  ],
  explanation: 'WHERE filters rows.',
});
const gap = parse({
  id: 'gap',
  type: 'FILL_IN_THE_GAP',
  prompt: 'Complete.',
  hint: 'Think filters.',
  segments: [
    'SELECT * FROM t ',
    { gap: 'kw', label: 'keyword', accept: ['WHERE'] },
    ' x = 1 ',
    { gap: 'end', label: 'end', accept: [';'] },
  ],
  explanation: 'Use WHERE.',
});
const short = parse({
  id: 'short',
  type: 'SHORT_ANSWER',
  variant: 'EXPECTED_OUTPUT',
  prompt: 'Output?',
  accept: ['[20, 40]', '[20,40]'],
  commonMistakes: [{ answer: '[10, 30]', feedback: 'Those are the odd numbers.' }],
  explanation: 'filter then map.',
});
const checklist = parse({
  id: 'check',
  type: 'CHECKLIST',
  prompt: 'Check.',
  items: [
    { id: 'one', text: 'One' },
    { id: 'two', text: 'Two' },
  ],
});
const cards = parse({
  id: 'cards',
  type: 'REVISION_CARDS',
  prompt: 'Revise.',
  cards: [{ front: 'Q', back: 'A' }],
});

describe('normaliseAnswer', () => {
  it('ignores case, surrounding whitespace, a trailing semicolon and wrapping quotes', () => {
    expect(normaliseAnswer('  Where ;')).toBe('where');
    expect(normaliseAnswer("'1051'")).toBe('1051');
    expect(normaliseAnswer('A   D C\nB')).toBe('a d c b');
  });
});

describe('gradeActivity', () => {
  it('grades multiple choice with per-option feedback and the correct answer', () => {
    expect(gradeActivity(mc, { type: 'MULTIPLE_CHOICE', optionId: 'a' })).toMatchObject({
      graded: true,
      correct: true,
      score: 1,
      feedback: 'Right.',
    });
    expect(gradeActivity(mc, { type: 'MULTIPLE_CHOICE', optionId: 'b' })).toMatchObject({
      correct: false,
      score: 0,
      feedback: 'ORDER BY sorts.',
      correctAnswer: 'WHERE',
      explanation: 'WHERE filters rows.',
    });
  });

  it('scores fill-in-the-gap per gap and reports each gap', () => {
    const partial = gradeActivity(gap, { type: 'FILL_IN_THE_GAP', gaps: { kw: 'where' } });
    expect(partial).toMatchObject({ correct: false, score: 0.5 });
    expect(partial.feedback).toContain('1 of 2 gaps are correct. Hint: Think filters.');
    expect(partial.gapResults).toEqual([
      { gapId: 'kw', correct: true, expected: 'WHERE' },
      { gapId: 'end', correct: false, expected: ';' },
    ]);
    expect(
      gradeActivity(gap, { type: 'FILL_IN_THE_GAP', gaps: { kw: 'WHERE', end: ';' } }).correct,
    ).toBe(true);
  });

  it('accepts listed short answers and explains predictable mistakes', () => {
    expect(gradeActivity(short, { type: 'SHORT_ANSWER', text: '[20,40]' }).correct).toBe(true);
    expect(gradeActivity(short, { type: 'SHORT_ANSWER', text: '[10, 30]' })).toMatchObject({
      correct: false,
      feedback: 'Those are the odd numbers.',
      correctAnswer: '[20, 40]',
    });
    expect(gradeActivity(short, { type: 'SHORT_ANSWER', text: 'no idea' }).feedback).toMatch(
      /^Not quite/,
    );
  });

  it('records checklists as self-assessed, never graded', () => {
    expect(gradeActivity(checklist, { type: 'CHECKLIST', checkedItemIds: ['one'] })).toMatchObject({
      graded: false,
      correct: null,
      score: null,
    });
  });

  it('treats blank answers as not answered: nothing is graded', () => {
    expect(() => gradeActivity(short, { type: 'SHORT_ANSWER', text: '   ' })).toThrow(
      /Enter an answer/,
    );
    expect(() => gradeActivity(gap, { type: 'FILL_IN_THE_GAP', gaps: {} })).toThrow(
      /at least one gap/,
    );
    expect(() =>
      gradeActivity(gap, { type: 'FILL_IN_THE_GAP', gaps: { kw: ' ', end: '' } }),
    ).toThrow(/at least one gap/);
  });

  it('rejects answers that do not fit the activity', () => {
    expect(() => gradeActivity(mc, { type: 'SHORT_ANSWER', text: 'WHERE' })).toThrow(
      InvalidAnswerError,
    );
    expect(() => gradeActivity(mc, { type: 'MULTIPLE_CHOICE', optionId: 'z' })).toThrow(
      InvalidAnswerError,
    );
    expect(() => gradeActivity(gap, { type: 'FILL_IN_THE_GAP', gaps: { nope: 'x' } })).toThrow(
      InvalidAnswerError,
    );
    expect(() =>
      gradeActivity(checklist, { type: 'CHECKLIST', checkedItemIds: ['three'] }),
    ).toThrow(InvalidAnswerError);
    expect(() => gradeActivity(cards, { type: 'CHECKLIST', checkedItemIds: [] })).toThrow(
      /not submitted/,
    );
  });
});
