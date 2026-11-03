# AI Architecture

Status: AI is **optional** and used for **structuring uploaded resumes**, **extracting job requirements** **application preparation** (resume rewrites, cover letters, application answers), **interview practice** (questions, answer feedback, report summary) and the **Career Mentor** (choosing and ordering verified suggestions only; all wording is rule-based or fixed templates; see [AI-CAREER-MENTOR-ARCHITECTURE.md](AI-CAREER-MENTOR-ARCHITECTURE.md)). Scoring and recommendations never use AI. With `AI_PROVIDER=none` every feature still works, using deterministic, grounded drafts. With the default `AI_PROVIDER=none`, resumes are parsed by the deterministic parser only, and every feature works. Decision records: [ADR-0003](adr/0003-ai-provider-abstraction.md), [ADR-0011](adr/0011-resume-parsing-pipeline.md).

## Layers

```
ResumeAiStructurer (task "resume.structure", prompt version resume-structure-1)
JobAiAnalyzer      (task "job.analyze", prompt version job-analysis@1; schema jobAnalysisAiSchema)
PreparationAi      (tasks "preparation.resume_tailoring" · "preparation.cover_letter" · "preparation.application_answer",
                    prompts in application-preparation/prompts.ts, preparation@1; grounded + usage-recorded)
InterviewAi        (tasks "interview.generate_questions" · "interview.evaluate_answer" · "interview.generate_report",
                    prompts in interviews/prompts.ts, interview@1; no presumed experience, no supplied metrics)
        │  zod schema = resumeContentSchema (same schema that validates user edits)
        ▼
AiService.generateStructured({ task, system, input, schema })
        │  zod → JSON Schema (input shape) → provider; validates the response with zod
        ▼
AiProvider (DI token AI_PROVIDER, chosen by env AI_PROVIDER)
  ├── UnconfiguredAiProvider   none: fails loudly, never fabricates      (default)
  ├── MockAiProvider           mock: explicit fixtures only               (tests)
  └── AnthropicAiProvider      anthropic: official @anthropic-ai/sdk      (AI_MODEL, default claude-opus-5)
```

Feature code depends only on `AiService`. Adding another vendor means one new `AiProvider` class.

## Anthropic provider

- Uses Claude **structured outputs** (`output_config.format: { type: "json_schema", schema }`), so responses are constrained to the schema. `toStructuredOutputSchema` removes keywords the API doesn't accept (length and numeric bounds, `pattern`) and closes every object (`additionalProperties: false`). zod still enforces the full schema afterwards.
- `effort: "low"`, since this is a routine extraction.
- Server-side refusal fallbacks are on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). If the model declines, Anthropic retries on its recommended fallback model.
- The SDK retries 408/409/429/5xx and connection errors (2 retries, 120 s timeout).
- Refusals, truncation (`max_tokens`), missing or non-JSON output, auth errors and 4xx are mapped to `AiProviderError(retryable?)`.
- **Verification status:** unit-tested against a stubbed SDK client. It has **not** been exercised against the live API in this environment, because no credentials were available. Configure it with `AI_PROVIDER=anthropic` plus `ANTHROPIC_API_KEY` (or an `ant auth login` profile).

## Validation, retry and grounding

1. **Schema validation.** Invalid output gets **one controlled retry** (`MAX_AI_ATTEMPTS = 2`). If it still fails, the result is recorded as `INVALID` and nothing from the AI is kept.
2. **Provider failures** are not retried again by the structurer, because the SDK already did. They are recorded as `FAILED` with a safe reason.
3. **Grounding.** Every free-text value the AI returns must occur in the extracted text. Values that don't (invented skills, metrics, companies, headlines) are dropped and counted. For jobs, every requirement's quoted `evidence` must occur in the description and every skill must be mentioned there (by any spelling). An AI-computed years-of-experience figure is always discarded.
4. The outcome is stored in `resume_versions.ai_extraction` as `{ status, content?, provider, promptVersion, attempts, reason?/removedUngroundedValues }`, separate from the deterministic `parsed_data`.
5. A resume is never blocked by AI: the deterministic parse is always available, and the version always goes to `NEEDS_REVIEW` for the user.

## Trust rules (no fabrication)

- The prompt forbids inventing or embellishing; bullets must be copied verbatim, and missing values must be null.
- The deterministic parser only reorganises text that is present. A unit test asserts every extracted string occurs in the source.
- Nothing extracted (by parser or AI) reaches the career profile unless the user selects it in **Add to my career profile**. That import only fills empty fields and adds list items; it never overwrites.
- The UI labels origin. The review banner says "Extracted automatically — please review". The detail page marks items "From your file" or "Added by you" and explains in **Parsing information** whether and how AI was used.

## Provenance kinds

`USER_FACT`, `EXTERNAL_SOURCE`, `AI_INFERENCE`, `AI_SUGGESTION` (`packages/shared/src/provenance.ts`). For resumes:

- `extracted_text` is an external source.
- `parsed_data` and `ai_extraction` are suggestions.
- The confirmed content and the profile are user facts.

## Operational notes

- Parsing and job-analysis AI calls run in background runs. Application-preparation calls run within the request (one at a time per application) and fall back to a deterministic draft on failure.
- Every application-preparation call is recorded in `ai_usage` (operation, provider, model, outcome, attempts; no content).
- The job-analysis prompt forbids inventing requirements, requires verbatim evidence, separates required from preferred, and forbids hiring-chance or ATS claims.
- Logs contain task, provider, attempt counts and validation issue paths. They never contain resume text or AI output.
- To do before scale: per-user usage metering (`Usage` table) and cost limits; fixture-based evals for the structuring prompt.
