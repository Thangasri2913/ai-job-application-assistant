# Job discovery: real jobs from legitimate sources

This document covers how job alerts find **real** jobs, which sources exist, how to configure them, and the rules they follow. Background and earlier decisions are in [ADR-0018](adr/0018-job-discovery-and-alerts.md).

## Flow

```
Job alert + Career Profile
  → search strategy (alert terms first, profile fills the gaps)
  → every enabled source, in sequence (one failing source never stops the others)
  → normalise into the common posting shape (nothing invented)
  → alert criteria (keywords, locations, remote, employment type, level)
  → employer postings first, then de-duplication
  → screening against ALL active resume versions (same engine as manual jobs)
  → add job + full job analysis → recommendation with evidence
  → one notification per run, run history with per-source results
```

Run Now and the in-process scheduler use the same pipeline (`JobDiscoveryService.processRun`). Nothing is ever submitted or applied for automatically.

## Search strategy

`pipeline/search-strategy.ts` builds the terms a run uses from the alert and the stored Career Profile. It is rule-based, not AI-generated.

- **The alert's own criteria always win.** The profile never overrides them.
- **Keywords:** the alert's keywords, followed by alternate titles from the profile: preferred roles and the current job title.
- **Locations:** the alert's locations. If the alert has none, the profile's preferred locations, and failing that the profile's location.
- **Remote preference:** the alert's, unless it is "Any". Then it is derived from the profile's preferred work modes:
  - only remote → remote;
  - remote and/or hybrid → hybrid or remote;
  - on-site and/or hybrid → on-site.
- **Employment types:** the alert's. If the alert has none, the profile's.
- **Experience level:** the alert's only. A level is never guessed from years of experience, because a wrong guess would exclude jobs.
- **Skills are not search terms.** Each resume's skills are used when matching.

The strategy each run used is stored on the run (`job_search_runs.search_strategy`) and shown in the run history. It includes which parts came from the profile. Only these search terms reach a job source, never the resume, profile text or contact details.

## Sources

| Key          | Source                   | Mechanism                                                                               | Credentials                                                          | Posting origin                                 | Status                                            |
| ------------ | ------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `adzuna`     | Adzuna                   | Official job search API `api.adzuna.com/v1/api/jobs/{country}/search/1`                 | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (register at developer.adzuna.com) | Job search service (links to Adzuna's ad page) | Implemented, tested with mocked responses         |
| `remotive`   | Remotive                 | Public API `remotive.com/api/remote-jobs`                                               | None                                                                 | Job search service (links to Remotive)         | Implemented, tested with mocked responses         |
| `greenhouse` | Greenhouse               | Public Job Board API `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`     | None. You name the boards in `GREENHOUSE_BOARDS`                     | **Employer's own board**                       | Implemented, tested with mocked responses         |
| `lever`      | Lever                    | Public Postings API `api.lever.co/v0/postings/{site}?mode=json` (EU: `api.eu.lever.co`) | None. You name the sites in `LEVER_SITES`                            | **Employer's own site**                        | Implemented, tested with mocked responses         |
| `dev`        | Development sample jobs  | Built-in fixtures                                                                       | None                                                                 | Sample data                                    | Development and tests only; refused in production |
| —            | LinkedIn, Naukri, Indeed | —                                                                                       | —                                                                    | —                                              | **Not integrated** (see below)                    |

No source has been called live from this repository's tests or by the developer while building it. Live behaviour depends on each provider's real responses and terms.

### Terms each adapter follows

**Adzuna**

- Every ad is shown with **"Jobs by Adzuna"** linking to Adzuna's local site.
- The default allowance is 25 requests per minute and 250 per day. Each run makes at most 4 requests, and the server enforces 20 per minute and `ADZUNA_DAILY_REQUEST_LIMIT`.
- Commercial organisations get a trial and may need a licence. Check that your use fits Adzuna's terms.

**Remotive**

- Each job links back to its Remotive URL, and the source is named "Remotive", with **"Jobs from Remotive"** next to it.
- Remotive asks for no more than about 4 requests a day and blocks more than 2 a minute. One cached feed request (6-hour cache, capped at `REMOTIVE_DAILY_REQUEST_LIMIT` ≤ 4 per day) serves every alert and every user. Keyword filtering happens locally.
- The public feed is delayed by 24 hours. Every job is remote.
- Remotive forbids sending its jobs to other job boards (Google Jobs, LinkedIn Jobs, Jooble and so on). This app only shows them to the signed-in user.
- Remotive also states that using its jobs to collect sign-ups or emails is a breach. This app needs an account to use. **Decide whether your deployment complies before enabling `remotive`.** It is therefore not in the default production `JOB_SOURCES`.

**Greenhouse**

- "Job Board data is publicly available, so authentication is not required for any GET endpoints."
- Only the boards you list are read. The app never crawls or guesses boards.
- Each board is cached for 1 hour, and at most 4 boards are fetched at once.
- The employer name is the one you configure, or the board's own name from `GET /v1/boards/{token}`.

**Lever**

- This is the public, unauthenticated Postings API that employers' job sites are built on.
- Only the sites you list are read. Each site is cached for 1 hour.
- Lever postings carry no company name, so the employer name is the one you configure as `site=Name`. If you give none, the site name you configured is used. It is never guessed.

### Not integrated: LinkedIn, Naukri, Indeed

The app does not search these sites:

- None offers a public job search API this app is permitted to use.
- Signing in with a user's account, storing their passwords, bypassing CAPTCHA, 2FA or bot protection, or scraping their pages would breach their terms. This app does none of these.

The source list shows them as **Not integrated**. Adding one later requires an official, permitted API or feed: implement a `JobSourceAdapter` (see below).

## Configuration

```bash
JOB_SOURCES=adzuna,greenhouse,lever        # comma-separated keys from the table above
ADZUNA_APP_ID=…  ADZUNA_APP_KEY=…          # secrets: Render only, never in git
ADZUNA_COUNTRY=in
GREENHOUSE_BOARDS=acme,globex=Globex Corp  # board tokens, optionally "token=Employer name"
LEVER_SITES=initech=Initech                # site names, optionally "site=Employer name"
LEVER_REGION=global                        # or eu
REMOTIVE_DAILY_REQUEST_LIMIT=4
```

The board token is the part after `boards.greenhouse.io/`. The Lever site name is the part after `jobs.lever.co/`. Use only employers whose public boards you are entitled to use.

At startup the API logs one line saying which sources are usable and why the others aren't. It never prints credential values. For example: `Job discovery sources: adzuna (real jobs), greenhouse (real jobs); "lever" is enabled but not configured (LEVER_SITES is empty).`

## Normalisation and provenance

- **Adapters map provider fields only.** A missing title, company or description means the posting is skipped. Missing optional facts (location, work mode, employment type, posting date) stay empty.
  - A work mode is set only when the provider states it, as Lever's `workplaceType` does, or when the location or title explicitly says remote or hybrid.
  - Greenhouse's `updated_at` is not treated as a posting date.
- **Each discovery stores its provenance:**
  - the source (`discovered_jobs.source_id`)
  - the posting URL and its canonical form
  - `discovered_from`, e.g. `Greenhouse job board: acme` or `Adzuna search API (IN)`

  This records where the posting was found. It does **not** claim that the employer verified anything.

- **The employer's original posting is preferred:**
  - Within a run, postings from employer boards (Greenhouse, Lever) are processed before aggregator copies (Adzuna, Remotive).
  - If a job first arrived through an aggregator and an employer board lists it later, the job's link and source switch to the employer's posting. Only jobs that discovery itself created are switched, never jobs the user added.

## De-duplication

Duplicates are checked in this order:

1. **Same source and external id.** There is one `discovered_jobs` row per user, source and posting, so a re-run never re-creates it.
2. **Same canonical URL.** Tracking parameters, `www.` and trailing slashes are ignored.
3. **Same company, title and location.** Company suffixes, Front-end/Frontend and city aliases such as Bengaluru/Bangalore are normalised.
4. **Same company and title, a compatible location, and a near-identical description** (≥ 0.85 shingle similarity). This catches a re-worded re-post. Similar titles, or the same role in another city, are **never** merged.

A posting that matches a job the user already has is recorded as `DUPLICATE` and counted in the run's **Duplicates**.

## Production safety

- The `dev` source is refused when `NODE_ENV=production`, both at startup and again before every search.
- Sample jobs are stored with `jobs.is_sample_data = true`. Production recommendation queries (list, detail, save, dismiss, dashboard counts) exclude them.

## Run history

Each run records:

- start and completion times
- per-source results: postings returned, postings matching the search, and errors (safe messages only)
- **Discovered:** postings returned by sources
- **Matched your search**
- **New jobs added**
- **Duplicates**
- **Analysed:** jobs fully analysed against the active resumes
- **Recommended**
- **Below threshold**
- **Skipped**
- the search strategy used

If some sources fail and others work, the run is **Partly completed**. If all fail, it is **Failed**.

## Adding a source

1. Implement `JobSourceAdapter` in `apps/api/src/modules/job-discovery/sources/`:
   - a descriptor with key, name, kind, `postingOrigin` and the attribution its terms require
   - `isConfigured`, `searchJobs` and `normalizeJob`

   Use `getJson`/`TtlCache` from `sources/http.ts`. They give safe error messages and a shared cache.

2. Register it in `BUILT_IN_SOURCES` (`sources/create-adapters.ts`), add its settings to `config/env.schema.ts` and `.env.example`, and add a startup hint in `MISSING_CONFIG`.
3. Test it with a mocked fetch (`sources/test-fetch.fixture.ts`). Automated tests must never call a live provider.
4. Only use official APIs or published feeds, within the provider's terms and rate limits. Never scrape restricted pages, never sign in as the user, and never bypass CAPTCHA, 2FA, bot protection or robots.txt.

## Limitations

- **Adzuna** descriptions are often snippets, so some ads are screened out as too short to compare. Thresholds are never lowered to compensate.
- **Remotive's** feed is 24 hours behind, and its required-location field (e.g. "USA only") is shown but not filtered against the user's country.
- **Greenhouse and Lever** only cover the employers you configure. Neither is a search engine across all companies.
- **Rate limits and caches are per API process.** A restart resets the in-memory counters; the provider's own limits still apply.
- **One list per source per run:** at most 50 postings per source and 15 new jobs per run. The rest are considered on the next run.
