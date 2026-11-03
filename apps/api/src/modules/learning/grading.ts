import type { ActivityAnswer } from '@job-assist/shared';
import type { ParsedActivity } from './catalogue/content.js';

/** Outcome of grading one answer (before it is stored). */
export interface Grade {
  graded: boolean;
  correct: boolean | null;
  score: number | null;
  feedback: string;
  explanation: string;
  correctAnswer: string | null;
  gapResults: { gapId: string; correct: boolean; expected: string }[] | null;
}

/** The answer does not fit the activity (wrong type, unknown option…). Reported as 400. */
export class InvalidAnswerError extends Error {}

/**
 * Comparison form of a typed answer: trimmed, whitespace collapsed, case-insensitive, without
 * one pair of wrapping quotes or a trailing semicolon. Strict enough to be fair, lenient about
 * formatting.
 */
export function normaliseAnswer(value: string): string {
  let v = value.trim().replace(/\s+/g, ' ').toLowerCase();
  v = v.replace(/;$/, '').trim();
  const quoted = /^(['"`])(.*)\1$/.exec(v);
  if (quoted) v = quoted[2]!.trim();
  return v;
}

/** A blank answer never matches, even if an accepted answer normalises to nothing (";"). */
const matches = (answer: string, accepted: string[]) => {
  const given = normaliseAnswer(answer);
  return (
    answer.trim() !== '' &&
    accepted.some((a) => a.trim() === answer.trim() || normaliseAnswer(a) === given)
  );
};

/** Grades an answer deterministically. Nothing is executed: answers are compared as text. */
export function gradeActivity(activity: ParsedActivity, answer: ActivityAnswer): Grade {
  if (activity.type === 'REFLECTION' || activity.type === 'REVISION_CARDS')
    throw new InvalidAnswerError('This activity is done on your own and is not submitted.');
  if (answer.type !== activity.type)
    throw new InvalidAnswerError(`This activity expects a ${activity.type} answer.`);

  switch (activity.type) {
    case 'MULTIPLE_CHOICE': {
      const { optionId } = answer as Extract<ActivityAnswer, { type: 'MULTIPLE_CHOICE' }>;
      const chosen = activity.options.find((o) => o.id === optionId);
      if (!chosen) throw new InvalidAnswerError('Choose one of the listed options.');
      const right = activity.options.find((o) => o.correct)!;
      const correct = chosen.id === right.id;
      return {
        graded: true,
        correct,
        score: correct ? 1 : 0,
        feedback: chosen.feedback,
        explanation: activity.explanation,
        correctAnswer: right.text,
        gapResults: null,
      };
    }
    case 'FILL_IN_THE_GAP': {
      const { gaps } = answer as Extract<ActivityAnswer, { type: 'FILL_IN_THE_GAP' }>;
      const defined = activity.segments.flatMap((s) => (typeof s === 'string' ? [] : [s]));
      const known = new Set(defined.map((g) => g.gap));
      const unknown = Object.keys(gaps).filter((id) => !known.has(id));
      if (unknown.length)
        throw new InvalidAnswerError('The answer refers to gaps that do not exist.');
      if (!defined.some((g) => (gaps[g.gap] ?? '').trim()))
        throw new InvalidAnswerError('Fill in at least one gap before checking.');
      const gapResults = defined.map((g) => ({
        gapId: g.gap,
        correct: matches(gaps[g.gap] ?? '', g.accept),
        expected: g.accept[0]!,
      }));
      const right = gapResults.filter((g) => g.correct).length;
      const correct = right === gapResults.length;
      return {
        graded: true,
        correct,
        score: right / gapResults.length,
        feedback: correct
          ? 'Correct.'
          : `${right} of ${gapResults.length} ${gapResults.length === 1 ? 'gap is' : 'gaps are'} correct.${activity.hint ? ` Hint: ${activity.hint}` : ''}`,
        explanation: activity.explanation,
        correctAnswer: activity.segments
          .map((s) => (typeof s === 'string' ? s : s.accept[0]))
          .join(''),
        gapResults,
      };
    }
    case 'SHORT_ANSWER': {
      const { text } = answer as Extract<ActivityAnswer, { type: 'SHORT_ANSWER' }>;
      // A blank answer is not an attempt: nothing is graded or stored.
      if (!text.trim()) throw new InvalidAnswerError('Enter an answer before checking it.');
      const correct = matches(text, activity.accept);
      const mistake = correct
        ? undefined
        : activity.commonMistakes.find((m) => normaliseAnswer(m.answer) === normaliseAnswer(text));
      return {
        graded: true,
        correct,
        score: correct ? 1 : 0,
        feedback: correct
          ? 'Correct.'
          : (mistake?.feedback ??
            `Not quite.${activity.hint ? ` Hint: ${activity.hint}` : ' Compare your answer with the explanation.'}`),
        explanation: activity.explanation,
        correctAnswer: activity.accept[0]!,
        gapResults: null,
      };
    }
    case 'CHECKLIST': {
      const { checkedItemIds } = answer as Extract<ActivityAnswer, { type: 'CHECKLIST' }>;
      const known = new Set(activity.items.map((i) => i.id));
      if (checkedItemIds.some((id) => !known.has(id)))
        throw new InvalidAnswerError('The answer refers to checklist items that do not exist.');
      const checked = new Set(checkedItemIds).size;
      return {
        graded: false,
        correct: null,
        score: null,
        feedback: `You checked ${checked} of ${activity.items.length} items. This is self-assessed and not graded.`,
        explanation: activity.explanation ?? '',
        correctAnswer: null,
        gapResults: null,
      };
    }
  }
}
