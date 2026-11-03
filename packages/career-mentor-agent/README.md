# @job-assist/career-mentor-agent

The JobAssist Career Mentor agent. It answers a learner's question from their own JobAssist data:
it runs a fixed set of read-only tools and writes a rule-based answer. When AI is enabled, the
model may only choose and order the verified suggestions; it writes no text. Every word the
user sees is JobAssist's own: the rules answer plus a fixed-template explanation and follow-up
question (`src/templates.ts`). If any step fails, the rule-based answer is returned instead.

This is a library, not a service. It has no HTTP server, database access, AI provider or
credentials of its own. The host (`apps/api`) supplies:

- the authenticated user;
- the tools;
- the existing `AiService`.

## Use

```ts
import { runCareerMentorAgent, MentorAgentError } from '@job-assist/career-mentor-agent';

const { response, telemetry } = await runCareerMentorAgent(
  { userId }, // trusted: from the authenticated request, never the body
  body, // validated again here with mentorAskSchema
  { tools, model: aiService }, // MentorToolPort + MentorModel (AiService fits this shape)
);
```

The call throws `MentorAgentError` with one of two codes:

- `INVALID_REQUEST` (the host maps it to 400);
- `JOB_NOT_FOUND` (mapped to 404).

`telemetry` contains counts and outcomes only. The host uses it for logs and `ai_usage` records.

## The bounded sequence (`src/agent.ts`)

The agent runs one pass, with no tool loop and no stored state:

1. Validate the request (`mentorAskSchema`: strict, message of at most 2,000 characters, `jobId` only with `JOB_FIT`).
2. Resolve the intent to its fixed tool list (`MENTOR_TOOL_PLAN`).
3. Run the approved tools with the context's user id (`src/tools/`).
4. Compose the rule-based answer and validate it (`src/rules/compose.ts`, `src/validation.ts`).
5. If the model is enabled and the host has not reported the per-user AI limit, send it a minimised context (`src/compose-ai.ts`, `src/prompts/`). The model sees:
   - the rules summary, facts and known limits;
   - candidate resources, labelled `R1..Rn`;
   - the question, marked as untrusted.

   It returns only `{ picks }`: the labels of the candidates to show, best first. The schema is strict, so any other field (explanation, summary, reason, question…) makes the output invalid. It cannot supply text, facts, reasons, ids, links, actions or tools.

6. Validate the model's draft:
   - against its schema;
   - picks must be known, unique refs (at least one when candidates exist).

   A draft that fails gets one corrective retry, never after the deadline. The AI answer is then the rules answer with the chosen suggestions in the chosen order, `explanation` from `selectionExplanation(intent, chosen, found)` and `followUpQuestion` from `FOLLOW_UP_QUESTIONS[intent]`. The response schema is validated.

7. Verify every recommendation against the resources that were retrieved for this request.
8. Return the AI answer (`source: "AI"`). Otherwise return the rule-based answer (`source: "RULES"`) with a `fallbackReason`:
   - `AI_DISABLED`;
   - `AI_TIMEOUT` (30 s by default; the deadline aborts the `signal` passed to the model, which JobAssist's `AiService` forwards to the provider SDK to cancel the request);
   - `AI_UNAVAILABLE` (provider error or refusal);
   - `AI_LIMIT_REACHED` (the host's per-user allowance is used up; the model is not called);
   - `AI_INVALID`.

## Intents and tools

| Intent             | Tools (in order)                                              |
| ------------------ | ------------------------------------------------------------- |
| `GENERAL_PROGRESS` | catalogue, preferences, learning_snapshot                     |
| `SKILL_GAPS`       | catalogue, preferences, learning_snapshot, skill_assessment   |
| `LEARNING_PLAN`    | catalogue, preferences, learning_snapshot, learning_plan      |
| `INTERVIEW_PREP`   | catalogue, preferences, learning_snapshot, interview_practice |
| `PROJECT_IDEAS`    | catalogue, preferences, learning_snapshot, project_challenges |
| `JOB_FIT`          | catalogue, analysed_jobs, job_readiness                       |

All tools are read-only and are listed in `APPROVED_TOOLS`. `createToolbox` binds them to the
context user id. There is no generic query, file, URL, code or write tool.

Proposed actions (`ADD_COURSE`, `SET_TARGET_ROLE`) come only from the rules. They run only when
the user clicks a button in the web app, which calls the existing endpoints.

## Configuration

The package reads no environment variables. AI is configured on the API, and is off by default:

| Variable                        | Default         | Notes                                                                                                                      |
| ------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `MENTOR_AI_PROVIDER`            | `none`          | **The mentor's own provider**: `none` or `anthropic`. Independent of `AI_PROVIDER`; enables AI for the Career Mentor only. |
| `AI_PROVIDER`                   | `none`          | `none` means rule-based answers only. `mock` is for tests and is refused in production. `anthropic` uses Claude.           |
| `AI_MODEL`                      | `claude-opus-5` | Only with `anthropic`                                                                                                      |
| `ANTHROPIC_API_KEY`             | not set         | Secret. Only with `anthropic`; never commit it                                                                             |
| `MENTOR_AI_USER_LIMIT`          | `20`            | AI-composed mentor answers per user per window; `0` turns mentor AI off. Rules answers are unlimited.                      |
| `MENTOR_AI_USER_WINDOW_SECONDS` | `86400`         | Length of the allowance window.                                                                                            |

## Prompt versions

`src/prompts/mentor-compose.v3.ts` holds `mentor-compose@3` (task `mentor.compose`): selection
only. `@1` let the model rewrite the summary, reasons and limits; `@2` let it write a short
explanation and follow-up question, whose pattern checks proved leaky. When you change the
wording or output shape, add a new version and note the change rather than editing silently.

## Scripts

```sh
npm run build -w @job-assist/career-mentor-agent      # tsc → dist (the API's prebuild runs this)
npm run test -w @job-assist/career-mentor-agent       # unit + security tests (no network, no model)
npm run typecheck -w @job-assist/career-mentor-agent
```
