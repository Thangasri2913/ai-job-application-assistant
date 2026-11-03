import { MENTOR_INTENT_LABELS, type MentorIntent } from '@job-assist/shared';

/**
 * Fixed, application-written wording for AI-assisted answers. Nothing here comes from the model:
 * it depends only on the intent and on how many verified suggestions were chosen. It describes
 * the selection, never the learner — no statement about progress, completion, skill level,
 * readiness or outcomes.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One general, fact-free tip per intent. */
const INTENT_TIPS: Record<MentorIntent, string> = {
  GENERAL_PROGRESS: 'Each suggestion links to the place in JobAssist where you can work on it.',
  SKILL_GAPS: 'A diagnostic measures a skill; a course or lesson helps you practise it.',
  LEARNING_PLAN: 'Your saved learning plan and target role are not changed by this order.',
  INTERVIEW_PREP: 'Practise one question at a time in Interview practice.',
  PROJECT_IDEAS: 'Projects are self-paced; take on one at a time.',
  JOB_FIT:
    'This compares your records with the job’s requirements; it is not a score or a prediction.',
};

export function selectionExplanation(intent: MentorIntent, chosen: number, found: number): string {
  const topic = `“${MENTOR_INTENT_LABELS[intent]}”`;
  const selection =
    found === 0
      ? `JobAssist found no suggestions for ${topic} yet, so there was nothing for the AI to order.`
      : chosen === found
        ? `The AI put the ${plural(found, 'suggestion')} JobAssist found for ${topic} in this order.`
        : `The AI chose ${chosen} of the ${plural(found, 'suggestion')} JobAssist found for ${topic} and put them in this order.`;
  return `${selection} Every suggestion, reason and link comes from your JobAssist records. ${INTENT_TIPS[intent]}`;
}

/** A fixed next question per intent (the user decides whether to use it). */
export const FOLLOW_UP_QUESTIONS: Record<MentorIntent, string> = {
  GENERAL_PROGRESS: 'Which skills should I work on next?',
  SKILL_GAPS: 'Which course should I start with for these skills?',
  LEARNING_PLAN: 'How can I practise these skills for interviews?',
  INTERVIEW_PREP: 'Which project could help me practise these skills?',
  PROJECT_IDEAS: 'How do my skills compare with a job I analysed?',
  JOB_FIT: 'What should I learn first for this job?',
};
