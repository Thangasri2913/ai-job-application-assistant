import {
  countWords,
  type EvaluationDimension,
  type InterviewDifficulty,
  type InterviewQuestionCategory,
  type StarLevel,
} from '@job-assist/shared';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';

export interface DraftEvaluation {
  overallScore: number;
  dimensions: Record<EvaluationDimension, number | null>;
  strengths: string[];
  improvements: string[];
  star: { situation: StarLevel; task: StarLevel; action: StarLevel; result: StarLevel } | null;
  technical: {
    correctness: number;
    depth: number;
    tradeOffs: number;
    practicalExperience: number;
    clarity: number;
  } | null;
  feedback: string | null;
}

export interface EvaluationInput {
  question: string;
  category: InterviewQuestionCategory;
  difficulty: InterviewDifficulty;
  expectedTopics: string[];
  answer: string;
}

const TARGET_WORDS: Record<InterviewDifficulty, number> = { EASY: 50, MEDIUM: 80, HARD: 110 };
const FILLER =
  /\b(basically|stuff|things like that|many things|a lot of things|etc\.?|kind of|sort of|you know)\b/gi;
const STAR_CUES = {
  situation:
    /\b(when|while|during|at (my|our|the)|in (my|our) (last|previous|current)|we (had|were)|the project|our team|context)\b/i,
  task: /\b(i was (responsible|asked|tasked)|my (task|role|job|goal|responsibility)|i needed to|we needed to|the goal was|had to)\b/i,
  action:
    /\bi (built|implemented|designed|wrote|refactored|led|decided|created|set up|introduced|proposed|investigated|analy[sz]ed|fixed|worked|organized|talked|spoke|explained|reviewed|tested|migrated|optimi[sz]ed|added)\b/i,
  result:
    /\b(as a result|result(ed)?|outcome|so that|which (meant|led|helped|reduced|improved)|led to|improved|reduced|increased|delivered|shipped|launched|saved|fixed the|now)\b/i,
};
const CONCRETE =
  /\b(for example|for instance|specifically|in one case|at (?:[A-Z][\w&.-]+)|when i)\b/i;

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));
const level = (count: number): StarLevel =>
  count >= 2 ? 'STRONG' : count === 1 ? 'PRESENT' : 'MISSING';

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function topicCovered(topic: string, answer: string, answerSkillKeys: Set<string>): boolean {
  if (answerSkillKeys.has(skillKey(topic))) return true;
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9@/+# ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return false;
  const lower = answer.toLowerCase();
  return (
    words.filter((w) => lower.includes(w.replace(/s$/, ''))).length >= Math.ceil(words.length / 2)
  );
}

/**
 * Practice checks that need no AI: topic coverage, structure (STAR for behavioral questions),
 * specificity, clarity and completeness. Technical accuracy is not judged here.
 */
export function evaluateWithRules(input: EvaluationInput): DraftEvaluation {
  const { answer } = input;
  const words = countWords(answer);
  const sents = sentences(answer);
  const answerSkillKeys = new Set(detectSkills(answer).map(skillKey));
  const behavioral = input.category === 'BEHAVIORAL' || input.category === 'SITUATIONAL';
  const topics = behavioral ? [] : input.expectedTopics;

  const covered = topics.filter((t) => topicCovered(t, answer, answerSkillKeys));
  const missed = topics.filter((t) => !covered.includes(t));
  const relevance = topics.length ? 2 + (8 * covered.length) / topics.length : words >= 20 ? 7 : 4;

  const target = TARGET_WORDS[input.difficulty];
  const completeness = words === 0 ? 0 : Math.min(10, (10 * words) / target);

  const starHits = Object.fromEntries(
    (Object.keys(STAR_CUES) as (keyof typeof STAR_CUES)[]).map((k) => [
      k,
      sents.filter((s) => STAR_CUES[k].test(s)).length,
    ]),
  ) as Record<keyof typeof STAR_CUES, number>;
  const star = behavioral
    ? {
        situation: level(starHits.situation),
        task: level(starHits.task),
        action: level(starHits.action),
        result: level(starHits.result),
      }
    : null;
  const starScore = star ? Object.values(star).filter((v) => v !== 'MISSING').length * 2.5 : null;
  const paragraphs = answer.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const structure =
    starScore ??
    Math.min(
      10,
      4 +
        Math.min(sents.length, 6) +
        (paragraphs > 1 ? 1 : 0) -
        (sents.length <= 1 && words > 60 ? 3 : 0),
    );

  const fillers = answer.match(FILLER)?.length ?? 0;
  const concrete =
    (CONCRETE.test(answer) ? 3 : 0) +
    Math.min(4, answerSkillKeys.size * 2) +
    (starHits.action > 0 ? 2 : 0) +
    (/\d/.test(answer) ? 1 : 0);
  const specificity = Math.max(0, Math.min(10, 2 + concrete - fillers));

  const avgLen = sents.length ? words / sents.length : words;
  const clarity = Math.max(
    0,
    10 - (avgLen > 30 ? (avgLen - 30) / 3 : 0) - (avgLen < 5 && words > 0 ? 3 : 0) - fillers,
  );
  const communication = (clarity + structure) / 2;

  const dimensions: Record<EvaluationDimension, number | null> = {
    relevance: clamp(relevance),
    clarity: clamp(clarity),
    technicalAccuracy: null,
    structure: clamp(structure),
    specificity: clamp(specificity),
    communication: clamp(communication),
    completeness: clamp(completeness),
  };
  const scored = Object.values(dimensions).filter((v): v is number => v !== null);
  const overallScore = clamp(scored.reduce((a, b) => a + b, 0) / scored.length);

  const strengths: string[] = [];
  const improvements: string[] = [];
  if (covered.length) strengths.push(`Covers the expected topics: ${covered.join(', ')}`);
  if (missed.length)
    improvements.push(
      `Consider addressing: ${missed.join(', ')} — only where it reflects your real experience.`,
    );
  if (star) {
    const present = (Object.keys(star) as (keyof typeof star)[]).filter(
      (k) => star[k] !== 'MISSING',
    );
    if (present.length >= 3)
      strengths.push('Follows a clear situation–task–action–result structure');
    if (star.situation === 'MISSING')
      improvements.push('Set the scene: briefly describe the situation and your team.');
    if (star.action === 'MISSING')
      improvements.push('Describe what you personally did (“I …”), not only what the team did.');
    if (star.result === 'MISSING')
      improvements.push(
        'Explain the observable result of your action, if you have a genuine result to share.',
      );
  }
  if (completeness < 5)
    improvements.push(
      `Develop the answer further (about ${target} words is typical for this question; yours has ${words}).`,
    );
  if (words > 400)
    improvements.push('Keep it tighter — long answers lose the interviewer’s attention.');
  if (fillers > 0)
    improvements.push(
      'Avoid vague phrases (e.g. “many things”, “stuff”). Describe one specific problem, your responsibility, the approach you took and the result.',
    );
  if (specificity >= 7) strengths.push('Uses concrete, specific detail');
  if (clarity >= 8 && words >= 20) strengths.push('Clear, readable sentences');
  if (avgLen > 30) improvements.push('Break long sentences into shorter ones.');

  return {
    overallScore,
    dimensions,
    strengths,
    improvements,
    star,
    technical: null,
    feedback: null,
  };
}
