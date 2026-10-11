import type { GenerationSource } from './preparation.js';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/** PREPARATION/TECHNICAL/BEHAVIORAL/HR are practice sessions (feedback per answer); MOCK_INTERVIEW defers feedback to the end. */
export const INTERVIEW_SESSION_TYPES = [
  'PREPARATION',
  'MOCK_INTERVIEW',
  'TECHNICAL',
  'BEHAVIORAL',
  'HR',
] as const;
export type InterviewSessionType = (typeof INTERVIEW_SESSION_TYPES)[number];

export const INTERVIEW_SESSION_TYPE_LABELS: Record<InterviewSessionType, string> = {
  PREPARATION: 'Mixed practice',
  MOCK_INTERVIEW: 'Mock interview',
  TECHNICAL: 'Technical practice',
  BEHAVIORAL: 'Behavioral practice',
  HR: 'HR practice',
};

export const INTERVIEW_STATUSES = ['CREATED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

/** The mix of questions in a session. */
export const INTERVIEW_FOCUSES = ['MIXED', 'TECHNICAL', 'BEHAVIORAL', 'HR'] as const;
export type InterviewFocus = (typeof INTERVIEW_FOCUSES)[number];

export const INTERVIEW_FOCUS_LABELS: Record<InterviewFocus, string> = {
  MIXED: 'Mixed',
  TECHNICAL: 'Technical',
  BEHAVIORAL: 'Behavioral',
  HR: 'HR',
};

export const INTERVIEW_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type InterviewDifficulty = (typeof INTERVIEW_DIFFICULTIES)[number];

export const INTERVIEW_QUESTION_COUNTS = [5, 10, 15] as const;
export type InterviewQuestionCount = (typeof INTERVIEW_QUESTION_COUNTS)[number];

export const INTERVIEW_QUESTION_CATEGORIES = [
  'INTRODUCTION',
  'RESUME',
  'TECHNICAL',
  'PROJECT',
  'BEHAVIORAL',
  'SITUATIONAL',
  'COMPANY',
  'ROLE_SPECIFIC',
  'HR',
] as const;
export type InterviewQuestionCategory = (typeof INTERVIEW_QUESTION_CATEGORIES)[number];

export const INTERVIEW_CATEGORY_LABELS: Record<InterviewQuestionCategory, string> = {
  INTRODUCTION: 'Introduction',
  RESUME: 'Resume',
  TECHNICAL: 'Technical',
  PROJECT: 'Project',
  BEHAVIORAL: 'Behavioral',
  SITUATIONAL: 'Situational',
  COMPANY: 'Company',
  ROLE_SPECIFIC: 'Role-specific',
  HR: 'HR',
};

export const EVALUATION_DIMENSIONS = [
  'relevance',
  'clarity',
  'technicalAccuracy',
  'structure',
  'specificity',
  'communication',
  'completeness',
] as const;
export type EvaluationDimension = (typeof EVALUATION_DIMENSIONS)[number];

export const EVALUATION_DIMENSION_LABELS: Record<EvaluationDimension, string> = {
  relevance: 'Relevance',
  clarity: 'Clarity',
  technicalAccuracy: 'Technical accuracy',
  structure: 'Structure',
  specificity: 'Specificity',
  communication: 'Communication',
  completeness: 'Completeness',
};

export const STAR_LEVELS = ['STRONG', 'PRESENT', 'WEAK', 'MISSING'] as const;
export type StarLevel = (typeof STAR_LEVELS)[number];

/** Practice feedback is never presented as a measurement. */
export const INTERVIEW_FEEDBACK_LABEL = 'AI-generated practice feedback';
export const RULES_FEEDBACK_LABEL = 'Rule-based practice feedback';

export const INTERVIEW_ANSWER_MAX_LENGTH = 10_000;

// ─── Requests ────────────────────────────────────────────────────────────────

export interface CreateInterviewRequest {
  type: InterviewSessionType;
  /** Question mix; defaults from the type (MIXED for preparation and mock). */
  focus?: InterviewFocus;
  difficulty?: InterviewDifficulty;
  questionCount?: InterviewQuestionCount;
}

export interface SubmitAnswerRequest {
  answer: string;
}

// ─── Responses ───────────────────────────────────────────────────────────────

export interface InterviewEvaluationItem {
  id: string;
  source: GenerationSource;
  /** 0–10. */
  overallScore: number;
  /** 0–10 per dimension; null when not assessed (e.g. technical accuracy without AI). */
  dimensions: Record<EvaluationDimension, number | null>;
  strengths: string[];
  improvements: string[];
  /** Behavioral questions only. */
  star: { situation: StarLevel; task: StarLevel; action: StarLevel; result: StarLevel } | null;
  /** Technical questions only, when assessed by AI. */
  technical: {
    correctness: number;
    depth: number;
    tradeOffs: number;
    practicalExperience: number;
    clarity: number;
  } | null;
  feedback: string | null;
  /** E.g. why AI wasn't used. */
  note: string | null;
  createdAt: string;
}

export interface InterviewAnswerItem {
  id: string;
  attempt: number;
  /** Exactly as submitted; never changed. */
  answer: string;
  createdAt: string;
  /** Hidden (null) in a mock interview until it is completed. */
  evaluation: InterviewEvaluationItem | null;
}

export interface InterviewQuestionItem {
  id: string;
  order: number;
  question: string;
  category: InterviewQuestionCategory;
  difficulty: InterviewDifficulty;
  expectedTopics: string[];
  /** Why this question was chosen (e.g. "The role requires AWS; not found in your resume"). */
  rationale: string | null;
  source: GenerationSource;
  answers: InterviewAnswerItem[];
}

export interface InterviewSessionSummary {
  id: string;
  applicationId: string;
  type: InterviewSessionType;
  focus: InterviewFocus;
  difficulty: InterviewDifficulty;
  questionCount: number;
  status: InterviewStatus;
  job: { id: string; title: string; companyName: string };
  resume: { resumeId: string; resumeName: string; resumeVersionId: string; versionNumber: number };
  /** 0–100, once a report exists. */
  overallScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewSessionDetail extends InterviewSessionSummary {
  isMock: boolean;
  /** Index of the next question to answer in a mock interview. */
  currentIndex: number;
  questions: InterviewQuestionItem[];
  questionsSource: GenerationSource | null;
  questionsNote: string | null;
  busyOperation: string | null;
  aiEnabled: boolean;
  hasReport: boolean;
}

export interface InterviewTopicScore {
  topic: string;
  /** 0–100 practice score, not a measurement. */
  score: number;
  questions: number;
}

export interface InterviewReport {
  sessionId: string;
  /** 0–100. */
  overallScore: number;
  label: string;
  source: GenerationSource;
  answered: number;
  total: number;
  strengths: string[];
  improvements: string[];
  categories: InterviewTopicScore[];
  topics: InterviewTopicScore[];
  /** Optional narrative written by AI (grounded); null without AI. */
  summary: string | null;
  generatedAt: string;
}

/** What the interview will focus on, derived from the job analysis and match. */
export interface InterviewFocusAreas {
  applicationId: string;
  job: { id: string; title: string; companyName: string };
  resume: { resumeId: string; resumeName: string; resumeVersionId: string; versionNumber: number };
  match: { score: number; level: import('./jobs.js').MatchLevel } | null;
  /** Strong areas to prepare to talk about (verified in your resume). */
  strengths: string[];
  /** Requirements with weaker or missing evidence: expect questions on these. */
  gaps: string[];
  responsibilities: string[];
  aiEnabled: boolean;
}
