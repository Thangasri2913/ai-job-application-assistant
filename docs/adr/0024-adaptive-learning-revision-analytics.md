# ADR-0024: Adaptive next steps, revision scheduling, learning analytics and preferences

- **Status:** Accepted
- **Date:** 2026-10-19
- **Builds on:** [ADR-0022](0022-interactive-learning-and-recommendations.md), [ADR-0023](0023-practice-projects-and-job-readiness.md)

## Context

Learn & Prepare already records each user's course selections, lesson completions, every practice answer, diagnostics with per-skill evidence, interview attempts and project progress. Phase 5 needed to:

- suggest the next step from that evidence;
- offer revision;
- show honest analytics;
- let learners set preferences.

It had to avoid creating new progress tables or a second dashboard.

## Decision

1. **Compute, don't store.**
   - Revision, next steps and analytics are pure functions over the user's persisted records (`adaptive/revision.ts`, `next-steps.ts` and `analytics.ts`), evaluated on request.
   - They are deterministic for a given time and set of records, and unit-tested.
   - The existing dashboard gains `analytics`. Its `nextAction` becomes the top-ranked step, and its revision list follows the revision schedule.
2. **Revision schedule, a plain rule of thumb:**
   - tries within 10 minutes of each other form one visit;
   - a wrong answer is due now;
   - an answer corrected in the same visit comes back after 1 day;
   - after one later visit answered correctly first time, it comes back after 3 days;
   - after two such visits it is cleared.

   Other questions from the same lesson are offered as alternatives. Diagnostic questions answered wrong (skipped ones are excluded) and concepts missing from the latest interview answer also become topics. The rule is documented in the UI and is not claimed to be scientifically tuned.

3. **Ranked next steps, in a fixed order:**
   1. practice mistakes that are due;
   2. a project in progress;
   3. the next lesson;
   4. a pending diagnostic;
   5. diagnostic or interview topics to revise;
   6. target-role skills;
   7. skills in the user's own analysed jobs;
   8. courses whose prerequisites are complete;
   9. interests;
   10. general defaults.

   Every step carries a reason built from the user's data, the facts behind it, and a confidence level. Confidence is LOW for sparse evidence (a single diagnostic answer, one analysed job, defaults) and HIGH for repeated mistakes or measured results. Role skills use the plan's `assessSkills`, with the default resume when one exists; the resume content is read and never copied. Users can dismiss a step and restore dismissed ones.

4. **Analytics only from persisted data:**
   - accuracy is based on each question's **first** attempt, so repeating one question cannot inflate it, and is withheld below 5 different questions;
   - lessons marked complete are reported separately from questions attempted;
   - skills are shown as measured, too few questions, or unknown;
   - the week's figure is an estimate from completed lessons' stated lengths;
   - there are no streaks and no combined score.
5. **One additive table, `learning_preferences`**, with one row per user: optional target role, interest categories and skills, an optional weekly goal from fixed choices, and dismissed step keys. The plan's skill corrections are still not stored, and nothing writes to the resume or the career profile.

## Consequences

- Migration `20261019100000_learning_preferences` is required for preferences and dismissals. It is additive.
- Recomputing on every request is cheap at the current data volumes. If it becomes slow, the snapshot can be cached per user without changing the rules.
- The scheduling intervals and ranking order are explicit constants, so they are easy to adjust and to test.
