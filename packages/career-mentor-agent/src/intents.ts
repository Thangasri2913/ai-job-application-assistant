import type { MentorIntent, MentorTool } from '@job-assist/shared';

/**
 * The fixed intent → tool table. The agent runs exactly these read-only tools for an intent,
 * in this order. Neither the user's message nor the model can add, remove or choose tools.
 */
export const MENTOR_TOOL_PLAN: Record<MentorIntent, readonly MentorTool[]> = {
  GENERAL_PROGRESS: ['catalogue', 'preferences', 'learning_snapshot'],
  SKILL_GAPS: ['catalogue', 'preferences', 'learning_snapshot', 'skill_assessment'],
  LEARNING_PLAN: ['catalogue', 'preferences', 'learning_snapshot', 'learning_plan'],
  INTERVIEW_PREP: ['catalogue', 'preferences', 'learning_snapshot', 'interview_practice'],
  PROJECT_IDEAS: ['catalogue', 'preferences', 'learning_snapshot', 'project_challenges'],
  JOB_FIT: ['catalogue', 'analysed_jobs', 'job_readiness'],
};

export const RULES_DISCLAIMER =
  'Rule-based guidance from your own JobAssist data — not AI-generated. It explains what your records show; it does not measure skills you have not been assessed on, and it does not predict interview or hiring outcomes.';

export const AI_DISCLAIMER =
  'The summary, facts, reasons and explanation come from your JobAssist records and fixed JobAssist wording; AI only chose which suggestions to show and in what order. Skills you have not been assessed on are unknown, and nothing here predicts interview or hiring outcomes.';
