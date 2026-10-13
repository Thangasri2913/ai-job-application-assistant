# ADR-0019: Career intelligence and the outcome learning loop

Full reference (definitions, thresholds, API): [CAREER-INTELLIGENCE.md](../CAREER-INTELLIGENCE.md).

## Context

Users track jobs, match scores, the exact resume version used, applications, interviews and outcomes. They want to learn from that history: which roles, resumes and sources lead to interviews, whether they apply to well-matched jobs, which skills their target jobs ask for that their resumes don't show, and what to practise.

Constraints:

- **Accuracy.** Metrics must never be invented, outcomes never inferred, and historical match scores never recomputed. Small samples must not produce confident claims.
- **AI is optional.** Production runs `AI_PROVIDER=none`, so the feature has to work without AI.
- **Infrastructure.** No ML platform and no new queue.

## Decision

**Outcomes** extend the existing application model rather than adding a parallel one:

- `ApplicationStatus` gains `TECHNICAL_INTERVIEW` and `ACCEPTED`. The existing `RECRUITER_SCREEN` and `ASSESSMENT` cover recruiter review and screening.
- New optional, voluntary fields:
  - `applications.rejection_category` and `applications.offer_details` (the free-text rejection reason stays as written);
  - `application_status_history.occurred_on`, the date a step actually happened (`changed_at` remains when it was recorded).
- Validation:
  - a category only with REJECTED;
  - offer details only with OFFER or ACCEPTED;
  - `occurred_on` neither in the future nor before the application date.
- History stays append-only. `applications.match_score` remains the snapshot taken at creation; re-analysing the job never changes it.

**Analytics** (`career-intelligence/analytics`) are pure functions over records loaded read-only in a fixed number of queries (`CareerDataLoader`). They are computed per request from PostgreSQL, the source of truth; no analytics cache is stored.

| Term          | Definition                                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submitted     | Has an application date or ever entered a post-submission status. Only submitted applications count in rates.                                                                                                                                                                                                     |
| Stage reached | The highest stage ever entered, from the append-only history plus the current status, with ranks applied < screening (recruiter screen or assessment) < interview (incl. technical) < final interview < offer < accepted. The funnel is cumulative: a stage counts applications that reached it or a later stage. |
| Response      | Reached screening or later, or was rejected.                                                                                                                                                                                                                                                                      |
| Interview     | Reached any interview stage, or an offer.                                                                                                                                                                                                                                                                         |
| Offer         | Reached an offer.                                                                                                                                                                                                                                                                                                 |
| Rates         | numerator / denominator, `null` when the denominator is 0 (never 0% or 100% from nothing).                                                                                                                                                                                                                        |
| Reliable      | A group has at least `CAREER_MIN_GROUP_SIZE` (5) applications. Smaller groups are shown, labelled "limited data", and never compared.                                                                                                                                                                             |
| Patterns      | Comparisons need at least `CAREER_MIN_APPLICATIONS_FOR_PATTERNS` (10) submitted applications and two reliable groups that actually differ.                                                                                                                                                                        |

The report contains:

- **Breakdowns** by period, source, role (normalised title), company, location, work arrangement, seniority, required skill (from the analysis the score snapshot came from) and weekday.
- **Resume performance** per exact resume version: applications and outcomes, plus the jobs matched and the average match score from stored match analyses. Archived resumes and older versions stay visible.
- **Match-score buckets** (0–49, 50–64, 65–79, 80–89, 90–100) using the stored snapshot. Unscored applications are counted separately.
- **Skill intelligence** across analysed target jobs. Coverage comes from the best-matching resume's stored evidence. A skill is a "gap" when it appears in at least 3 target jobs and at least half of them show no evidence.
- **Interview practice topics** from completed session reports.
- **Rejection categories.**
- **Data-limitation messages.**

**Insights.**

- **Facts.** The report is turned into numbered facts: computed statements with a sample size and a confidence (LOW < 10, MEDIUM < 30, HIGH otherwise, by the smallest sample a statement relies on).
- **Rules (always available).** Each fact kind maps to an insight in one of the categories STRENGTH … INTERVIEW_PREPARATION, with careful wording ("appears frequently", "limited evidence", "if it genuinely reflects your experience"). Below the pattern threshold, a "Record outcomes to unlock patterns" insight explains why nothing is compared.
- **AI (optional)** goes through `AiService.generateStructured` (provider-agnostic, zod-validated, `career.generate_insights`, prompt `career-insights@1`):
  - The AI receives only the fact statements; no resume text, contact data or identifiers.
  - Each insight must cite existing fact ids.
  - It may not introduce numbers or skills absent from its cited facts, and may not promise outcomes.
  - Confidence is capped by the cited facts' confidence.
  - Invalid output gets one corrective retry; after that, the rule-based insights are used and the run notes why.
- **Evidence** is always stored as the cited facts' computed statements, never AI text, so the AI cannot invent evidence.
- **Usage** is recorded in `ai_usage`.

**Storage and freshness.**

- `career_insight_runs` stores status, trigger (AUTO/MANUAL), source (AI/RULES), provider/model and prompt version, the data fingerprint (a hash of the facts plus the analytics version), the number of applications analysed, a note or error, and generated/expires timestamps (7 days).
- `career_insights` stores category, title, explanation, evidence (JSON) and evidence refs, confidence, recommended action, source type and timestamps. They are indexed by `(user_id, category, generated_at)`.
- Regeneration:
  - Page loads never call the AI.
  - `GET /insights` starts a background run only when the current fingerprint differs from the latest run's, or the insights expired. Each fingerprint is attempted once automatically, so failures don't loop.
  - `POST /insights/refresh` forces a run (409 `INSIGHTS_IN_PROGRESS` while one is active; a run idle for 10 minutes is treated as abandoned).
- Runs execute on an in-process dispatcher, like job analysis. Unfinished runs are re-queued at startup, and processing is idempotent.

**Boundaries and privacy.**

- The module reads applications, jobs, analyses, matches, resumes and interview sessions read-only, scoped by `user_id`. It writes only its own two tables.
- Every endpoint is computed for the signed-in user. There are no ids in paths, so there is nothing to probe.

## Consequences

- The analytics are transparent and testable, and stay correct as data changes, without a cache to invalidate.
- They are computed per request, which is fine at single-user scale. If it ever gets slow, the first step is to persist the report alongside the run.
- Statistical power is low by design: small samples produce counts, not conclusions. The thresholds are constants in `@job-assist/shared`.
- Funnel stages are cumulative, so an application that skipped a stage (e.g. no final interview) still counts as having passed it. The `everReached` counts give the exact per-status numbers.
- Work arrangement is only known for discovered jobs; manually added jobs show "Not specified".
