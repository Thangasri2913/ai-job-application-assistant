import type { MentorResponse } from '@job-assist/shared';
import { composeWithAi } from './compose-ai.js';
import { MentorAgentError } from './errors.js';
import { RULES_DISCLAIMER } from './intents.js';
import { normaliseCatalogue } from './internal.js';
import { readMessageHints } from './message-hints.js';
import { type ComposeInput, composeAnswer, retrievedResources } from './rules/compose.js';
import { mentorAskSchema } from './schemas.js';
import { createToolbox, runToolPlan } from './tools/index.js';
import type { AgentContext, AgentDependencies, AgentResult, AgentTelemetry } from './types.js';
import { validateMentorResponse } from './validation.js';

/**
 * Career Mentor agent: one bounded pass, no loops over tools and no state between requests.
 *
 *  1. validate the request          5. if AI is enabled and allowed, let the model choose and order
 *  2. resolve the intent's plan     6. validate the response schema
 *  3. run the approved tools        7. verify every reference against the tool results
 *  4. compose the rules answer      8. return the AI answer, or the rules answer as fallback
 *
 * In an AI answer the model only chooses and orders the verified suggestions; it writes no text.
 * Summary, facts, limits, reasons and actions are the rules answer's, and the explanation and
 * follow-up question are fixed templates (src/templates.ts).
 *
 * The user id comes only from `context` (the host's authenticated request).
 */
export async function runCareerMentorAgent(
  context: AgentContext,
  request: unknown,
  deps: AgentDependencies,
): Promise<AgentResult> {
  if (typeof context?.userId !== 'string' || !context.userId)
    throw new MentorAgentError('INVALID_REQUEST', 'A signed-in user is required.');
  const parsed = mentorAskSchema.safeParse(request);
  if (!parsed.success)
    throw new MentorAgentError('INVALID_REQUEST', 'The mentor request is not valid.');
  const req = parsed.data;

  const toolbox = createToolbox(deps.tools, context);
  const catalogue = normaliseCatalogue(await toolbox.catalogue());
  const hints = readMessageHints(req.message, catalogue.skills.values());
  const input: ComposeInput = { intent: req.intent, hints, catalogue };
  const toolsUsed = await runToolPlan(req, toolbox, input);

  const retrieved = retrievedResources(input);
  const answer = composeAnswer(input);
  const rules = validateMentorResponse(
    {
      intent: req.intent,
      ...answer,
      toolsUsed,
      explanation: null,
      source: 'RULES',
      fallbackReason: null,
      followUpQuestion: null,
      disclaimer: RULES_DISCLAIMER,
    },
    retrieved,
  );
  const telemetry: AgentTelemetry = {
    toolsUsed,
    modelAttempts: 0,
    modelOutcome: null,
    fallbackReason: null,
    rejectedDraftProblems: 0,
    droppedRecommendations: rules.dropped,
  };
  const fallback = (reason: AgentTelemetry['fallbackReason']): AgentResult => {
    telemetry.fallbackReason = reason;
    return { response: { ...rules.response, fallbackReason: reason }, telemetry };
  };

  const model = deps.model;
  if (!model?.enabled) return fallback('AI_DISABLED');
  if (deps.aiBlockedReason) return fallback(deps.aiBlockedReason);

  const outcome = await composeWithAi({
    model,
    intent: req.intent,
    rules: rules.response,
    question: req.message,
    timeoutMs: deps.options?.timeoutMs,
    maxAttempts: deps.options?.maxModelAttempts,
  });
  telemetry.modelAttempts = outcome.attempts;
  if (!outcome.ok) {
    telemetry.rejectedDraftProblems = outcome.rejectedProblems;
    // An unconfigured provider made no call, so there is no usage to record.
    if (outcome.reason === 'AI_DISABLED') telemetry.modelAttempts = 0;
    else telemetry.modelOutcome = outcome.reason === 'AI_INVALID' ? 'INVALID' : 'FAILED';
    return fallback(outcome.reason);
  }

  let checked: { response: MentorResponse; dropped: number };
  try {
    checked = validateMentorResponse(outcome.response, retrieved);
  } catch {
    telemetry.modelOutcome = 'INVALID';
    return fallback('AI_INVALID');
  }
  if (checked.dropped) {
    // Cannot happen with refs mapped from candidates; treated as invalid if it ever does.
    telemetry.modelOutcome = 'INVALID';
    return fallback('AI_INVALID');
  }
  telemetry.modelOutcome = 'SUCCEEDED';
  return { response: checked.response, telemetry };
}
