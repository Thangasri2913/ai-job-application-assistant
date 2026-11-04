import type { ActivityAttemptResult } from '@job-assist/shared';

/** What a learner has typed or chosen in one activity, and the last checked result. */
export interface ActivityDraft {
  choice: string;
  text: string;
  gaps: Record<string, string>;
  checked: string[];
  result: ActivityAttemptResult | null;
}

const EMPTY: ActivityDraft = { choice: '', text: '', gaps: {}, checked: [], result: null };

/**
 * In-memory drafts for this browser tab, so moving between lessons or sections does not
 * discard answers. Nothing is written to browser storage: answers that matter are saved as
 * attempts on the server when checked.
 */
const drafts = new Map<string, ActivityDraft>();

export const draftKey = (courseId: string, activityId: string) => `${courseId}/${activityId}`;

export function readDraft(key: string): ActivityDraft {
  return drafts.get(key) ?? EMPTY;
}

export function writeDraft(key: string, draft: ActivityDraft): void {
  drafts.set(key, draft);
}

/** For tests. */
export function clearDrafts(): void {
  drafts.clear();
  diagnosticDrafts.clear();
  interviewDrafts.clear();
}

/** Unsubmitted diagnostic answers per course, for this tab only. */
const diagnosticDrafts = new Map<string, Record<string, string>>();

export const readDiagnosticDraft = (courseId: string) => diagnosticDrafts.get(courseId) ?? {};
export const writeDiagnosticDraft = (courseId: string, answers: Record<string, string>) => {
  if (Object.keys(answers).length) diagnosticDrafts.set(courseId, answers);
  else diagnosticDrafts.delete(courseId);
};

/** Unsubmitted interview-practice answers per question, for this tab only. */
const interviewDrafts = new Map<string, string>();

export const readInterviewDraft = (questionId: string) => interviewDrafts.get(questionId) ?? '';
export const writeInterviewDraft = (questionId: string, text: string) => {
  if (text) interviewDrafts.set(questionId, text);
  else interviewDrafts.delete(questionId);
};
