import type { InterviewDifficulty, LearningDifficulty } from '@job-assist/shared';
import { evaluateWithRules } from '../../interviews/rules/answer-evaluator.js';
import type { InterviewQuestionSource } from '../catalogue/interview-questions.js';

export const INTERVIEW_RUBRIC_VERSION = 'learning-interview-rubric-1';

const TO_INTERVIEW_DIFFICULTY: Record<LearningDifficulty, InterviewDifficulty> = {
  BEGINNER: 'EASY',
  INTERMEDIATE: 'MEDIUM',
  ADVANCED: 'HARD',
};

/** Typical answer length used by the shared interview rules (EASY 50, MEDIUM 80, HARD 110). */
export const TARGET_WORDS: Record<LearningDifficulty, number> = {
  BEGINNER: 50,
  INTERMEDIATE: 80,
  ADVANCED: 110,
};

export const PRACTICE_DISCLAIMER =
  'Practice feedback from a keyword-based rubric. It can miss correct points you phrased differently, cannot confirm that everything you wrote is accurate, and does not predict how a real interview will go.';

export interface InterviewEvaluation {
  correctness: { score: number; summary: string };
  clarity: { score: number; summary: string };
  completeness: { score: number; summary: string };
  coveredConceptIds: string[];
  missingConceptIds: string[];
  strengths: string[];
  improvements: string[];
  rubricVersion: string;
}

const round = (n: number) => Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;

/** True when any of the concept's patterns occurs in the answer. */
export function mentions(answer: string, patterns: string[]): boolean {
  return patterns.some((p) => new RegExp(p, 'i').test(answer));
}

/**
 * Deterministic practice feedback: key-concept coverage from the question's rubric, plus the
 * interview module's rule checks for clarity, structure and length (reused, not duplicated).
 * Nothing is sent to an AI provider.
 */
export function evaluateInterviewAnswer(
  question: InterviewQuestionSource,
  answer: string,
): InterviewEvaluation {
  const covered = question.concepts.filter((c) => mentions(answer, c.patterns));
  const missing = question.concepts.filter((c) => !covered.includes(c));
  const rules = evaluateWithRules({
    question: question.prompt,
    category: 'TECHNICAL',
    difficulty: TO_INTERVIEW_DIFFICULTY[question.difficulty],
    expectedTopics: [],
    answer,
  });

  const total = question.concepts.length;
  const correctness = round((10 * covered.length) / total);
  const clarity = round(((rules.dimensions.clarity ?? 0) + (rules.dimensions.structure ?? 0)) / 2);
  const completeness = round(rules.dimensions.completeness ?? 0);
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const target = TARGET_WORDS[question.difficulty];

  const strengths = [
    ...(covered.length
      ? [`Mentions: ${covered.map((c) => c.label.toLowerCase()).join('; ')}.`]
      : []),
    ...rules.strengths.filter((s) => !s.startsWith('Covers the expected topics')),
  ];
  const improvements = [
    ...missing.map((c) => `Consider explaining: ${c.label.toLowerCase()}.`),
    ...rules.improvements.filter((s) => !s.startsWith('Consider addressing')),
  ];

  return {
    correctness: {
      score: correctness,
      summary: `Mentions ${covered.length} of ${total} key concepts the rubric looks for.`,
    },
    clarity: {
      score: clarity,
      summary:
        clarity >= 8
          ? 'Clear, well-structured sentences.'
          : clarity >= 5
            ? 'Mostly clear; shorter sentences and a clearer order would help.'
            : 'Hard to follow; use short sentences and one idea per sentence.',
    },
    completeness: {
      score: completeness,
      summary: `About ${words} word${words === 1 ? '' : 's'}; around ${target} is typical for this question.`,
    },
    coveredConceptIds: covered.map((c) => c.id),
    missingConceptIds: missing.map((c) => c.id),
    strengths,
    improvements,
    rubricVersion: INTERVIEW_RUBRIC_VERSION,
  };
}
