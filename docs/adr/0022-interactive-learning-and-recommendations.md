# ADR-0022: Interactive learning, saved progress and resume-based recommendations

- **Status:** Accepted
- **Date:** 2026-10-17
- **Builds on:** [ADR-0021](0021-learn-and-prepare.md)

## Context

Phase 1 delivered a read-only catalogue of role paths. Phase 2 has three goals:

- users can browse courses by skill and field;
- they learn by doing (quizzes, code reading, scenarios) and keep their progress;
- they get a plan from their own resume.

It has to do this without overstating what the evidence shows:

- a resume mention is not mastery;
- finishing a lesson is not a skill;
- a curated skill list is not a market statistic.

## Decision

1. **Courses replace paths.** A course has a format (career track or skill course), a category, several roles, skill ids from a skill registry, levels 1–6 (0 is the diagnostic), publication status and `lastReviewedOn`. The Phase 1 `/learning-paths` endpoints were unreleased and are replaced by `/learning/...`.
2. **Interactive activities with server-side answers.** Activities are authored with answers, validated by zod schemas at start-up, and served **without** answers. The server grades submissions deterministically, by comparing text; **nothing is ever executed**. Checklists are self-assessed. Reflections and revision cards stay in the browser.
3. **Progress in five additive tables**, each separating a different kind of fact: enrolment, lesson completion (self-reported), activity attempts (practice), assessment attempts (diagnostics) and skill evidence (assessment-derived only). Catalogue ids are stored as text, so content stays in code.
4. **Recommendations are deterministic and stateless.**
   - Resume content is read through `ResumesService` (owner-scoped). It is matched literally against the skill registry and never sent to an AI provider, written or stored.
   - Proficiency is `UNKNOWN` unless a diagnostic measured it.
   - User corrections travel with each request and are not stored.
5. **Two labelled evidence sources:**
   - curated role profiles, which state that they are not market statistics;
   - skills observed in the user's **own** analysed jobs, with counts, dates and limitations, and with sample data excluded.

   External labour-market sources can be added later as further `SkillDemandReport` sources.

6. **AI generation foundation only.** `PracticeActivityGenerator` uses `AiService`. Its output must pass the activity schema, links are rejected, and its provenance is always AI-generated and unreviewed. It is disabled without a provider and is not exposed yet.

## Consequences

- A migration is required (`20261017100000_learning_progress`). It is additive and safe on a live database, and it must be applied with `prisma migrate deploy`.
- Content changes still need a deploy. Stable ids mean progress survives content edits; removed content is skipped as retired.
- Grading by text comparison limits activity types to ones with unambiguous answers. Free-form code exercises remain self-checked until a safe evaluator exists.
- Recommendations are explainable but literal: synonyms described in prose can be missed, which is why users can correct the skill list.
- Not storing the resume analysis means the plan is recomputed on each request. That is cheap, and it avoids keeping derived personal data.
