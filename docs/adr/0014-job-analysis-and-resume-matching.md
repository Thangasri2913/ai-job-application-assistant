# ADR-0014: Job analysis and deterministic resume matching

## Context

The core promise of the product is: given a job posting, tell the user which of their resumes fits best, and why. Users keep several resumes for different directions (Angular, full stack, React…), so the comparison has to cover all of them, and the result must be explainable, repeatable and honest. It is a compatibility indicator, not a hiring prediction. The application later needs to record which exact resume version was used for an application.

## Decision

**Intake.** The user pastes a posting: title, company and description (≥ 80 characters), plus optional URL, location, employment type and source. No scraping.

- The description is whitespace/bullet-normalised.
- A `content_hash` (title + company + normalised text) is unique per user, so submitting the same job twice gives `409 DUPLICATE_JOB` with `meta.existingJobId`.

**Analysis is layered, like resume parsing ([ADR-0011](0011-resume-parsing-pipeline.md)):**

1. **Rule-based analyser** (`job-analyzer@1`), always run.
   - It splits the posting into sections (requirements, nice-to-have, responsibilities; benefits and company blurbs are ignored).
   - It detects skills with the shared skill dictionary plus a normaliser.
   - It extracts years of experience, degree requirements, responsibilities and other stated requirements.
   - Each requirement quotes its line as `evidence`.
   - Importance is `REQUIRED` or `PREFERRED`, and `origin` is `EXPLICIT` (stated by heading or wording) or `INFERRED` (mentioned elsewhere, treated as required).
2. **Optional AI layer** (`job.analyze`, `job-analysis@1`), only when `AI_PROVIDER` ≠ `none`.
   - It goes through `AiService` with a strict zod schema and one controlled retry on invalid output.
   - It is then grounded: every item's evidence must occur in the description, and every skill must actually be mentioned. Anything else is dropped and counted.
   - AI items are merged only where they add something or settle an importance the rules could only infer.
   - The AI summary is stored separately and labelled AI-generated.
   - Invalid or failed AI output is recorded (`aiStatus`) and never stored as data.
3. A posting with no skills, responsibilities or experience requirements fails with a clear message, rather than producing meaningless scores.

**Normalisation** merges only spellings of the same technology (React.js → React, Postgres → PostgreSQL, Nest → NestJS).

- Different technologies are never merged: Java ≠ JavaScript, React ≠ React Native, PostgreSQL ≠ MySQL, Angular ≠ AngularJS.
- Compound names are detected first, so "React Native" never counts as React.
- Closeness between different skills (TypeScript~JavaScript, NestJS→Node.js, Next.js→React…) is a separate, small, directional list and earns partial credit only.

**Matching is deterministic application logic** (`match-scoring@1`). The AI is never asked "which resume is best".

- **Subjects:** the career profile, plus the **current version of every ACTIVE resume**.
  - Archived resumes are never compared.
  - Resumes without a reviewed version are listed as "not compared", with the reason.
  - Only stored, user-confirmed content is used.
- **Dimensions and default weights** (in `scoring-config.ts`): skills 40, experience 25, responsibilities 15, projects 10, education 5, keywords 5.
  - A dimension the job doesn't mention is left out and the weights are re-normalised.
  - **Skills:** credit by where the skill is evidenced:

    | Where the skill is found   | Credit |
    | -------------------------- | ------ |
    | Work experience            | 1.0    |
    | Skills section             | 0.8    |
    | Projects or certifications | 0.5    |
    | Summary                    | 0.4    |
    | Related skill              | 0.3    |
    | Missing                    | 0      |

    Preferred skills weigh half as much as required ones.

  - **Experience:** years against the stated minimum (70%) and previous role titles against the job title (30%).
  - **Responsibilities:** word/skill overlap with a single resume line, quoted as evidence.
  - **Projects:** share of the job's skills shown in projects.
  - **Education:** degree level against the requirement; half credit when "or equivalent experience" applies.
  - **Keywords:** coverage.
- **Score bands:** 0–49 Low, 50–69 Moderate, 70–84 Strong, 85–100 Excellent. The score is always called "AI-assisted job compatibility score".
- **Evidence:** every skill, responsibility, experience and education judgement carries evidence that cites the stored data, and strengths and gaps are built only from that evidence.
- **Ranking and recommendation:**
  - Order: overall score, then skills, then experience, then the default resume, then the most recently activated version, then version id (a total order, so ties are deterministic).
  - The top resume becomes the `ResumeRecommendation`. Its reasons and gaps are derived from the stored match results.
  - The user may choose any compared resume instead (`jobs.selected_resume_version_id`).

**Storage and history.**

- **Analysis runs:** each run is a `job_analyses` row (PENDING → RUNNING → COMPLETED/FAILED), and runs are kept. `jobs.current_analysis_id` points at the latest completed run.
- **Requirements:** stored per run in `job_requirements`.
- **Matches:** `match_analyses` has one row per subject per run, scores as columns, and evidence as JSONB. Each row points at the **exact `resume_version_id`** and keeps a name/version snapshot.
  - A later version never replaces it. The next run creates new rows, and the API flags older results as `stale` when the user's current resume versions differ.
  - Deleting a whole resume nulls the reference but keeps the snapshot.
- **Recommendations:** one per completed run in `resume_recommendations`.
- **Re-runs:** a re-run with the same inputs produces the same scores.

**Execution.** Analysis runs in the background on the in-process dispatcher pattern already used for parsing (`POST /jobs/:id/analyze` → 202; the UI polls the job).

- Unfinished runs are re-queued at startup.
- A row lock prevents two concurrent runs (`409 ANALYSIS_IN_PROGRESS`).
- Redis/BullMQ is still not configured; the `JobAnalysisDispatcher` abstraction allows swapping in a queue later ([ADR-0005](0005-background-jobs.md)).
- Starting analyses has its own rate limit (`JOB_ANALYSIS_RATE_LIMIT_MAX`).

**Ownership.**

- Every query is scoped by the authenticated user.
- `match_analyses` has a composite foreign key `(job_id, user_id) → jobs(id, user_id)`.
- Choosing a resume only accepts the current version of the user's own active resume.
- Another user's ids behave like missing ones (404).

## Consequences

- Scores are explainable and reproducible, and they work with no AI provider at all. The AI can only add evidence-backed requirements, never change the scoring.
- Rule-based extraction will miss requirements phrased in unusual ways; the optional AI layer and the visible evidence mitigate this. The skill dictionary needs ongoing curation.
- Word-overlap responsibility matching is deliberately conservative: it under-credits paraphrases rather than inventing coverage.
- Resumes without a projects section score 0 on projects (10% weight). This is visible in the breakdown, and the weights can be tuned in one file.
- Future applications can reference `resume_version_id` (and the match/recommendation that justified it) without schema changes to resumes.
