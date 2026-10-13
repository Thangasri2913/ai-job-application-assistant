# Career Intelligence

## Purpose

Career Intelligence learns from the user's own application history:

- which roles, resume versions and job sources get responses;
- whether applications go to jobs that match the user's profile;
- which skills target jobs ask for that the resumes don't show;
- what to practise for interviews.

It completes the loop: jobs → matching → resume recommendation → application → interview → outcome → analytics → insights → better resumes, targeting and preparation.

No machine-learning model is trained. Everything is computed from stored data with transparent rules. Optional AI only words insights, and must cite the computed facts.

Decision record: [ADR-0019](adr/0019-career-intelligence.md). UI: **Career Intelligence** in the navigation (`/career-intelligence`).

## Data sources

All data is read-only and scoped to the signed-in user (`CareerDataLoader`, a fixed number of queries per request).

| Source                                                                             | Used for                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applications` + `application_status_history`                                      | Statuses ever reached, application date, source, rejection category, the exact resume version, and the **match-score snapshot** taken at creation |
| The job analysis the snapshot came from (via `match_analysis_id`)                  | Required skills and seniority **as they were** when the user applied                                                                              |
| `jobs` (active, analysed, in the library or applied to) and their current analysis | Target jobs: required/preferred skills                                                                                                            |
| `match_analyses` (best resume per job, and per resume version)                     | Skill coverage evidence; jobs matched and average score per version                                                                               |
| `discovered_jobs`                                                                  | Work arrangement (remote/hybrid/on-site) for discovered jobs                                                                                      |
| Completed `interview_sessions` reports                                             | Practice scores per topic                                                                                                                         |

Historical values are never recomputed. Re-analysing a job changes the job's current analysis, but not the score stored with an existing application.

## Application outcomes

The statuses are SAVED, PREPARING, APPLIED, RECRUITER_SCREEN, ASSESSMENT, INTERVIEW, TECHNICAL_INTERVIEW, FINAL_INTERVIEW, OFFER, ACCEPTED, REJECTED, WITHDRAWN and NO_RESPONSE. Recruiter review and screening map to RECRUITER_SCREEN and ASSESSMENT.

Optional, voluntary details:

- **Rejection category** (with REJECTED): skills didn't match, experience level, position filled, location or work arrangement, compensation, other. The free-text reason is kept as written.
- **Offer details** (with OFFER or ACCEPTED): free text.
- **Date it happened** (`occurredOn`, any status change): not in the future and not before the application date. The time it was recorded is kept separately.

History is append-only. Going back one status is allowed (to correct a mistake), but it adds a history entry rather than deleting one.

## Definitions

| Term                                        | Definition                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracked                                     | Every application, including saved and preparing ones                                                                                               |
| Submitted                                   | Has an application date, or ever entered a status after submission. **Only submitted applications count in rates**                                  |
| Stage reached                               | Highest stage ever entered: applied < screening (recruiter screen or assessment) < interview (incl. technical) < final interview < offer < accepted |
| Response                                    | Reached screening or later, or was rejected (a rejection is a response)                                                                             |
| Interview                                   | Reached any interview stage, or an offer                                                                                                            |
| Offer                                       | Reached an offer (accepted ones included)                                                                                                           |
| Interview rate / offer rate / response rate | Interviews / offers / responses ÷ submitted applications                                                                                            |
| Interview → offer rate                      | Offers ÷ interviews                                                                                                                                 |

**Funnel.** The stages are Tracked → Applied → Screening → Interview → Final interview → Offer → Accepted. Each stage counts applications that reached it **or a later stage**, and each shows its conversion from the previous stage. Because stages are cumulative, an application that skipped one (e.g. no final interview) still counts as having passed it. The exact "ever entered" count per status is also returned.

**Breakdowns** group submitted applications by:

- period (month);
- source (the application source, else the job's source);
- role (normalised title, e.g. "Front-end Engineer" = "Frontend Developer");
- company;
- location (city aliases unified);
- work arrangement;
- seniority;
- required skill;
- weekday of application.

**Resume performance** is reported per **exact resume version** used. It covers every active resume's current version and every version used in an application, including archived resumes and older versions. It shows applications and outcome rates, the distinct jobs the version was compared with, and its average match score across those comparisons.

**Match-score performance** uses the stored snapshot, in buckets 0–49, 50–64, 65–79, 80–89 and 90–100 (only buckets with data are shown). Submitted applications without a stored score (created before the job was analysed) are counted separately and excluded. "Aligned share" is the share of scored applications at 65 or above.

**Skill intelligence** is computed across analysed target jobs. For each skill it reports how many jobs list it, how many require it, and the best-matching resume's evidence per job (shown, partial, not found).

| Coverage         | Rule                                       |
| ---------------- | ------------------------------------------ |
| Well covered     | Shown in at least 60% of the jobs compared |
| Limited evidence | Not found in at least half                 |
| Partly covered   | Otherwise                                  |

A skill is a **gap** ("worth strengthening") when it appears in at least 3 target jobs and has limited evidence. The outcomes of applications whose job required the skill are shown alongside.

**Interview practice topics** show the average practice score per topic across completed sessions. These are practice feedback, not measurements.

## Insufficient-data rules

Small samples produce counts, not conclusions. The thresholds are constants in `@job-assist/shared`.

| Rule                                                                                                     | Value                                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A rate with a zero denominator                                                                           | `null`, shown as "—", **never 0%**                                                                                                |
| A group is "reliable"                                                                                    | ≥ 5 applications (`CAREER_MIN_GROUP_SIZE`); smaller groups show their counts with a **Limited data** label and are never compared |
| Outcome patterns (strongest role, resume, source, location, work arrangement; match-score trend; timing) | ≥ 10 submitted applications (`CAREER_MIN_APPLICATIONS_FOR_PATTERNS`) and at least two reliable groups that actually differ        |
| Frequent skills / recurring gaps                                                                         | Skill appears in ≥ 3 analysed target jobs (`CAREER_MIN_SKILL_JOBS`)                                                               |
| Recurring rejection reason                                                                               | ≥ 3 rejections with a recorded category                                                                                           |
| Confidence of a statement                                                                                | By its smallest sample: LOW < 10, MEDIUM < 30, HIGH otherwise                                                                     |

The dashboard always states the limitations that apply. For example: "You have 3 submitted applications. At least 10 are needed before reliable performance patterns can be identified." Tables explain that "—" means the rate can't be calculated, and the role and source sections say when nothing can be compared yet.

## Insights

1. **Facts.** The report is turned into numbered facts (`F1`, `F2`, …): computed statements with a sample size and a confidence. Examples:
   - "React appears in 6 of your 9 analysed target jobs (required in 4); your best-matching resume showed limited evidence for it in 5 of them."
   - "Angular Developer had a 50% interview rate across 6 applications, compared with 17% across 6 applications in your other roles with enough data."
2. **Rule-based insights (always available).** Each kind of fact maps to an insight in a category: STRENGTH, WEAKNESS, OPPORTUNITY, RISK, RECOMMENDATION, SKILL_PRIORITY, RESUME_RECOMMENDATION, TARGETING_RECOMMENDATION or INTERVIEW_PREPARATION. Each has a title, the fact as its explanation, and one recommended action. The wording is careful: "appears frequently", "limited evidence found", "consider highlighting it if it genuinely reflects your experience". Below the pattern threshold, a "Record outcomes to unlock patterns" insight explains why nothing is compared.
3. **AI insights (optional).**
   - **Path:** the existing `AiService.generateStructured` (provider-agnostic, zod-validated). Task `career.generate_insights`, prompt version `career-insights@1`.
   - **Input:** only the fact statements. No resume text, contact data, company names beyond what facts state, or identifiers.
   - **Each insight must:**
     - cite at least one existing fact id;
     - use only numbers that appear in its cited facts;
     - mention only skills that appear in its cited facts;
     - never promise interviews, offers or hiring.
   - **Confidence** is capped at the confidence of the cited facts.
   - **Rejection:** non-conforming insights are dropped. If none survive (or the output fails the schema), there is one retry with a correction, and then the rule-based insights are used, with a note saying so. The rejected output is never stored.
   - **Usage** is recorded in `ai_usage`.

**Evidence requirement.** Every stored insight carries its evidence: the cited facts' **computed statements**, never AI-written text. So the user can always see why an insight exists, and the AI cannot invent evidence. The UI shows each insight's category, confidence, explanation, recommended action and expandable evidence, labelled "Rule-based" or "AI-generated".

**Storage and freshness.**

- **Storage:** insights are stored per run (`career_insight_runs`, `career_insights`) with:
  - the generation time and expiry (7 days);
  - the source (AI or rules), and the provider/model and prompt version when AI;
  - the number of applications analysed;
  - a fingerprint of the facts used.
- **No AI on page load.** Opening the page never calls the AI.
- **Automatic refresh:** when the current facts' fingerprint differs from the latest run's (the data changed) or the insights expired, a background run starts once. Each fingerprint is attempted once, so failures don't loop.
- **Refresh insights** starts a run on demand (409 while one is running; the button is disabled meanwhile, and the page reports progress and success).
- **Execution:** runs use the in-process dispatcher and are re-queued after an API restart.

## Privacy

- Every endpoint computes from the signed-in user's own data. There are no ids in the paths, and the backend enforces ownership; the frontend never filters data for security.
- An e2e test and the browser smoke test verify that another user sees only their own (empty) analytics and insights.
- The AI receives only computed statistics about the user's own history, never credentials, contact details, resume text or infrastructure information.
- No chain-of-thought is stored. Only conclusions and the cited facts are kept.

## API

All under `/api/v1`, authenticated.

| Method | Path                                    | Returns                                                                                                                     |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/career-intelligence/overview`         | The full report: totals, funnel, breakdowns, resume versions, match scores, skills, interview topics, patterns, limitations |
| GET    | `/career-intelligence/funnel`           | `{ totals, funnel }`                                                                                                        |
| GET    | `/career-intelligence/resumes`          | Resume-version performance                                                                                                  |
| GET    | `/career-intelligence/skills`           | `{ skills, interviewTopics }`                                                                                               |
| GET    | `/career-intelligence/roles`            | Breakdown by role                                                                                                           |
| GET    | `/career-intelligence/sources`          | Breakdown by source                                                                                                         |
| GET    | `/career-intelligence/match-scores`     | Outcomes by stored match score                                                                                              |
| GET    | `/career-intelligence/patterns`         | `{ patterns, limitations }`                                                                                                 |
| GET    | `/career-intelligence/insights`         | Latest run, its insights with evidence, `stale`, `generating`, `aiEnabled`, disclaimer                                      |
| POST   | `/career-intelligence/insights/refresh` | 202; regenerate now (409 `INSIGHTS_IN_PROGRESS`; analysis rate limit)                                                       |

Outcome fields on applications: `POST /applications/:id/status` accepts `rejectionCategory`, `offerDetails` and `occurredOn`; `PATCH /applications/:id` accepts `rejectionCategory` and `offerDetails`. Details: [API.md](API.md).

## Limitations

- Statistical power is low by design: a handful of applications yields counts, not patterns.
- Funnel stages are cumulative, so the funnel isn't an exact sequence of steps. Use the per-status "ever reached" counts for that.
- Work arrangement is only known for discovered jobs. Manually added jobs show "Not specified".
- Applications created before their job was analysed have no stored match score and no snapshot skills, so they are excluded from those views.
- Analytics are computed per request. This is fine for one user's history; persisting the report with each run is the next step if it ever gets slow.
- Skill coverage reflects what the resumes **state**, not what the user can do.
