import type { MatchLevel } from './jobs.js';
import type { ResumeContent } from './resumes.js';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * NOT_STARTED: nothing generated. READY: materials exist, some still need review.
 * REVIEWED: everything decided/approved, preparation not yet approved. APPROVED: the user
 * explicitly approved the preparation as application-ready.
 */
export const PREPARATION_STATUSES = ['NOT_STARTED', 'READY', 'REVIEWED', 'APPROVED'] as const;
export type PreparationStatus = (typeof PREPARATION_STATUSES)[number];

/** Who produced a piece of content. */
export const GENERATION_SOURCES = ['AI', 'RULES', 'TEMPLATE', 'MANUAL'] as const;
export type GenerationSource = (typeof GENERATION_SOURCES)[number];

export const GENERATION_SOURCE_LABELS: Record<GenerationSource, string> = {
  AI: 'AI generated',
  RULES: 'From your match analysis',
  TEMPLATE: 'Draft from your verified data',
  MANUAL: 'Written by you',
};

/**
 * REWRITE: reword an existing line (AI only; never adds facts). REORDER: move existing
 * content higher. EMPHASIZE: relevant content is buried. GAP: the job asks for something
 * not found; informational only.
 */
export const SUGGESTION_KINDS = ['REWRITE', 'REORDER', 'EMPHASIZE', 'GAP'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const SUGGESTION_SECTIONS = [
  'SUMMARY',
  'EXPERIENCE',
  'PROJECT',
  'SKILLS',
  'EDUCATION',
  'CERTIFICATIONS',
] as const;
export type SuggestionSection = (typeof SUGGESTION_SECTIONS)[number];

export const SUGGESTION_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'EDITED'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const COVER_LETTER_STATUSES = ['GENERATED', 'EDITED', 'APPROVED'] as const;
export type CoverLetterStatus = (typeof COVER_LETTER_STATUSES)[number];

export const QUESTION_STATUSES = ['PENDING', 'GENERATED', 'EDITED', 'APPROVED'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const QUESTION_TYPES = [
  'MOTIVATION',
  'EXPERIENCE',
  'SALARY',
  'NOTICE_PERIOD',
  'WORK_AUTHORIZATION',
  'LOCATION',
  'OTHER',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MOTIVATION: 'Motivation',
  EXPERIENCE: 'Experience',
  SALARY: 'Salary',
  NOTICE_PERIOD: 'Notice period / availability',
  WORK_AUTHORIZATION: 'Work authorization',
  LOCATION: 'Location / work mode',
  OTHER: 'Other',
};

export const QUESTION_MAX_LENGTH = 2000;
export const ANSWER_MAX_LENGTH = 10_000;
export const COVER_LETTER_MAX_LENGTH = 10_000;
export const SUGGESTION_TEXT_MAX_LENGTH = 2000;

/** Shown when an answer can't be written from verified data. */
export const INSUFFICIENT_INFORMATION_ANSWER =
  'I don’t have enough verified information to answer this accurately. Please provide additional information.';

// ─── Word / character limits (shared by API and UI) ─────────────────────────

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

/** Characters as the user sees them (code points, not UTF-16 units). */
export function countCharacters(text: string): number {
  return [...text].length;
}

export interface AnswerLimits {
  maxWords: number | null;
  maxCharacters: number | null;
}

/**
 * Reads limits stated in a question, e.g. "Maximum 200 words", "(max 500 characters)",
 * "in under 150 words", "up to 1,000 chars".
 */
export function parseAnswerLimits(question: string): AnswerLimits {
  const number = String.raw`(\d{1,3}(?:,\d{3})*|\d+)`;
  const lead = String.raw`(?:max(?:imum)?\.?|up to|no more than|not more than|less than|under|within|limit(?:ed)? to|at most)\s*(?:of\s*)?`;
  const words = new RegExp(
    String.raw`${lead}${number}\s*words?|${number}\s*words?\s*(?:max(?:imum)?|or less|or fewer|limit)`,
    'i',
  ).exec(question);
  const chars = new RegExp(
    String.raw`${lead}${number}\s*(?:characters?|chars?)|${number}\s*(?:characters?|chars?)\s*(?:max(?:imum)?|or less|or fewer|limit)`,
    'i',
  ).exec(question);
  const toNumber = (m: RegExpExecArray | null) => {
    const raw = m?.slice(1).find((g) => g !== undefined);
    return raw ? Number(raw.replace(/,/g, '')) : null;
  };
  return { maxWords: toNumber(words), maxCharacters: toNumber(chars) };
}

export interface LimitCheck {
  words: number;
  characters: number;
  withinLimits: boolean;
  overBy: { words: number; characters: number };
}

export function checkLimits(text: string, limits: AnswerLimits): LimitCheck {
  const words = countWords(text);
  const characters = countCharacters(text);
  const overWords = limits.maxWords !== null ? Math.max(0, words - limits.maxWords) : 0;
  const overChars =
    limits.maxCharacters !== null ? Math.max(0, characters - limits.maxCharacters) : 0;
  return {
    words,
    characters,
    withinLimits: overWords === 0 && overChars === 0,
    overBy: { words: overWords, characters: overChars },
  };
}

/**
 * Shortens text to fit the limits, preferring a sentence boundary, then a word boundary.
 * Returns the input unchanged when it already fits.
 */
export function fitToLimits(text: string, limits: AnswerLimits): string {
  if (checkLimits(text, limits).withinLimits) return text;
  let result = text.trim();
  if (limits.maxWords !== null) result = result.split(/\s+/u).slice(0, limits.maxWords).join(' ');
  if (limits.maxCharacters !== null && countCharacters(result) > limits.maxCharacters) {
    result = [...result].slice(0, limits.maxCharacters).join('');
    const lastSpace = result.lastIndexOf(' ');
    if (lastSpace > 0 && countCharacters(text) > limits.maxCharacters)
      result = result.slice(0, lastSpace);
  }
  const sentenceEnd = Math.max(
    result.lastIndexOf('. '),
    result.lastIndexOf('.\n'),
    result.endsWith('.') ? result.length - 1 : -1,
  );
  if (sentenceEnd > result.length * 0.5) result = result.slice(0, sentenceEnd + 1);
  return result.trim();
}

// ─── Requests ────────────────────────────────────────────────────────────────

export interface SuggestionDecisionRequest {
  action: 'ACCEPT' | 'REJECT' | 'EDIT' | 'RESET';
  /** Required for EDIT: the user's own wording. */
  text?: string;
}

export interface UpdateCoverLetterRequest {
  text: string;
}

export interface CreateQuestionRequest {
  question: string;
  /** Override limits detected in the question text. */
  maxWords?: number | null;
  maxCharacters?: number | null;
}

export interface UpdateQuestionRequest {
  userAnswer?: string | null;
  maxWords?: number | null;
  maxCharacters?: number | null;
}

// ─── Responses ───────────────────────────────────────────────────────────────

export interface ResumeSuggestionItem {
  id: string;
  kind: SuggestionKind;
  section: SuggestionSection;
  /** Existing resume text the suggestion is about (verbatim), when applicable. */
  originalText: string | null;
  suggestedText: string | null;
  /** The user's edited wording (status EDITED). */
  userText: string | null;
  reason: string;
  jobRequirement: string | null;
  confidence: number | null;
  source: GenerationSource;
  status: SuggestionStatus;
  decidedAt: string | null;
  createdAt: string;
}

export interface ResumeSuggestionsResponse {
  suggestions: ResumeSuggestionItem[];
  /** How the latest batch was produced, e.g. why AI wasn't used. */
  note: string | null;
  generatedAt: string | null;
}

/** The source resume content with the user's accepted/edited suggestions applied. Never saved over the original. */
export interface TailoredResumeDraft {
  applicationId: string;
  jobId: string;
  sourceResumeVersionId: string;
  sourceResumeName: string;
  sourceVersionNumber: number;
  content: ResumeContent;
  appliedSuggestionIds: string[];
}

export interface CoverLetterVersionItem {
  id: string;
  versionNumber: number;
  source: GenerationSource;
  /** What was generated (kept for audit); `text` is the current, possibly edited, letter. */
  generatedText: string;
  text: string;
  status: CoverLetterStatus;
  /** E.g. requirements the letter deliberately does not claim, or why AI wasn't used. */
  note: string | null;
  notClaimed: string[];
  approvedAt: string | null;
  /** The application document created on approval (DOCX). */
  documentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoverLetterResponse {
  latest: CoverLetterVersionItem | null;
  versions: CoverLetterVersionItem[];
}

export interface ApplicationQuestionItem {
  id: string;
  question: string;
  questionType: QuestionType;
  maxWords: number | null;
  maxCharacters: number | null;
  suggestedAnswer: string | null;
  answerSource: GenerationSource | null;
  /** The suggestion could not be written from verified data. */
  insufficientInformation: boolean;
  missingInformation: string[];
  assumptions: string[];
  /** Notes about the suggestion, e.g. "shortened to fit the limit". */
  note: string | null;
  /** The user's final answer — stored separately from the suggestion. */
  userAnswer: string | null;
  status: QuestionStatus;
  approvedAt: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationPreparationDetail {
  id: string;
  applicationId: string;
  status: PreparationStatus;
  approvedAt: string | null;
  /** True when an AI provider is configured on the server. */
  aiEnabled: boolean;
  /** A generation is running for this preparation (others are refused until it ends). */
  busyOperation: string | null;
  job: { id: string; title: string; companyName: string };
  resume: { resumeId: string; resumeName: string; resumeVersionId: string; versionNumber: number };
  match: { score: number; level: MatchLevel; strengths: string[]; gaps: string[] } | null;
  suggestions: {
    total: number;
    pending: number;
    accepted: number;
    edited: number;
    rejected: number;
  };
  coverLetter: {
    versionNumber: number;
    status: CoverLetterStatus;
    source: GenerationSource;
  } | null;
  questions: { total: number; approved: number };
  /** What still needs the user's review before the preparation can be approved. */
  blockers: string[];
  createdAt: string;
  updatedAt: string;
}
