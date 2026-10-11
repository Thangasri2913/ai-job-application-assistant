# ADR-0016: AI application preparation (suggestions, cover letters, answers)

## Context

Once an application is tracked with its exact resume version ([ADR-0015](0015-application-tracking.md)), users need help preparing it: tailoring the resume, writing a cover letter and answering application questions. The product's core rule is that it never fabricates candidate information.

AI is optional: this environment runs with `AI_PROVIDER=none`, and the product must work, honestly, without it. Users must stay in control. Nothing is applied or treated as final without explicit review.

## Decision

**One preparation per application** (`application_preparations`).

- It is tied to the application's exact `resume_version_id` (`RESTRICT`), so the lineage is version → preparation → application.
- The original resume version is **never modified**.

**Layered generation, the same pattern as parsing and job analysis.**

1. **Deterministic layer, always available.** Built only from the user's data and the stored match evidence ([ADR-0014](0014-job-analysis-and-resume-matching.md)):
   - **Resume suggestions:**
     - move buried bullets that show required skills or match responsibilities to the top of their role
     - list the job's skills first in the skills section (none added or removed)
     - point out required skills shown only outside work experience
     - for missing requirements, either point to the career profile when it has the skill, or state plainly "The job requires X, but no X experience was found… Do not add X unless you genuinely have this experience."
   - **Cover letter template:** the role and company, the most relevant role with its bullets quoted verbatim, and only the required skills the resume actually shows. Unmet requirements go to `notClaimed` and are never named in the letter.
   - **Answers:** salary, notice period, work authorization and location come from profile preferences, and experience questions from the resume's own lines. Motivation and other personal questions get _"I don't have enough verified information to answer this accurately. Please provide additional information."_ plus a list of what is missing.
2. **AI layer, when a provider is configured.**
   - Operations go through the existing `AiService`, with prompts in one file (`prompts.ts`, `preparation@1`) that start with the non-fabrication principles: `preparation.resume_tailoring` (rewrites of existing lines), `preparation.cover_letter` and `preparation.application_answer`.
   - Output is zod-validated, then **grounded** against the user's verified facts (selected version + career profile). It may not introduce a skill/technology or a number that the data doesn't contain.
   - Rewrites must quote an existing line exactly and may not add any new number.
   - Unsupported output gets one retry with specific feedback. If it fails again, it is discarded, and the user gets the deterministic draft with a note explaining why.
   - Answers must respect stated word/character limits: one retry, then a sentence-aware shortening that is flagged for review.
   - Every AI call is recorded in **`ai_usage`** (user, application, operation, provider, model, outcome, attempts; no content).

**User control and approval.**

- **Suggestions** are PENDING until the user accepts, rejects or edits them. Undo is possible.
  - Gaps and emphasis notes are informational (acknowledge or dismiss) and can't be edited into claims.
  - Rewrites and bullet moves can be edited in the user's own words.
- **Tailored draft:** accepted and edited suggestions produce a tailored draft (`GET …/tailored-resume`) referencing `applicationId`, `jobId` and `sourceResumeVersionId`. It is computed, never written over the version.
- **Cover letters** are versioned (`cover_letter_versions`). Regeneration adds a version and keeps earlier ones, and `generatedText` (what was generated) is kept apart from `text` (current, editable).
  - Status: GENERATED → EDITED → APPROVED. Editing after approval revokes it.
  - Approval stores the letter as a DOCX application document (`COVER_LETTER`), using a small dependency-free writer.
- **Questions** (`application_questions`): `suggestedAnswer` and `userAnswer` are separate columns. Regenerating never overwrites the user's answer.
  - Approval requires an answer within the limits.
  - Limits are parsed from the question ("Maximum 200 words", "max 500 characters") by shared utilities that the UI also uses for its live counter.
- **The preparation as a whole:** NOT_STARTED → READY (something needs review) → REVIEWED (all decided/approved) → **APPROVED** only by an explicit request. Any later change that needs review revokes the approval.

**Robustness.**

- **Concurrency:** generations run within the request. A per-preparation claim (`busy_operation`, expiring after 5 minutes so a crashed request doesn't block forever) refuses concurrent duplicates with `409 AI_GENERATION_IN_PROGRESS`.
- **Rate limits:** generation endpoints share the `analysis` rate limit.
- **Archived applications** are read-only (409).
- **Missing data:** a missing job analysis or resume content gives a clear 409 (`ANALYSIS_NOT_AVAILABLE`, `RESUME_CONTENT_MISSING`).

## Consequences

- The feature is useful and honest with AI off. The deterministic drafts are plainer than AI prose but are built only from verified facts and say what is missing.
- Grounding only checks skills, technologies and numbers; it can't verify every phrase of AI prose. The explicit review step and the "AI generated / user edited / user approved" labels remain essential.
- In-request generation is simple but holds a request for the duration of an AI call (the SDK times out at 120 s). Moving it to the background dispatcher pattern is straightforward if needed.
- The AI path is verified with a mock provider (unit and integration tests through the real app), not against a live model, because no credentials are available here.
