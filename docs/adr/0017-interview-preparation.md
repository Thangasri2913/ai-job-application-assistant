# ADR-0017: Interview preparation and mock interviews

## Context

After preparing an application ([ADR-0016](0016-ai-application-preparation.md)), users want to practise for the interview. Practice should be specific to the job and to what their resume actually shows, with useful feedback. It must never coach them to misrepresent their experience, never invent metrics, and never present practice scores as measurements.

AI is optional (this environment has none). The feature has to stay useful without it, and honest about what it can and can't judge.

## Decision

**Sessions** (`interview_sessions`) belong to one application.

- Each stores the **exact `application_id`, `job_id` and `resume_version_id`** at creation (`RESTRICT` on the version). A newer resume version never changes an existing session.
- **Types:**
  - Practice: `PREPARATION` (mixed), `TECHNICAL`, `BEHAVIORAL` and `HR` give feedback per answer.
  - `MOCK_INTERVIEW`: one question at a time, in order, with feedback revealed only after completion.
- **Settings:** focus (Mixed/Technical/Behavioral/HR), difficulty (Easy/Medium/Hard) and 5/10/15 questions. Defaults: Mixed, Medium, 10.
- **Status:** CREATED → IN_PROGRESS → COMPLETED (or ABANDONED). Completed and abandoned sessions are read-only (`409 INTERVIEW_CLOSED`).

**Questions** (`interview_questions`) are **generated once and stored**. Repeated calls return them; they are not regenerated on every visit.

1. **Rule-based generator** (always available). It draws on the job's stored requirements and responsibilities, the match evidence, the resume version and the profile.
   - **Order:** questions follow a category order set by the focus (introduction, resume, technical, project, role-specific, behavioral, situational, company, HR), with no duplicates.
   - **Technical:** from a curated bank per skill and difficulty (Angular, React, TypeScript, RxJS, REST APIs, Node.js, NestJS, PostgreSQL/SQL, Docker, AWS, WebSockets, GraphQL, testing, Kubernetes, Python, Java), with a generic fallback.
   - **Project:** from the resume's own lines ("Your resume mentions: …").
   - **Role-specific:** from the job's responsibilities.
   - **Gap questions:** ask openly, e.g. "The role requires Docker. What is your experience with Docker or similar tools, and how would you get up to speed?", with a rationale that says to answer honestly.
2. **AI layer** (`interview.generate_questions`, prompts in `interviews/prompts.ts`, `interview@1`).
   - Every prompt starts with the accuracy rules: verified information only; never invent employers, experience, technologies, projects, metrics, certifications, education or achievements; say when information is unavailable; never encourage misrepresentation.
   - Output is zod-validated. Questions are dropped if they duplicate others, **presume experience the candidate lacks** ("your experience with Docker" when Docker isn't in their data), or introduce numbers absent from the job or candidate data.
   - One retry; rule-based questions top up or replace the rest.

**Answers** (`interview_answers`) are stored exactly as submitted (trimmed) and **never updated**. Answering again adds an attempt; a mock interview takes one answer per question.

**Evaluations** (`interview_evaluations`) are separate rows, one per answer.

- **AI** (`interview.evaluate_answer`): overall and seven dimensions (relevance, clarity, technical accuracy, structure, specificity, communication, completeness), STAR levels for behavioral questions, a technical breakdown (correctness, depth, trade-offs, practical experience, clarity), strengths, improvements and feedback. Feedback that hands the candidate numbers they never stated is rejected (retry, then rules).
- **Rule-based** (no AI, or AI failed): topic coverage against the question's expected topics, STAR cue detection, specificity, clarity and filler words, and length against a difficulty target.
  - **Technical accuracy is explicitly not assessed** (null), and the note says so.
  - Improvements never supply results: "Explain the observable result of your action, if you have a genuine result to share."

**Report.** On completion, any unevaluated latest answers are evaluated. The report is computed from the stored evaluations: overall 0–100 (unanswered counts as 0), per-category and per-topic practice scores, and the most common strengths and improvements.

- An optional AI narrative (`interview.generate_report`) is added when available.
- The report is stored, so it is stable across refreshes.
- It is labelled "AI-generated practice feedback" or "Rule-based practice feedback", with a disclaimer that it isn't a measurement or a prediction.

**Operational.**

- **Concurrency:** generation and evaluation run within the request under a per-session claim (`409 AI_GENERATION_IN_PROGRESS`, expiring after 5 minutes), with the `analysis` rate limit.
- **Usage:** AI calls are recorded in `ai_usage`.
- **Audit:** session_created, started, questions_generated, answer_submitted (word count only), answer_evaluated, completed, report_generated, abandoned.
- **Shared context:** context loading is shared with application preparation through `PreparationContextLoader` (moved out of the preparation service), so both features read the same data the same way.
- **Queues:** BullMQ isn't configured, so no queue was introduced.

## Consequences

- Personalised, honest practice works without AI. Rule-based feedback is useful for structure and coverage but can't judge correctness; the UI and notes make that clear.
- Stored questions and reports keep history stable and avoid repeated AI cost.
- In-request generation of 10–15 AI questions or a full mock evaluation can take a while. Moving `complete` to the existing background-dispatcher pattern is the first step if latency becomes a problem.
- Voice/video, speech-to-text and similar features are out of scope.
