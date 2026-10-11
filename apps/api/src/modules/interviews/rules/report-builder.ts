import {
  INTERVIEW_CATEGORY_LABELS,
  type InterviewQuestionCategory,
  type InterviewTopicScore,
} from '@job-assist/shared';

export interface EvaluatedQuestion {
  category: InterviewQuestionCategory;
  expectedTopics: string[];
  /** 0–10, or null when unanswered. */
  score: number | null;
  strengths: string[];
  improvements: string[];
}

const GENERIC_TOPICS = new Set([
  'situation',
  'task',
  'action',
  'result',
  'approach',
  'concrete example',
  'trade-offs',
  'motivation',
  'your role',
  'challenge',
  'outcome',
  'relevant experience',
  'honest assessment',
  'learning plan',
  'result',
  'impact',
  'responsibilities',
  'current role',
  'communication',
  'reasoning',
  'priorities',
  'professional tone',
  'growth',
  'role fit',
  'company research',
  'flexibility',
  'range',
  'notice period',
  'start date',
  'work mode',
  'your approach',
]);

const pct = (values: number[]) =>
  Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10);

function mostCommon(lists: string[][], max: number): string[] {
  const counts = new Map<string, number>();
  for (const item of lists.flat()) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([k]) => k);
}

/**
 * The session report, computed only from stored evaluations: overall 0–100 (unanswered
 * questions count as 0), per-category and per-topic practice scores, and the most common
 * strengths and improvements.
 */
export function buildReport(questions: EvaluatedQuestion[]) {
  const answered = questions.filter((q) => q.score !== null);
  const all = questions.map((q) => q.score ?? 0);
  const byCategory = new Map<string, number[]>();
  for (const q of answered)
    byCategory.set(INTERVIEW_CATEGORY_LABELS[q.category], [
      ...(byCategory.get(INTERVIEW_CATEGORY_LABELS[q.category]) ?? []),
      q.score!,
    ]);
  const byTopic = new Map<string, number[]>();
  for (const q of answered) {
    for (const t of q.expectedTopics) {
      if (GENERIC_TOPICS.has(t.toLowerCase()) || t.startsWith('@')) continue;
      byTopic.set(t, [...(byTopic.get(t) ?? []), q.score!]);
    }
  }
  const scores = (m: Map<string, number[]>): InterviewTopicScore[] =>
    [...m.entries()]
      .map(([topic, v]) => ({ topic, score: pct(v), questions: v.length }))
      .sort((a, b) => b.questions - a.questions || a.topic.localeCompare(b.topic));
  const unanswered = questions.length - answered.length;
  const improvements = mostCommon(
    answered.map((q) => q.improvements),
    4,
  );
  if (unanswered > 0)
    improvements.unshift(
      `${unanswered} question${unanswered === 1 ? ' was' : 's were'} not answered.`,
    );
  return {
    overallScore: questions.length ? pct(all) : 0,
    answered: answered.length,
    total: questions.length,
    strengths: mostCommon(
      answered.map((q) => q.strengths),
      4,
    ),
    improvements,
    categories: scores(byCategory),
    topics: scores(byTopic).slice(0, 10),
  };
}
