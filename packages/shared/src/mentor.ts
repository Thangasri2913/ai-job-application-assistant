// ─── Career Mentor (docs/AI-CAREER-MENTOR-ARCHITECTURE.md) ──────────────────────────────
//
// Stateless, read-only answers from the user's own JobAssist data, produced by the
// @job-assist/career-mentor-agent package. The rule-based answer is always built first; when
// AI is enabled the model may rewrite it from that verified context only (source "AI"), and
// any failure falls back to the rule-based answer (source "RULES").

import type { LearningRole } from './learning.js';

export const MENTOR_INTENTS = [
  'GENERAL_PROGRESS',
  'SKILL_GAPS',
  'LEARNING_PLAN',
  'INTERVIEW_PREP',
  'PROJECT_IDEAS',
  'JOB_FIT',
] as const;
export type MentorIntent = (typeof MENTOR_INTENTS)[number];

export const MENTOR_INTENT_LABELS: Record<MentorIntent, string> = {
  GENERAL_PROGRESS: 'How am I doing, and what next?',
  SKILL_GAPS: 'Which skills should I work on?',
  LEARNING_PLAN: 'Plan my learning',
  INTERVIEW_PREP: 'Help me prepare for interviews',
  PROJECT_IDEAS: 'Suggest a practical project',
  JOB_FIT: 'How do I compare with a job?',
};

export const MENTOR_MESSAGE_MAX_LENGTH = 2000;

/** Read-only lookups the mentor may use. Chosen by a fixed intent table, never by the message. */
export const MENTOR_TOOLS = [
  'catalogue',
  'learning_snapshot',
  'preferences',
  'skill_assessment',
  'learning_plan',
  'interview_practice',
  'project_challenges',
  'analysed_jobs',
  'job_readiness',
] as const;
export type MentorTool = (typeof MENTOR_TOOLS)[number];

export interface MentorAskRequest {
  intent: MentorIntent;
  /** Optional question. Treated as untrusted text; only used to spot catalogue skill or role names. */
  message?: string;
  /** JOB_FIT only: one of the user's analysed jobs. Defaults to the most recently analysed one. */
  jobId?: string;
}

export const MENTOR_RECOMMENDATION_TYPES = [
  'COURSE',
  'LESSON',
  'DIAGNOSTIC',
  'REVISION_TOPIC',
  'INTERVIEW_QUESTION',
  'PROJECT_CHALLENGE',
  'JOB',
] as const;
export type MentorRecommendationType = (typeof MENTOR_RECOMMENDATION_TYPES)[number];

export interface MentorRecommendation {
  type: MentorRecommendationType;
  /** Id of a resource retrieved for this request (course, lesson, question, challenge, job…). */
  id: string;
  /** The course a lesson or diagnostic belongs to; null for other types. */
  courseId: string | null;
  title: string;
  reason: string;
  /** In-app link to the existing page for the resource. */
  href: string;
  evidence: string[];
}

/** Suggestions only: the UI shows a button that calls an existing, authorised endpoint. */
export type MentorProposedAction =
  | { type: 'SET_TARGET_ROLE'; role: LearningRole; label: string; description: string }
  | { type: 'ADD_COURSE'; courseId: string; label: string; description: string };

export interface MentorFact {
  label: string;
  value: string;
}

/** Why a rule-based answer was returned instead of an AI one. */
export const MENTOR_FALLBACK_REASONS = [
  'AI_DISABLED',
  'AI_TIMEOUT',
  'AI_UNAVAILABLE',
  /** The per-user AI allowance is used up (or another AI answer for this user is in progress). */
  'AI_LIMIT_REACHED',
  'AI_INVALID',
] as const;
export type MentorFallbackReason = (typeof MENTOR_FALLBACK_REASONS)[number];

export interface MentorResponse {
  intent: MentorIntent;
  /** Always the rule-based summary, computed from the user's records (also for AI answers). */
  summary: string;
  /**
   * AI answers only: a short AI-written explanation of how to use the suggestions. It may not
   * state facts about the user (progress, completion, skill level, outcomes); those stay in
   * `summary`, `factsUsed` and `uncertainty`.
   */
  explanation: string | null;
  recommendations: MentorRecommendation[];
  /** Missing context and limits of the evidence, in plain language. */
  uncertainty: string[];
  proposedActions: MentorProposedAction[];
  factsUsed: MentorFact[];
  /** Lookups used for this answer (from the fixed intent table). */
  toolsUsed: MentorTool[];
  /** AI: the model chose and ordered the verified suggestions and wrote `explanation`. RULES: rule-based. */
  source: 'AI' | 'RULES';
  /** Set when source is RULES because AI was off or its answer could not be used. */
  fallbackReason: MentorFallbackReason | null;
  /** A question that would help when information is missing (AI answers only). */
  followUpQuestion: string | null;
  disclaimer: string;
}
