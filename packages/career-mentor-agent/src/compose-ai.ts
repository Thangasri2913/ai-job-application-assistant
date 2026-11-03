import type {
  MentorFallbackReason,
  MentorIntent,
  MentorRecommendation,
  MentorResponse,
} from '@job-assist/shared';
import { AI_DISCLAIMER } from './intents.js';
import {
  buildComposeInput,
  buildCorrectionNote,
  type ComposeCandidate,
  MENTOR_COMPOSE_SYSTEM_PROMPT,
  MENTOR_COMPOSE_TASK,
} from './prompts/index.js';
import { type MentorAiDraft, mentorAiDraftSchema } from './schemas.js';
import { FOLLOW_UP_QUESTIONS, selectionExplanation } from './templates.js';
import type { MentorModel } from './types.js';

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_MODEL_ATTEMPTS = 2;
/** Long questions are cut before they reach the model; the rules never needed them anyway. */
const QUESTION_LIMIT = 600;

export type AiOutcome =
  | { ok: true; response: MentorResponse; attempts: number }
  | { ok: false; reason: MentorFallbackReason; attempts: number; rejectedProblems: number };

class DeadlineError extends Error {
  constructor() {
    super('Mentor AI selection deadline reached.');
    this.name = 'MentorDeadlineError';
  }
}

/**
 * Lets the model choose and order the verified suggestions of a validated rules answer
 * (prompt mentor-compose@3). The model sees the rules answer's summary, facts, limits and the
 * candidate resources (labelled R1..Rn) plus the untrusted question, and returns only
 * `{ picks }`: labels of candidates, best first. It supplies no text at all.
 *
 * Every pick must be a known, distinct label (at least one when candidates exist); otherwise
 * the draft is rejected, with one corrective retry within the deadline. In the result,
 * everything except the subset and order of suggestions is JobAssist's: the rules answer's
 * summary, facts, limits, reasons, evidence, links and actions, plus a fixed-template
 * explanation and follow-up question.
 *
 * The deadline is enforced with an AbortSignal passed to the model, so a provider that supports
 * cancellation stops the underlying request; the agent also stops waiting at the deadline even
 * if the provider ignores the signal, and never starts another attempt after it.
 */
export async function composeWithAi(args: {
  model: MentorModel;
  intent: MentorIntent;
  rules: MentorResponse;
  question: string | undefined;
  timeoutMs?: number;
  maxAttempts?: number;
}): Promise<AiOutcome> {
  const { model, rules } = args;
  const maxAttempts = Math.max(1, args.maxAttempts ?? DEFAULT_MAX_MODEL_ATTEMPTS);
  const candidates: (ComposeCandidate & { rec: MentorRecommendation })[] =
    rules.recommendations.map((rec, i) => ({
      ref: `R${i + 1}`,
      type: rec.type,
      title: rec.title,
      ruleReason: rec.reason,
      evidence: rec.evidence,
      rec,
    }));
  const question = args.question?.trim() ? args.question.trim().slice(0, QUESTION_LIMIT) : null;
  const input = buildComposeInput({
    intent: args.intent,
    summary: rules.summary,
    // Resume names are user-chosen and often contain the person's name: not needed by the model.
    facts: rules.factsUsed.map((f) =>
      f.label === 'Resume used' ? { ...f, value: f.value === 'None' ? 'None' : 'A resume' } : f,
    ),
    knownLimits: rules.uncertainty,
    candidates: candidates.map(({ rec: _rec, ...c }) => c),
    question,
  });

  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new DeadlineError()),
    args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  let attempts = 0;
  let rejectedProblems = 0;
  let correction = '';
  const fail = (reason: MentorFallbackReason): AiOutcome => ({
    ok: false,
    reason,
    attempts,
    rejectedProblems,
  });

  try {
    while (attempts < maxAttempts) {
      if (deadline.signal.aborted) return fail('AI_TIMEOUT'); // never start after the deadline
      attempts += 1;
      let draft: MentorAiDraft;
      try {
        draft = await untilAborted(
          model.generateStructured({
            task: MENTOR_COMPOSE_TASK,
            system: MENTOR_COMPOSE_SYSTEM_PROMPT + correction,
            input,
            schema: mentorAiDraftSchema,
            signal: deadline.signal,
          }),
          deadline.signal,
        );
      } catch (error) {
        // Whatever the provider reports after the deadline fired (an abort error, usually),
        // the cause is the deadline.
        if (deadline.signal.aborted) return fail('AI_TIMEOUT');
        const name = error instanceof Error ? error.name : '';
        if (name === 'AiNotConfiguredError') return fail('AI_DISABLED');
        if (name === 'AiOutputValidationError') {
          // Malformed output, including any text field: the draft schema allows only picks.
          rejectedProblems += 1;
          correction = buildCorrectionNote(['SCHEMA']);
          continue;
        }
        // Provider errors, refusals, truncation, network: not retried here (the provider retries).
        return fail('AI_UNAVAILABLE');
      }

      const problems = selectionProblems(
        draft,
        candidates.map((c) => c.ref),
      );
      if (!problems.length) {
        const byRef = new Map(candidates.map((c) => [c.ref, c.rec]));
        return {
          ok: true,
          attempts,
          response: {
            ...rules,
            // Only the subset and order are the model's; each item is the rules' own.
            recommendations: draft.picks.map((ref) => byRef.get(ref)!),
            explanation: selectionExplanation(args.intent, draft.picks.length, candidates.length),
            followUpQuestion: FOLLOW_UP_QUESTIONS[args.intent],
            source: 'AI',
            fallbackReason: null,
            disclaimer: AI_DISCLAIMER,
          },
        };
      }
      rejectedProblems += problems.length;
      correction = buildCorrectionNote(problems);
    }
    return fail('AI_INVALID');
  } finally {
    clearTimeout(timer);
    // Cancel anything still running (e.g. a provider that ignored the signal is no longer awaited).
    if (!deadline.signal.aborted) deadline.abort(new DeadlineError());
  }
}

/**
 * Problem codes for a schema-valid selection (codes only, never content): every pick must be a
 * label of a candidate retrieved for this request, used once, with at least one pick when any
 * candidates exist.
 */
export function selectionProblems(draft: MentorAiDraft, refs: string[]): string[] {
  const problems: string[] = [];
  const known = new Set(refs);
  if (draft.picks.some((r) => !known.has(r))) problems.push('UNKNOWN_REF');
  if (new Set(draft.picks).size !== draft.picks.length) problems.push('DUPLICATE_REF');
  if (refs.length && !draft.picks.length) problems.push('NO_RECOMMENDATION');
  return problems;
}

/** Stops waiting when the signal aborts, even if the underlying promise never settles. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DeadlineError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DeadlineError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
