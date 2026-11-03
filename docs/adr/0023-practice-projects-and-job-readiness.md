# ADR-0023: Skill-based interview practice, project challenges and job readiness

- **Status:** Accepted
- **Date:** 2026-10-18
- **Builds on:** [ADR-0017](0017-interview-preparation.md), [ADR-0022](0022-interactive-learning-and-recommendations.md)

## Context

Learners need to move from a lesson to practice, interview preparation and real jobs. The building blocks already existed:

- the application-bound interview module, with a deterministic answer evaluator and a question bank;
- analysed jobs with extracted skill requirements;
- the Learn & Prepare skill model, with its assessment evidence and basis labels.

The goal was to connect these without a second interview module or a second skill matcher.

## Decision

1. **Separate, skill-based interview practice inside Learn & Prepare.**
   - The existing interview sessions require an application, a job and a resume version, and they were left unchanged.
   - A small static catalogue holds practice questions. Each question has a rubric of key concepts with phrase patterns, each linked to the lesson that teaches it, plus an example answer.
   - Feedback is deterministic:
     - concept coverage ("key concepts");
     - clarity and length, from the interview module's `evaluateWithRules`, reused rather than reimplemented.
   - Rubric concepts and example answers are returned only with feedback. Feedback is labelled rule-based and fallible, and says it does not predict interview outcomes. No AI provider is called.
2. **Project challenges** are static, detailed versions of existing course projects. Progress is self-reported (`verification: SELF_REPORTED`); completion requires every acceptance criterion to be ticked. No code is run, uploaded or inspected.
3. **Job readiness** uses the user's own analysed jobs only:
   - job skill names map to catalogue skills through one shared lookup, `createSkillLookup`, which observed demand also uses;
   - the user's side comes from the plan's `assessSkills`, so the same basis labels apply (measured, user-corrected, resume evidence, unknown);
   - skills outside the catalogue are shown, but with no links;
   - the result is counts by basis, never a combined score.
4. **One dashboard.** `GET /learning/dashboard` gains `readiness`: projects, interview practice, skills flagged by diagnostics, real job counts, and one next action. The next action is chosen in a fixed priority order and always comes with its reason.
5. **Storage.** Two additive tables, `learning_interview_attempts` (append-only) and `learning_project_progress` (unique per user and challenge), in migration `20261018100000_learning_practice_and_projects`. They hold no resume data.

## Consequences

- A local migration must be applied before the new pages work. It is additive and safe on a live database.
- Keyword rubrics are transparent but can miss correct answers phrased differently. The UI says so, and the rubric version is stored with each attempt so it can be changed later.
- The question bank is small (21 questions over 13 skills) and AI-drafted, and it has not been expert-reviewed.
- AI-assisted feedback can be added later through `AiService` as a separately labelled source, without changing stored attempts.
