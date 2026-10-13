# ADR-0018: Automated job discovery and job alerts

## Context

Users want the product to find jobs for them: saved searches that run on a schedule, compare what they find with every resume, and recommend only jobs worth looking at. This must:

- use only legitimate sources (official APIs or published feeds within their terms);
- never scrape restricted pages, bypass CAPTCHA, bot detection or logins, create accounts, or apply automatically;
- never present sample data as real listings;
- never leak one user's discoveries to another;
- not spam notifications, and stay idempotent when runs are retried.

No real job-board credentials are available here, and BullMQ/Redis is not configured. The existing background pattern is in-process dispatchers ([ADR-0011](0011-resume-parsing-pipeline.md)).

## Decision

**Sources.** A `JobSourceAdapter` abstraction (`searchJobs(criteria, signal)`, `getJobDetails(id, signal)`, `normalizeJob(raw)`).

- **Enabling:** adapters are enabled by `JOB_SOURCES` and register a `job_sources` row (name, kind, development flag, health). Credentials, when a provider needs them, live only in environment variables: never in the database, never in logs, never sent to the browser.
- **Development source:** the only adapter shipped is `dev` (DEV_JOB_SOURCE). It holds built-in fixtures whose companies are marked "(sample)", whose URLs point at example.com, and whose descriptions start "Sample posting (development fixture)". It is refused when `NODE_ENV=production`.
- **Labelling:** jobs from a development source are stored with `is_sample_data`. The UI shows a "Development mode" notice on alerts, recommendations and the job page, and a "Sample data" badge on each card.
- **What sources receive:** only the alert's search terms (keywords, locations, remote preference, employment types, level). They never receive profile or resume data.

**Data model.**

| Table                 | Purpose                                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `job_search_alerts`   | Criteria, minimum score, resume mode (best of all active resumes / default resume), active flag, and schedule (DAILY / WEEKLY / CUSTOM days at a local `HH:mm` in an IANA `timezone`, defaulting to the browser's zone), plus `last_run_at` and `next_run_at` |
| `job_search_runs`     | One row per run, with status RUNNING / COMPLETED / FAILED / PARTIAL, counts and per-source results                                                                                                                                                            |
| `discovered_jobs`     | Internal record of every posting an alert considered, unique per `(user, source, external_id)`. Holds the outcome (RECOMMENDED / BELOW_THRESHOLD / DUPLICATE / ANALYSIS_FAILED), the screening score and the linked job                                       |
| `job_recommendations` | One per `(user, job)`, holding the match score, recommended resume version (plus name/version snapshot), ranking score, explanation, required-skill coverage and status (NEW / VIEWED / DISMISSED / SAVED / APPLIED)                                          |
| `notifications`       | IN_APP (EMAIL/PUSH reserved), unique `(user, dedup_key)`                                                                                                                                                                                                      |

**Jobs stay per user.** There is no global job table: a posting that passes screening becomes the user's own `jobs` row (`origin = DISCOVERED`, `in_library = false`). The existing analysis, Job Details page, matching and application flow then apply unchanged. The recommendation's foreign key to the job is `(job_id, user_id)`, so it can only point at the same user's job. `job_sources` is the only shared table, and it holds no user data. Discovered jobs stay out of the Jobs list until the user saves the recommendation (or tracks an application).

**Pipeline** (`JobDiscoveryService.processRun`). Run Now and the scheduler both call `startRun`, which locks the alert row so only one run per alert is RUNNING (409 `JOB_SEARCH_IN_PROGRESS` for a manual run). The run then:

1. Searches each source with a 20-second timeout. A failing source is recorded with a safe message and never stops the others; the run is PARTIAL if some fail and FAILED if all fail.
2. Normalises each posting: text, URL canonicalisation, and skills via the shared skill normaliser (React.js → React; Java ≠ JavaScript).
3. Applies the alert's criteria. Keyword matching uses canonical skills or whole words; city aliases are recognised (Bangalore = Bengaluru); remote postings pass a location filter unless the alert is on-site only; an unknown employment type or level never excludes a posting.
4. Skips duplicates. It checks known `(source, external_id)` first, then the user's existing jobs: canonical URL, then company + normalised title + location, then same company with ≥ 85% description similarity (word 3-gram Jaccard).
5. Screens the posting with the existing deterministic engine (`analyzeJobText` + `scoreMatch` against every active resume, ranked by `rankMatches`). Postings below `minimumMatchScore` are kept only as `discovered_jobs`.
6. For postings above the threshold, creates the job and runs the full stored analysis (`JobAnalysisService.analyzeNow`), which is the same run, matching and recommendation as a manually added job, with AI if configured. The threshold is checked again on the stored result.
7. Records the recommendation with its ranking and explanation.
8. Sends one notification per run (`dedup_key = run:<id>`) when it recommended something. A failed scheduled run sends at most one notice per alert per day.

At most 15 new jobs are added per run; the rest are considered next time.

**Ranking** (`pipeline/ranking.ts`): match score 45, required-skill coverage 20, resume fit (skills and experience sub-scores) 15, freshness 10 (1 for postings up to a day old, falling to 0 at 30 days), criteria fit 10. Components without data are re-normalised. Salary is not used because sources don't report it reliably.

**Explanations** are built from stored results only, e.g. "Strong match (82%) with “Angular Resume” v1. It shows 3 of 3 required skills." plus the supporting points. They state compatibility, never a chance of being hired.

**Idempotency.** Every write is keyed:

| Key                           | Prevents                       |
| ----------------------------- | ------------------------------ |
| `(user, source, external_id)` | A posting recorded twice       |
| Job `content_hash`            | A job created twice            |
| `(user, job)`                 | A recommendation created twice |
| `(user, dedup_key)`           | A notification sent twice      |

A retried or resumed run therefore changes nothing. A job left behind by an interrupted run (discovered, not in the library, not recommended) is picked up and finished rather than duplicated. Dismissed recommendations are never resurrected. Deleting a discovered job is respected: its posting is not re-added.

**Execution.** BullMQ isn't configured, so we follow the existing in-process pattern:

- **Dispatcher:** `InProcessJobSearchDispatcher` runs one user's runs sequentially and re-queues RUNNING runs at startup. This is safe because the pipeline is idempotent.
- **Scheduler:** `JobAlertScheduler` ticks every `JOB_ALERT_SCHEDULER_INTERVAL_SECONDS` and claims each due alert with a compare-and-set on `next_run_at`. Next runs are computed in the alert's time zone and are correct across DST changes.

## Consequences

- Discovery works end to end with clearly labelled development data. A real provider is one adapter plus an entry in `BUILT_IN_SOURCES`; its terms must be reviewed before it is enabled.
- Reusing the per-user job model means no cross-user sharing of analysis work. Two users finding the same posting each get their own job and analysis. This is simple and safe, and acceptable at the current scale.
- Screening is deterministic. With AI enabled, the stored analysis can differ slightly from screening, so the threshold is re-checked on the stored result.
- In-process scheduling runs on every API instance. The compare-and-set claim prevents double runs, but a queue (ADR-0005) is the next step for many alerts or several instances.

## Update (real job source)

- **Adzuna adapter.** `adzuna` is the first real source: the official Adzuna job search API, with credentials from `ADZUNA_APP_ID` / `ADZUNA_APP_KEY`. It makes at most 4 requests per run and keeps a per-minute and daily request budget. Each displayed ad carries the "Jobs by Adzuna" attribution its terms require.
- **Production rule, enforced in the backend.** A `SampleDataPolicy` (`allowSampleData = NODE_ENV !== 'production'`) does two things: the source registry never activates a development source, and recommendation queries exclude `jobs.is_sample_data`. The startup selection already refused `dev` in production; this is a second guard plus query-level filtering.
- **No schema change.** `jobs.is_sample_data` is set from the source's kind when a posting is stored.

## Update (global real job discovery)

Details are in [JOB-DISCOVERY.md](../JOB-DISCOVERY.md).

- **More real sources, same adapter contract.**
  - **Remotive:** public API, one cached feed request for all alerts, at most 4 a day.
  - **Greenhouse:** public Job Board API, configured employer boards only.
  - **Lever:** public Postings API, configured employer sites only.
  - Shared helpers in `sources/http.ts` give safe error messages, response caching and HTML-to-text conversion.
  - LinkedIn, Naukri and Indeed are listed as **Not integrated**. There is no permitted API, and the app never signs in as the user or scrapes.
- **The employer's posting is preferred.** Descriptors declare `postingOrigin` (`EMPLOYER` / `AGGREGATOR` / `SAMPLE`). Employer postings are processed first in a run. When an employer board lists a job that discovery first took from an aggregator, the discovered job's link and source switch to the employer posting.
- **Search strategy from the Career Profile.** The alert's criteria win. Preferred roles and the current title add alternate titles, and the profile fills locations, remote preference and employment types the alert leaves open. The strategy is stored per run.
- **De-duplication tightened.** The description-similarity rule now also requires the same normalised title and a compatible location, so similar titles or the same role in another city are never merged.
- **Schema (migration `20261013100000_global_job_discovery`, additive only):**
  - `discovered_jobs.discovered_from` (provenance);
  - `job_search_runs.jobs_discovered`, `duplicates`, `jobs_analyzed` and `search_strategy`.
- **API changes:**
  - `GET /job-sources` adds `status`, `postingOrigin` and health fields (`lastSuccessAt`, `lastFailureAt`, `lastError`), and never returns credentials.
  - `GET /recommendations` accepts `source`, `workMode`, `minScore`, `title`, `company` and `location` filters.
