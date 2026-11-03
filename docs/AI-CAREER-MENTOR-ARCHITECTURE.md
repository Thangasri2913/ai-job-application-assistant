# AI Career Mentor — architecture audit and implementation plan

- **Status:** Phase 2 (deterministic, read-only prototype) is implemented; see section 7. Phase 3 (AI composition) is implemented as the `@job-assist/career-mentor-agent` package; see section 8. Phases 4–6 are not.
- **Date:** 2026-10-19
- **Scope:** `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`, `docs/`. The audit included the uncommitted Learn & Prepare work (ADR-0021 to ADR-0024) present in the working tree.
- **Method:** read-only inspection of the source, configuration schema and documentation. No AI provider was called, no migration was run, and no environment values were printed. Only configuration _names_ and whether they are set are reported.

## 1. Summary

- JobAssist has **one provider-agnostic AI layer**: `AiService` → `AiProvider`. Its only real provider is **Anthropic Claude**, through the official `@anthropic-ai/sdk`. AI is **off by default** (`AI_PROVIDER=none`): locally (`.env`), in `.env.example` and in the committed Render blueprint (`render.yaml`). Every feature has a deterministic path that works without AI.
- **Seven AI-assisted capabilities** exist. Each is a single-shot, schema-validated structured generation with at most one corrective retry, plus a grounding check against its input. The seventh (practice-activity drafts) is built but has no route.
- **No agent exists.** There is no tool calling, planning loop or agent framework anywhere in the repository. There is also **no custom-trained or fine-tuned model**.
- **Most "intelligence" is deterministic code:** resume parsing, job-requirement rules, resume matching and scoring, job-discovery screening, Smart Apply eligibility, career analytics, interview rule-based feedback, Learn & Prepare recommendations, revision scheduling and analytics.
- **Recommendation:** build the Career Mentor as a **bounded workflow on top of the existing deterministic services**.
  - The server picks and runs read-only "tools" (existing services) for a classified intent.
  - At most one LLM call phrases the answer from validated facts.
  - The result is checked against a schema, the catalogue and the facts, and falls back to deterministic text when AI is off or fails.
  - Model-chosen tool calls come later, if evaluations justify them.

## 2. Existing AI components

### 2.1 AI layer (shared infrastructure)

| Component                                                       | Location                                   | Notes                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiService.generateStructured({ task, system, input, schema })` | `apps/api/src/modules/ai/ai.service.ts`    | The only entry point feature code uses. Converts the zod schema to JSON Schema, calls the provider and **validates the response with zod**; invalid output throws `AiOutputValidationError` and is never persisted. Logs only the task, provider and issue paths, never the output                                                                                        |
| `AiProvider` interface, DI token `AI_PROVIDER`                  | `ai/ai-provider.ts`                        | A single method, `generateStructured(request) → unknown`. **No tool-calling, streaming or multi-turn API**                                                                                                                                                                                                                                                                |
| Provider selection                                              | `ai/ai.module.ts`                          | `none` uses `UnconfiguredAiProvider`, which rejects with `AiNotConfiguredError` (no fabricated output). `mock` uses `MockAiProvider`, which returns only registered fixtures (tests). `anthropic` uses `AnthropicAiProvider`                                                                                                                                              |
| `AnthropicAiProvider`                                           | `ai/providers/anthropic-ai.provider.ts`    | Uses `client.beta.messages.create` with structured outputs (`output_config.format` json_schema), `effort: 'low'`, `max_tokens` 16,000, a refusal fallback (`betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`), and a 120 s timeout with 2 SDK retries. Refusals, truncation, non-JSON output and API errors are mapped to `AiProviderError(retryable)` |
| `toStructuredOutputSchema`                                      | `ai/providers/structured-output-schema.ts` | Strips the JSON-Schema keywords the API does not accept; zod enforces them afterwards                                                                                                                                                                                                                                                                                     |
| Errors                                                          | `ai/ai.errors.ts`                          | `AiNotConfiguredError`, `AiOutputValidationError`, `AiProviderError`                                                                                                                                                                                                                                                                                                      |
| `AiUsageService` and the `ai_usage` table                       | `ai/ai-usage.service.ts`, `schema.prisma`  | Records `userId`, optional `applicationId`, operation, provider, model, status (SUCCEEDED/INVALID/FAILED) and attempts. **No token counts or cost.** Used by application preparation, interviews and career insights                                                                                                                                                      |

### 2.2 Provider and model configuration (verified names only)

| Variable            | Schema (`apps/api/src/config/env.schema.ts`)                                  | Local `.env`             | Committed deploy config                    |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| `AI_PROVIDER`       | `none` \| `mock` \| `anthropic`; default `none`; `mock` refused in production | set to `none`            | `render.yaml`: `none`                      |
| `AI_MODEL`          | string; default `claude-opus-5`                                               | set (value not reported) | not set in `render.yaml`                   |
| `ANTHROPIC_API_KEY` | optional; the SDK can also use its own credential resolution                  | **not set**              | marked as a secret in `docs/DEPLOYMENT.md` |

**Unverified:**

- whether the hosted Render dashboard overrides `AI_PROVIDER`;
- whether the configured model id and beta flags are accepted by the live API.

`docs/AI_ARCHITECTURE.md` itself states that the Anthropic provider has only been tested against a stubbed SDK client, never against the live API. This audit made no API calls.

### 2.3 AI-assisted features

Every feature below is **AI-assisted with a deterministic fallback**: if the provider is `none`, fails, or returns invalid output, the feature still works.

| Capability                                 | Task id(s)                                                                                   | Location                                                                     | Reachable from the app                                                             | Input sent to the model                                                                                                 | Output and validation                                                                                                                                                         | Limits                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Resume structuring                         | `resume.structure` (prompt `resume-structure-1`)                                             | `resumes/parsing/resume-ai-structurer.ts`                                    | Yes: background parse after upload (`ParsingDispatcher`, in-process)               | The full extracted resume text, **including contact details**                                                           | `resumeContentSchema`. `groundInSource` drops values not present in the text. Up to 2 attempts. Stored separately in `resume_versions.ai_extraction`; the user must review it | Only when AI is enabled; the user always reviews                             |
| Job requirement extraction                 | `job.analyze` (`job-analysis@1`)                                                             | `jobs/analysis/job-ai-analyzer.ts`                                           | Yes: "Analyse" on a job (background `JobAnalysisDispatcher`; `@AnalysisRateLimit`) | Job description                                                                                                         | `jobAnalysisAiSchema`. Evidence must be verbatim and skills must be mentioned (`groundJobAnalysis`). 2 attempts. Merged with deterministic rules                              | No hiring-chance claims                                                      |
| Application preparation                    | `preparation.resume_tailoring`, `preparation.cover_letter`, `preparation.application_answer` | `application-preparation/ai/preparation-ai.ts`, `prompts.ts`, `grounding.ts` | Yes: within the request, rate-limited                                              | Job title, company and requirements; candidate name; resume summary, skills, experience and projects; the question text | Per-task schemas plus grounding checks, with up to 2 attempts and correction feedback; usage recorded                                                                         | The prompt states that employer text is **untrusted data, not instructions** |
| Interview practice (application-bound)     | `interview.generate_questions`, `interview.evaluate_answer`, `interview.generate_report`     | `interviews/ai/interview-ai.ts`, `prompts.ts`                                | Yes: interview sessions for an application, rate-limited                           | Preparation context (as above) plus the question and answer                                                             | Schemas; 2 attempts; usage recorded. The rule evaluator (`rules/answer-evaluator.ts`) is the fallback                                                                         | The prompt has accuracy principles, but no explicit untrusted-data clause    |
| Career insights                            | `career.generate_insights` (`career-insights@1`)                                             | `career-intelligence/insights/insights-ai.ts`                                | Yes: auto/manual runs (`CareerInsightsDispatcher`), rate-limited                   | Deterministic **facts** computed from the user's own records                                                            | `groundInsights`: numbers and skills must come from the cited facts, confidence is capped by evidence; 2 attempts; usage recorded. Rule-based insights are the fallback       | Not listed in `docs/AI_ARCHITECTURE.md` yet                                  |
| Practice-activity drafts (Learn & Prepare) | `learning.practice-activity`                                                                 | `learning/ai/practice-activity-generator.ts`                                 | **No:** no route or UI                                                             | Skill name, level and topic only (no personal data)                                                                     | `generatedActivitySchema`; links rejected; provenance forced to AI-generated and unreviewed                                                                                   | Foundation only                                                              |

**Background execution.** Dispatchers run in-process after the response is sent; status lives in the database, and unfinished runs are re-queued at start-up. They cover resume parsing, job analysis, career insights, job search and Smart Apply. The only scheduler is `JobAlertScheduler`, which is deterministic. There is no queue system (BullMQ or similar).

**Rate limiting.** `@AnalysisRateLimit()` applies a separate throttle bucket (`JOB_ANALYSIS_RATE_LIMIT_MAX`) to every AI-capable route.

### 2.4 Deterministic logic often mistaken for AI

| Capability                                                                                                                                                   | Location                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Resume parsing (PDF/DOCX → structured content)                                                                                                               | `resumes/parsing/*` (parser, skill dictionary) |
| Skill normalisation and matching                                                                                                                             | `common/skills/skill-normalization.ts`         |
| Job–resume matching, scores and recommended resume                                                                                                           | `jobs/matching/*`                              |
| Job discovery screening and alerts                                                                                                                           | `job-discovery/*`                              |
| Smart Apply eligibility and workflow                                                                                                                         | `smart-apply/*`                                |
| Career analytics (funnel, breakdowns)                                                                                                                        | `career-intelligence/*`                        |
| Interview rule-based questions and feedback                                                                                                                  | `interviews/rules/*`                           |
| Learn & Prepare: grading, resume evidence, recommendations, skill demand, job readiness, revision schedule, next steps, analytics, interview-practice rubric | `learning/*` (ADR-0021 to ADR-0024)            |

### 2.5 Classification

| Class                                                      | What exists                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Deterministic application logic                         | Everything in 2.4, plus all authorisation, persistence, scoring and grading                                                                                                                                   |
| 2. Direct LLM/API calls                                    | Only `AnthropicAiProvider.generateStructured`, reached exclusively through `AiService`                                                                                                                        |
| 3. AI-assisted workflows                                   | The 6 reachable features in 2.3 (each a fixed sequence: build input → one structured call → validate → ground → optional single retry → store or fall back), plus the unreachable practice-activity generator |
| 4. Agent behaviour (planning, tool use, result validation) | **None.** No tool definitions, no model-selected actions, no loops                                                                                                                                            |
| 5. Custom-trained or fine-tuned models                     | **None found.** There are no training scripts, model artefacts or fine-tuning configuration; the provider is called with a configurable model id only                                                         |

## 3. Proposed Career Mentor architecture

### 3.1 Principles

1. **Deterministic first.** Authorisation, data access, progress, grading, scoring, evidence rules and ranking stay in existing services. The LLM explains, prioritises _within_ given facts and drafts plans; it never decides access or grades anything.
2. **Reuse, don't duplicate.**
   - The mentor calls existing services (`AdaptiveLearningService`, `LearningRecommendationsService`, `JobReadinessService`, `LearningService`, `InterviewPracticeService`, `ProjectChallengesService`) through thin tool adapters.
   - It reuses `AiService`, `AiUsageService`, `@AnalysisRateLimit`, the zod validation pattern and the grounding approach of `groundInsights`.
3. **Bounded.** A fixed pipeline with hard caps, not an open-ended loop.
4. **Useful without AI.** With `AI_PROVIDER=none` the mentor returns a deterministic answer built from the same facts (the existing next-step reasons and plan explanations).
5. **Untrusted inputs.** Resume text, job descriptions and user messages are data, never instructions.

### 3.2 Data flow (prototype)

```
Web: /learn/mentor  ──POST /api/v1/mentor/ask { intent?, message?, options }──▶ MentorController
                                                     (auth guard · @AnalysisRateLimit · zod DTO)
MentorService (new module apps/api/src/modules/mentor)
 1. Resolve intent: an explicit intent from the UI (fixed enum) or, optionally, one small
    structured LLM call that classifies free text into the enum (else GENERAL_PROGRESS).
 2. Plan tools: a FIXED intent → tool-list table (no model choice in the prototype).
 3. Run tools: read-only adapters over existing services, always with the authenticated
    userId; each returns typed, minimised facts (ids, titles, counts, reasons).
 4. Compose:
      AI on  → AiService.generateStructured(task "mentor.compose", schema MentorDraft,
               input = facts as JSON + user message labelled UNTRUSTED)
      AI off → deterministic composer (templates over the same facts)
 5. Validate: zod schema → reference check (every id exists in the catalogue or in the tool
    results) → grounding (numbers and skills must appear in the facts) → drop or flag invalid
    items; on failure, one corrective retry, then the deterministic fallback.
 6. Respond: MentorResponse { summary, recommendations[], uncertainty[], proposedActions[],
    factsUsed[], source: AI|RULES, disclaimer }  + record ai_usage (operation "mentor.*").
```

**Intents (initial):**

| Intent             | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `GENERAL_PROGRESS` | Where am I, and what next?                |
| `SKILL_GAPS`       | Gaps for a role, optionally with a resume |
| `LEARNING_PLAN`    | A sequence of courses and lessons         |
| `INTERVIEW_PREP`   | Questions, concepts to revise             |
| `PROJECT_IDEAS`    | Matching challenges                       |
| `JOB_FIT`          | One of the user's analysed jobs           |

### 3.3 User context (authorised, minimised)

| Context                                            | Source (existing)                                                              | Notes                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Target role, interests, weekly goal                | `AdaptiveLearningService.getPreferences`                                       | Optional; works without                                                                                      |
| Learning progress, revision, analytics, next steps | `AdaptiveLearningService.snapshot`                                             | Already deterministic and explained                                                                          |
| Skill evidence (resume, assessment, corrections)   | `LearningRecommendationsService.assessSkills`                                  | Resume read owner-scoped and never copied; only skill names, evidence strength and short excerpts are passed |
| Diagnostics and interview or project progress      | Same services (via the snapshot and overviews)                                 |                                                                                                              |
| Analysed jobs and job readiness                    | `JobReadinessService.jobs` / `.readiness`                                      | Only the user's jobs; sample data is labelled                                                                |
| Catalogue                                          | `LearningService` (published content), interview questions, project challenges | Ids are validated against this                                                                               |

Users with **no resume and no target role** get facts from progress and preferences only. The deterministic default steps (ADR-0024) already cover this case.

### 3.4 Tools and permissions

Every tool is a server-side function. None is an HTTP call made by the model. Each takes the authenticated `userId` from the request context, **never from model output**, validates its arguments with zod, and returns minimised facts.

| Tool                       | Wraps                                         | Access                  | Arguments (validated)                                                           |
| -------------------------- | --------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `get_learning_snapshot`    | `AdaptiveLearningService.snapshot`            | read, own data          | none                                                                            |
| `get_next_steps`           | `AdaptiveLearningService.nextSteps`           | read                    | none                                                                            |
| `get_revision_topics`      | `AdaptiveLearningService.revision`            | read                    | `limit ≤ 5`                                                                     |
| `search_catalogue`         | `LearningService.list` / `get`                | read, published content | `q ≤ 100`, `skill`, `role`, `category`, `difficulty` (enums)                    |
| `get_skill_assessment`     | `LearningRecommendationsService.assessSkills` | read, own data          | `role` (enum) or `skillIds` (catalogue ids, ≤ 20); resume = default resume only |
| `list_interview_questions` | `InterviewPracticeService.list`               | read                    | `skill`, `difficulty`                                                           |
| `list_project_challenges`  | `ProjectChallengesService.list`               | read                    | `courseId`, `skill`                                                             |
| `list_analysed_jobs`       | `JobReadinessService.jobs`                    | read, own data          | none                                                                            |
| `get_job_readiness`        | `JobReadinessService.readiness`               | read, own data          | `jobId` (uuid; 404 if not owned)                                                |

**Write actions are proposals, not tools.** The model may return `proposedActions`:

- `SET_TARGET_ROLE` / `SET_INTERESTS`, executed through `PUT /learning/preferences`;
- `ADD_COURSE`, through `PUT /learning/enrollments/:id`;
- `DISMISS_STEP`, through `POST /learning/next-steps/dismissals`.

The UI shows each proposal as a button, and **the user's click** runs the existing endpoint with the existing authorisation.

**Never available to the mentor:** Smart Apply submission, resume edits, profile edits, grading, deleting data, arbitrary files or URLs, code execution, other users' records, and creating jobs or course content.

### 3.5 Planning, limits and validation

| Control                | Prototype value                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| LLM calls per request  | ≤ 2 (optional intent classification + composition), + 1 corrective retry                                                             |
| Tool calls per request | ≤ 6, chosen from the fixed intent table                                                                                              |
| Wall-clock budget      | 30 s total; the per-call timeout is reduced from the provider's 120 s via an `AiService` option (small extension)                    |
| Retries                | The SDK's own retries (2) for transient errors; 1 corrective retry for schema or grounding failures; then the deterministic fallback |
| Rate limit             | Existing `@AnalysisRateLimit` bucket; optional per-user daily cap via `ai_usage` counts (no migration)                               |
| Output size            | `MentorDraft` schema caps (for example ≤ 6 recommendations, ≤ 1,200 characters of summary)                                           |

**Validation pipeline:**

1. zod schema.
2. Every `courseId`, `lessonId`, `questionId`, `challengeId` and `jobId` must exist **and** appear in this request's tool results.
3. Numbers, percentages and skill names in text must appear in the facts (reuse the `groundInsights` approach).
4. No outcome promises (pattern check, as in career insights).
5. Invalid items are dropped and counted. If nothing valid remains, the deterministic composer answers.

The response states its `source` (AI or RULES) and an uncertainty list derived from the facts, for example "proficiency unknown for SQL" or "only one analysed job".

### 3.6 LLM integration

- **Reuse** `AiService` and `AnthropicAiProvider`. The prototype needs no new provider or model, and no change to `AI_MODEL`.
- **Small extensions:**
  - a per-request timeout or abort signal;
  - optionally, token usage on the provider result, for `ai_usage` and cost tracking.
- Tool-calling support in the provider (`AiProvider.runTools`) should come only in a later phase, after evaluation shows the fixed table is insufficient. It would then use the SDK's tool use with server-side tool execution, the same caps, and the same validation.
- The model id and beta flags must be **verified against the live API** in a non-production environment before AI is enabled anywhere. This audit did not verify them.

### 3.7 Privacy and security controls

| Risk                                                | Control                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cross-user access                                   | Tools take `userId` only from `@CurrentUser()`; the existing services already scope every query; e2e tests sign in as two users for every tool                                                                                                                                                                                                                                                                                       |
| Authorisation drift                                 | Tools call service methods, not Prisma directly, so the existing ownership checks apply; there is no generic "query" tool                                                                                                                                                                                                                                                                                                            |
| Input validation                                    | zod DTO for `/mentor/ask` (message ≤ 2,000 characters, enums for intent); zod for tool arguments; model output never becomes a tool argument without validation                                                                                                                                                                                                                                                                      |
| Prompt injection (resumes, job text, user messages) | Facts are passed as JSON in a clearly labelled data block. The system prompt states that the data is untrusted and must not be followed (as `application-preparation/prompts.ts` already does). The model has **no tools that act**: write actions are user-confirmed proposals, and references are validated. The same untrusted-data clause should be added to the interview, job-analysis and resume prompts, which lack it today |
| Data minimisation                                   | Send ids, titles, counts, skill names, evidence strength and ≤ 160-character excerpts only. No contact details, no full resume text, no full job descriptions. The analysed requirements (already extracted) are sent instead                                                                                                                                                                                                        |
| Logging                                             | Log only operation, provider, attempts, validation issue paths and durations (existing pattern). Never log prompts, facts, messages or outputs                                                                                                                                                                                                                                                                                       |
| Secrets                                             | Keys stay server-side in env; no client-side AI calls; provider errors are mapped to safe messages (existing `AiProviderError`)                                                                                                                                                                                                                                                                                                      |
| Cost and abuse                                      | Rate-limit bucket, per-request caps, `ai_usage` records; AI is off by default                                                                                                                                                                                                                                                                                                                                                        |
| Predictable failure                                 | Every failure path ends in the deterministic answer with `source: RULES` and a short note                                                                                                                                                                                                                                                                                                                                            |

## 4. Phased roadmap

**Phase 1: Architecture audit and design** (this document). Done. No code changed.

**Phase 2: Read-only mentor prototype (deterministic first)**

|            |                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modules    | New `apps/api/src/modules/mentor/` (controller, service, intent table, tool adapters, composer, schemas); `packages/shared/src/mentor.ts`; `apps/web/src/features/learn/pages/MentorPage.tsx` (or a panel on My learning) |
| API        | `POST /mentor/ask { intent, message? }` → `MentorResponse`                                                                                                                                                                |
| UI         | Intent chips plus an optional question box; answer with recommendations (links), uncertainty, `source` label, and proposed actions as buttons                                                                             |
| AI         | Off in this phase: the deterministic composer only                                                                                                                                                                        |
| Migration  | **None** (stateless; no conversation history)                                                                                                                                                                             |
| Tests      | Unit: intent table, every tool adapter (scoping, argument validation), composer, reference validation. e2e: auth 401, two-user isolation for each tool, no-resume/no-role user, unknown job id 404                        |
| Risks      | Duplicating next-steps logic. Mitigation: the composer only formats existing outputs                                                                                                                                      |
| Acceptance | Every answer's links resolve; no data from another user; works with `AI_PROVIDER=none`                                                                                                                                    |

**Phase 3: AI composition for learning and skill-gap answers**

|            |                                                                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modules    | `mentor/compose-ai.ts`, prompt file with version, `ai.service.ts` (timeout option)                                                                                                                    |
| API        | Same route; `source: AI` when used                                                                                                                                                                    |
| AI         | `mentor.compose` via `AiService`; validation pipeline 3.5; usage recorded                                                                                                                             |
| Migration  | None                                                                                                                                                                                                  |
| Tests      | `MockAiProvider` fixtures: valid, invalid schema, invented ids, invented numbers, injection text inside a job description, provider error, timeout. All must end valid or in a deterministic fallback |
| Acceptance | 0 invented ids or numbers on a fixture eval set; fallback rate measured; latency ≤ 30 s                                                                                                               |

**Phase 4: Interview and project preparation intents**

|            |                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Modules    | Tool adapters for interview questions, project challenges and revision topics; prompts                             |
| UI         | Recommendations link to `/learn/interview/:id`, `/learn/projects/:id` and `/learn/revision?topic=`                 |
| Migration  | None                                                                                                               |
| Tests      | Recommended items exist and match the requested skill or difficulty; no answer keys or rubric concepts are exposed |
| Acceptance | Example answers and rubric concepts never appear in mentor output                                                  |

**Phase 5: Job-data integration**

|            |                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Modules    | `get_job_readiness` and `list_analysed_jobs` adapters                                                            |
| UI         | Pick one of the user's jobs; per-skill basis labels (as on the job-readiness page)                               |
| Migration  | None                                                                                                             |
| Tests      | Another user's job returns 404; sample data is labelled; no job is invented; a no-jobs user gets a clear message |
| Acceptance | Every job mentioned is one of the user's analysed jobs                                                           |

**Phase 6: Evaluation, security testing and UX**

|            |                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work       | A fixture evaluation set (personas with no resume, role only, resume and jobs, sparse data); prompt-injection corpus; red-team checklist; usage and cost dashboard from `ai_usage`; accessibility review |
| Optional   | Conversation history or saved plans **would need a migration**. Propose a `mentor_sessions` table separately, with retention limits, and only if users need it                                           |
| Optional   | Model-chosen tool calls (`AiProvider.runTools`) behind a flag, if the evaluations justify it                                                                                                             |
| Acceptance | Injection corpus causes no unintended actions or data leaks; evaluation pass-rate thresholds agreed; per-user cost caps enforced                                                                         |

## 5. Unknowns and risks

| Item                                                                               | Status                                                                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Live behaviour of `AnthropicAiProvider` (model id, beta flags, structured outputs) | **Unverified.** Only stubbed unit tests exist (stated in `docs/AI_ARCHITECTURE.md`)                                              |
| Hosted `AI_PROVIDER` value                                                         | Committed `render.yaml` says `none`; dashboard overrides cannot be verified from the repository                                  |
| Token usage and cost                                                               | Not recorded today (`ai_usage` has no token columns); a migration would be needed to store them                                  |
| Prompt-injection clause                                                            | Present only in application-preparation prompts; missing in the interview, job-analysis, resume-structuring and insights prompts |
| Resume structuring sends contact details                                           | By design today; the mentor must not reuse this input path                                                                       |
| Docs                                                                               | `docs/AI_ARCHITECTURE.md` does not list career insights or the learning draft generator                                          |
| Model quality on mentor composition                                                | Unknown until a Phase 3 evaluation                                                                                               |
| Latency                                                                            | In-request composition; must respect the 30 s budget                                                                             |

## 6. Acceptance criteria for the mentor overall

1. Never reads or reveals another user's data (tested for every tool).
2. Every recommended course, lesson, question, project and job exists and was returned by a tool in that request.
3. No invented statistics, salaries, hiring chances or employment promises.
4. Works with no resume, no target role and no jobs, and with `AI_PROVIDER=none`.
5. States its source (AI or rules) and its uncertainty in plain language.
6. Takes no consequential action without an explicit user click on an existing, authorised endpoint.
7. Bounded: ≤ 2 LLM calls (+1 retry), ≤ 6 tool calls, ≤ 30 s, rate-limited, and usage-recorded.

## 7. Phase 2 implementation notes (deterministic prototype)

- **Location:**
  - API: `apps/api/src/modules/mentor/`. Since Phase 3, the intent table, message hints, composer and response validation live in `packages/career-mentor-agent` (see section 8);
  - shared contract: `packages/shared/src/mentor.ts`;
  - web: `apps/web/src/features/learn/pages/MentorPage.tsx` at `/learn/mentor`.
- **Endpoint:** `POST /api/v1/mentor/ask { intent, message?, jobId? }`. It requires authentication and uses the analysis rate-limit bucket. `message` is at most 2,000 characters, and `jobId` is accepted only with `JOB_FIT`. Unknown fields are rejected.
- **Fixed lookups per intent:** `MENTOR_TOOL_PLAN`. The message is read only to recognise catalogue skill names and role labels (`readMessageHints`). It can narrow existing lookups but never chooses them, and it is never echoed or logged.
- **Lookups reuse** `LearningService`, `AdaptiveLearningService` (snapshot, preferences, default resume, role assessment), `LearningProgressService`, `LearningRecommendationsService` (`assessSkills`, `recommend`), `InterviewPracticeService`, `ProjectChallengesService` and `JobReadinessService`. Each is called with the authenticated user's id.
- **Validation:** `mentorResponseSchema` (zod), plus `RetrievedResources`. Recommendations whose id was not retrieved in the same request are dropped; only in-app links are allowed. In Phase 2, `source` was always `RULES`; for Phase 3, see section 8.
- **Proposed actions:** `ADD_COURSE` (`PUT /learning/enrollments/:id`) and `SET_TARGET_ROLE` (`PUT /learning/preferences`). They run only when the user clicks.
- **No AI calls, no writes, no migration and no stored conversations.**

## 8. Phase 3 implementation notes (agent package)

- **Package:** `packages/career-mentor-agent` (`@job-assist/career-mentor-agent`). It is a library with no server, no database access and no AI provider of its own. Its entry point is `runCareerMentorAgent(context, request, { tools, model })`. Its source contains:
  - `src/agent.ts`: orchestration;
  - `src/tools/`: the approved tools, bound to the user;
  - `src/prompts/`: versioned prompts (`mentor-compose@3`; see 8.3);
  - `src/schemas.ts`, `src/types.ts`;
  - `src/rules/`: the deterministic composer moved from the API;
  - `src/compose-ai.ts`, `src/templates.ts`, `src/validation.ts` (`src/grounding.ts` was removed in 8.3).

  Tests are in `tests/`. See the package README for the full sequence.

- **Host integration:** the existing controller and service in `apps/api/src/modules/mentor/`.
  - `MentorTools` implements `MentorToolPort` by wrapping the existing learning, readiness, interview and project services.
  - `MentorService` passes `{ userId }` from the authenticated request, the tools, and the mentor's own `AiService` instance (`MENTOR_AI_SERVICE`, selected by `MENTOR_AI_PROVIDER`; see 8.4) as the model. It does not use the shared `AiService` that `AI_PROVIDER` controls. It maps `MentorAgentError` to 400 or 404.
  - It records `ai_usage` (operation `mentor.compose`; ids and outcome only), and logs counts and fallback reasons only.
  - Authentication, request validation and size limits (`mentorAskSchema`, shared with the agent), the analysis rate-limit bucket and error handling stay in the API.
- **AI path:** the model receives the validated rules answer's facts, known limits and candidate resources (`R1..Rn`: type, title, rule reason, evidence), the rules summary, and the question, which is capped at 600 characters and marked untrusted.
  - It does not receive user ids, resource ids, links, resume text or contact details.
  - Since 8.3 it returns only `{ picks }`.
  - Summary, type, id, link, title, reason, evidence, facts, limits and actions always come from the tools and rules.
  - The draft is checked by `selectionProblems` (unknown labels, duplicates, or an empty selection when candidates exist), with one corrective retry and a 30 s total timeout. Any failure returns the rules answer with a `fallbackReason`.
- **Contract changes:**
  - `MentorResponse.source` is `AI` or `RULES`;
  - new fields `fallbackReason` (`AI_DISABLED | AI_TIMEOUT | AI_UNAVAILABLE | AI_LIMIT_REACHED | AI_INVALID | null`), `followUpQuestion` (string or null) and, since 8.2, `explanation` (string or null).
- **Web:** `MentorPage` shows:
  - an "AI-ordered suggestions · facts from your records" label or a "Rule-based answer (no AI)" label, and (since 8.3) the fixed-template explanation in a box headed "About these suggestions", which does not claim to be AI-written;
  - a note explaining any fallback other than `AI_DISABLED`;
  - the suggested follow-up question, which fills the question box only when the user clicks;
  - recommendation links rendered only when they are in-app.
- **Build and deploy:**
  - The package is an npm workspace, and the API's `prebuild`, `pretest`, `pretypecheck` and `prestart:dev` scripts build it.
  - `apps/api/Dockerfile` copies it and includes it in `npm ci`.
  - The root `postinstall` is unchanged, so the Vercel web install, which installs only the web and shared workspaces, is not affected.
  - `render.yaml` and `AI_PROVIDER=none` are unchanged. Three optional environment variables were added (8.2 and 8.4): `MENTOR_AI_PROVIDER` (`none` | `anthropic`, default `none`), `MENTOR_AI_USER_LIMIT` (default 20) and `MENTOR_AI_USER_WINDOW_SECONDS` (default 86400). They are documented, commented out, in `.env.example`, and are not set in `render.yaml`, so a deployment gets the defaults: rule-based mentor answers.
  - `MENTOR_AI_PROVIDER` alone controls Career Mentor AI. `AI_PROVIDER` controls the other AI features and does not enable mentor AI. No real model has been called: the Anthropic path is covered only by tests with doubles, not validated against the live API.
- **Not done:** conversation history, streaming, migrations, and live-model evaluation. No real model has been called; all AI tests use scripted doubles or `MockAiProvider`.

### 8.1 Security review (Prompt 9)

An independent review of the agent found that the original grounding checks were too narrow. Fourteen realistic phrasings passed them, for example:

- "You'll get hired";
- "very likely to get an offer";
- "Ninety percent of recruiters…";
- "ex​pert", written with a zero-width space;
- full-width digits;
- "evil[.]example";
- "earn more";
- "highly skilled";
- "sought after";
- skills outside the catalogue, such as Kubernetes.

In addition, numbers and skills from the user's question, or planted in a job posting's title or company, counted as evidence.

The fixes, with regression tests in `packages/career-mentor-agent/tests/regression.spec.ts`, the API unit tests and the e2e tests:

- Model text is NFKC-normalised and stripped of invisible format and control characters. The text that is checked is the text that is returned.
- Evidence comes only from the rules answer. The question, job titles, company names, resume names and job requirements outside the catalogue are excluded.
- The checks now cover:
  - spelled-out numbers, percentages, multipliers and large-number words;
  - likelihood and "match", "fit" or "job-ready" wording;
  - earnings;
  - employer-demand phrasing;
  - broader proficiency wording;
  - obfuscated links and emails.
- The host passes JobAssist's skill dictionary (`detectSkills`), so AI text cannot name skills, inside or outside the catalogue, that the trusted context lacks.
- Resume names are no longer sent to the model.
- An unconfigured provider is no longer recorded as a failed AI call.

Remaining limits:

- **Pattern checks do not verify meaning.** A sentence that misstates a trusted fact without adding numbers, skills or forbidden wording can pass, for example by claiming a course is finished when it is not. The AI disclaimer says answers can be wrong.
- **The checks fail closed.** Honest negations such as "this does not mean you are proficient" are rejected, and the rules answer is shown instead.
- ~~The 30 s timeout does not cancel the provider request.~~ Addressed in 8.2.
- ~~Rate limiting is per client IP; there is no per-user AI budget.~~ Addressed in 8.2 (the IP limit remains as well).

### 8.2 Closing the review's remaining risks (Prompt 10)

**Cancellation (M3).**

- `AiProvider` requests and `AiService.generateStructured` take an optional `signal`. The agent passes one to every model call and aborts it at its 30 s deadline.
- `AnthropicAiProvider` forwards the signal to the SDK (`messages.create(params, { signal })`). In `@anthropic-ai/sdk` 0.133 this aborts the in-flight HTTP request, cuts a retry back-off short, and prevents further retries. The SDK's `APIUserAbortError` becomes `AiAbortedError`.
- The agent never starts a retry after the deadline, and it stops waiting even if a provider ignores the signal.
- This is client-side cancellation. Tokens the service generated before the connection closed may still be billed, and the remote service's handling of a dropped request is not something JobAssist can verify.
- Tests use controllable fakes. One also uses the real SDK client with an injected `fetch` (no network) to show the in-flight request is aborted and not retried. No live call was made.

**Per-user AI allowance (M4).**

- `MentorAiBudget` (API) allows `MENTOR_AI_USER_LIMIT` AI-composed answers per user per `MENTOR_AI_USER_WINDOW_SECONDS` (defaults: 20 per 24 h). It is separate from, and in addition to, the IP-based analysis rate limit.
- **Persistence.** Usage is counted from existing `ai_usage` rows (operation `mentor.compose`; ids and outcome only). The count survives restarts and is shared by all instances on the same database. No migration was needed.
- **Concurrency.** Each instance holds an in-memory set and allows one AI composition per user at a time. The slot is claimed synchronously before the database count and released only after usage is recorded, so concurrent requests from one user cannot pass the limit together on one instance.
- **Multi-instance.** With several instances, each could admit one concurrent request per user, so a race could exceed the limit by at most (instances − 1). `render.yaml` runs one instance (free plan). Exact enforcement across instances would need a shared lock: a database advisory lock, a reservation row (schema change), or Redis. That is not implemented and would need approval.
- **Behaviour.** When the allowance is used up, or another AI answer for the user is in progress, the mentor answers by rules (`fallbackReason: AI_LIMIT_REACHED`). If the count cannot be read, it fails closed to rules. With `MENTOR_AI_PROVIDER=none` (the default) nothing is counted; `AI_PROVIDER` has no effect on the mentor (since 8.4).

**Semantic grounding (superseded by 8.3, where the model writes no text at all).** The model can no longer write factual content.

- Prompt `mentor-compose@2` returns only `{ explanation, picks, followUpQuestion }`.
- In an AI answer, the `summary`, `factsUsed`, `uncertainty`, every recommendation (including its reason), and the proposed actions are the rules answer's, unchanged. The model's contribution is the subset and order of verified suggestions, plus a separately labelled explanation and an optional question.
- The model's text must contain no numbers. A new `USER_STATE_CLAIM` check rejects statements about the learner's state, for example:
  - completion, including negated and contracted forms ("you've already covered", "you haven't started");
  - knowledge or understanding;
  - level and readiness;
  - progress ("on track", "already", "no longer");
  - skill status ("SQL is no longer a gap");
  - evidential claims ("your resume shows", "this proves you");
  - advice to skip assessment.
- Existing checks for outcomes, pay, market, proficiency, links and unknown skills still apply.

**Remaining limits.**

- These are still pattern checks. An explanation can give poor or misleading advice without stating a fact about the learner ("start with the hardest course"), and a novel phrasing of a state claim may not be caught.
- The model's choice and order of suggestions is unverified beyond "only verified candidates".
- The checks fail closed, so some harmless sentences ("so you know what to expect") are rejected and the rules answer is shown.
- The disclaimer is supplementary, not the safeguard.

### 8.3 Selection-only AI (Prompt 12, option A of the readiness review)

The Prompt 11 readiness review probed the `USER_STATE_CLAIM` checks with 12 new phrasings, and 10 got through. Examples:

- "Great job finishing the SQL course!"
- "You've got SQL down"
- "Your SQL looks solid"
- "Most of the basics are behind you"
- "With SQL under your belt…"
- "Congratulations on completing the lessons"

Rather than extend the patterns, the model no longer writes any text.

- **Model output.** Prompt `mentor-compose@3` returns only `{ picks }`, labels of verified candidates, best first. `mentorAiDraftSchema` is a strict object, so any additional field (`explanation`, `followUpQuestion`, `summary`, a per-pick `reason`) makes the output invalid.
- **Selection validation.** `selectionProblems` rejects unknown labels, duplicates, and an empty selection when candidates exist. A failure gets one corrective retry (codes only), never after the deadline. A second failure returns the rules answer with `AI_INVALID`.
- **Wording.** An AI answer is the rules answer with only the subset and order of `recommendations` changed. Each recommendation, and the summary, facts, limits, evidence, links and actions, are the rules' own.
  - `explanation` is `selectionExplanation(intent, chosen, found)`, for example "The AI chose 2 of the 5 suggestions JobAssist found for “…” and put them in this order. Every suggestion, reason and link comes from your JobAssist records." It is followed by one fixed, fact-free tip per intent.
  - `followUpQuestion` is a fixed question per intent (`FOLLOW_UP_QUESTIONS`).
  - Both are `null` in rules answers, which are unchanged.
- **Removed.** `src/grounding.ts` (the pattern checks), the host's `detectSkills` dependency and the untrusted-text stripping are removed, because there is no model text left to check. The question and job text can still influence which verified suggestions are chosen and in which order, but nothing else.
- **Web.** The badge reads "AI-ordered suggestions · facts from your records". The explanation box is headed "About these suggestions" and is not labelled as AI-written.
- **Follow-up question decision.** A model-written follow-up question would reintroduce the same risk, and it can be copied into the question box, so it is now a fixed template. It is generic, so its value is modest. It never sends anything by itself.
- **Unchanged.** Fallbacks (`AI_DISABLED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_LIMIT_REACHED`, `AI_INVALID`), cancellation and the per-user allowance from 8.2.

**Residual risk.**

- The model's choice and order are not judged for quality. It could, for example, put an advanced suggestion first or leave out a useful one; every item shown is still verified and accurate.
- Each request still costs a model call for ordering alone, so whether that is worth it should be measured in the controlled live test.

### 8.4 Mentor-only AI provider (Prompt 14)

The Prompt 13 review found that `AI_PROVIDER` enables AI for every feature at once. That includes work that starts by itself:

- startup re-queues of resume parses, job analyses, job-search runs, career-insight runs and Smart Apply preparations;
- the job-alert scheduler;
- opening the Career Intelligence page.

A live Career Mentor test could therefore not be isolated by configuration.

- **Setting.** `MENTOR_AI_PROVIDER` (`none` | `anthropic`, default `none`; other values fail start-up validation) selects the Career Mentor's provider. It is independent of `AI_PROVIDER`, which still governs every other AI feature.
- **Wiring.** `apps/api/src/modules/mentor/mentor-ai.provider.ts` provides two Nest tokens, `MENTOR_AI_PROVIDER` and `MENTOR_AI_SERVICE`. The latter is a separate `AiService` instance with the same validation, logging and cancellation as the shared one.
  - Both tokens are declared only in `MentorModule` and are not exported, so no other module can inject them.
  - `MentorService` injects `MENTOR_AI_SERVICE`. The six other AI features keep receiving the shared `AiService` from `AiModule` (global `AI_PROVIDER` token), which is unchanged.
  - With `MENTOR_AI_PROVIDER=anthropic` and `AI_PROVIDER=none`, nothing except the mentor can reach the model, whatever runs in the background.
- **Credentials.** Validation never requires `ANTHROPIC_API_KEY`. With `MENTOR_AI_PROVIDER=anthropic`, the mentor uses `AI_MODEL` and `ANTHROPIC_API_KEY`, or the SDK's own credential resolution. Without credentials, start-up still succeeds, a warning is logged (whether a key is set, never the key), and each mentor request falls back to rules.
- **Unchanged.** The selection-only `{ picks }` contract, the deadline and cancellation, the per-user allowance, the IP rate limit, all fallback reasons, and `JOB_ALERT_SCHEDULER_ENABLED`. Isolation does not depend on the scheduler setting.
- **Tests.** `mentor-ai.provider.spec.ts` (factory, key never logged), `env.schema.spec.ts` (default and validation), `test/mentor-ai-isolation.e2e-spec.ts` (the default makes no call; the other six features get the shared, disabled service; resume parsing and job analysis never reach the mentor's provider) and `test/mentor-ai-anthropic-config.e2e-spec.ts` (`anthropic` wiring checked without any request).
