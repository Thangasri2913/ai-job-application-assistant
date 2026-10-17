import type { AnswerSensitivity, ProfileDetails, QuestionType } from '@job-assist/shared';

/**
 * Rules for reusing answers (ADR-0020). Only answers the user provided or explicitly
 * confirmed are ever used, and only when they fit the question:
 * - a saved answer is reused for the same question (same type key, or the same wording);
 * - STANDARD saved answers are reused as confirmed; SENSITIVE ones are only pre-filled and
 *   must be confirmed for each application; DEMOGRAPHIC answers are never saved or reused;
 * - profile facts (notice period, salary, work authorisation) are only pre-filled;
 * - nothing is ever guessed: no saved answer and no profile fact means the user is asked.
 */

const LEGAL =
  /\b(convict(ed|ion)s?|criminal|felony|background check|certif(y|ies)|attest|declar(e|ation)|acknowledge|agree to|truthful|true and (accurate|complete)|non-?compete|drug (test|screen))\b/i;
const DEMOGRAPHIC =
  /\b(gender|sex|race|racial|ethnic\w*|veteran|disabilit\w*|sexual orientation|pronouns?|date of birth|religio\w*|marital|age)\b/i;

export function sensitivityOf(question: string, type: QuestionType): AnswerSensitivity {
  if (DEMOGRAPHIC.test(question)) return 'DEMOGRAPHIC';
  if (type === 'WORK_AUTHORIZATION' || type === 'SALARY' || LEGAL.test(question))
    return 'SENSITIVE';
  return 'STANDARD';
}

const normalise = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

/**
 * The key a reusable answer is stored under; null when an answer must never be reused
 * (motivation is job-specific; demographic data is never kept).
 */
export function answerKeyOf(
  question: string,
  type: QuestionType,
  sensitivity: AnswerSensitivity,
): string | null {
  if (sensitivity === 'DEMOGRAPHIC' || type === 'MOTIVATION') return null;
  // These mean the same thing whatever the wording.
  if (type === 'NOTICE_PERIOD' || type === 'SALARY') return type;
  // Work authorisation, location and everything else depend on the exact question
  // ("Do you need sponsorship?" ≠ "Are you authorised to work in the UK?").
  const text = normalise(question);
  return text ? `q:${text}` : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a confirmed answer stays reusable before it must be confirmed again. */
export function validUntil(type: QuestionType, confirmedAt: Date): Date {
  const days = type === 'SALARY' || type === 'NOTICE_PERIOD' ? 90 : 365;
  return new Date(confirmedAt.getTime() + days * DAY_MS);
}

export interface SavedAnswer {
  id: string;
  answerKey: string;
  answer: string;
  validUntil: Date | null;
}

export interface QuestionToResolve {
  question: string;
  questionType: QuestionType;
  sensitivity: AnswerSensitivity;
  options: string[];
}

export interface Resolution {
  answer: string;
  prefilledFrom: 'SAVED_ANSWER' | 'PROFILE';
  /** Reused as confirmed (STANDARD saved answers only). */
  confirmed: boolean;
  profileAnswerId: string | null;
}

const fitsOptions = (answer: string, options: string[]) =>
  options.length === 0 || options.includes(answer);

/** The answer to offer for a question, or null when the user has to be asked. */
export function resolveAnswer(
  q: QuestionToResolve,
  saved: Map<string, SavedAnswer>,
  profile: Pick<
    ProfileDetails,
    'noticePeriod' | 'workAuthorization' | 'salaryMin' | 'salaryMax' | 'salaryCurrency'
  > | null,
  now: Date,
): Resolution | null {
  if (q.sensitivity === 'DEMOGRAPHIC') return null;
  const key = answerKeyOf(q.question, q.questionType, q.sensitivity);
  const hit = key ? saved.get(key) : undefined;
  if (hit && (!hit.validUntil || hit.validUntil > now) && fitsOptions(hit.answer, q.options)) {
    return {
      answer: hit.answer,
      prefilledFrom: 'SAVED_ANSWER',
      confirmed: q.sensitivity === 'STANDARD',
      profileAnswerId: hit.id,
    };
  }
  if (!profile || q.options.length > 0) return null;
  const fact = profileFact(q.questionType, profile);
  return fact
    ? { answer: fact, prefilledFrom: 'PROFILE', confirmed: false, profileAnswerId: null }
    : null;
}

function profileFact(
  type: QuestionType,
  d: Pick<
    ProfileDetails,
    'noticePeriod' | 'workAuthorization' | 'salaryMin' | 'salaryMax' | 'salaryCurrency'
  >,
): string | null {
  switch (type) {
    case 'NOTICE_PERIOD':
      return d.noticePeriod?.trim() || null;
    case 'WORK_AUTHORIZATION':
      return d.workAuthorization?.trim() || null;
    case 'SALARY': {
      if (d.salaryMin === null && d.salaryMax === null) return null;
      const cur = d.salaryCurrency ? `${d.salaryCurrency} ` : '';
      return d.salaryMin !== null && d.salaryMax !== null
        ? `${cur}${d.salaryMin}–${d.salaryMax}`
        : `${cur}${d.salaryMin ?? d.salaryMax}`;
    }
    default:
      return null;
  }
}

/** Why the app needs this answer — shown to the user; never a guess at the answer itself. */
export function reasonFor(q: {
  required: boolean;
  origin: string | null;
  sensitivity: AnswerSensitivity;
  questionType: QuestionType;
}): string {
  const source = q.origin ? `the ${q.origin}` : 'your list of questions for this application';
  const base = q.required
    ? `This question is required by ${source}.`
    : `This question is optional in ${source}.`;
  if (q.sensitivity === 'DEMOGRAPHIC')
    return `${base} Answering is voluntary; your answer is used only for this application and never saved for reuse.`;
  if (q.questionType === 'WORK_AUTHORIZATION')
    return `${base} Work authorisation is a legal statement, so please confirm it for this application.`;
  if (q.sensitivity === 'SENSITIVE')
    return `${base} This is a consequential answer, so it needs your confirmation for each application.`;
  return `${base} Only you can provide this — the app never guesses answers.`;
}
