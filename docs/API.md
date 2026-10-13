# API

Base path: **`/api/v1`**. Interactive docs (when `SWAGGER_ENABLED=true`): `http://localhost:3000/api/docs`; OpenAPI JSON at `/api/docs/openapi.json`.

## Conventions

- JSON bodies, camelCase fields, ISO-8601 UTC timestamps, calendar dates as `YYYY-MM-DD`.
- Every route requires `Authorization: Bearer <accessToken>` unless marked public.
- Status codes:

  | Code | Meaning                    |
  | ---- | -------------------------- |
  | 200  | Read or update             |
  | 201  | Created                    |
  | 202  | Accepted (async parse)     |
  | 204  | No body                    |
  | 400  | Validation                 |
  | 401  | Unauthenticated            |
  | 403  | Forbidden                  |
  | 404  | Not found **or not yours** |
  | 409  | Conflict / state           |
  | 413  | File too large             |
  | 415  | Unsupported file           |
  | 429  | Rate limited               |

- Unknown body fields are rejected (`VALIDATION_FAILED`). Every response carries `x-request-id`.
- Shared request/response types live in `@job-assist/shared` (`packages/shared/src`).

## Error format

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Some fields are invalid.",
  "details": [
    { "field": "salaryMax", "messages": ["Maximum salary must not be lower than the minimum."] }
  ],
  "requestId": "0b8e…",
  "timestamp": "2026-10-10T12:00:00.000Z",
  "path": "/api/v1/profile"
}
```

Codes:

- Request and auth: `VALIDATION_FAILED`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `TOKEN_EXPIRED` (401), `ACCOUNT_DISABLED` (403), `IDENTITY_PROVIDER_UNAVAILABLE` (503: Keycloak discovery/JWKS unreachable)
- Uploads: `FILE_REQUIRED`, `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`
- Resume state: `RESUME_ARCHIVED`, `VERSION_NOT_EDITABLE`, `VERSION_NOT_READY`
- Jobs: `DUPLICATE_JOB` (409, `meta.existingJobId`), `JOB_ARCHIVED`, `ANALYSIS_IN_PROGRESS`, `ANALYSIS_NOT_AVAILABLE`, `RESUME_NOT_SELECTABLE`, `JOB_HAS_APPLICATIONS`
- Applications: `APPLICATION_EXISTS` (409, `meta.existingApplicationId`), `APPLICATION_ARCHIVED`, `APPLICATION_NOT_ARCHIVED`, `INVALID_STATUS_TRANSITION`, `RESUME_IN_USE`
- Preparation: `AI_GENERATION_IN_PROGRESS`, `PREPARATION_NOT_READY`, `RESUME_CONTENT_MISSING`, `ANSWER_REQUIRED`
- Interviews: `INTERVIEW_CLOSED`, `INTERVIEW_NOT_STARTED`, `QUESTIONS_NOT_GENERATED`, `ANSWER_OUT_OF_ORDER`, `ANSWER_EXISTS`, `EVALUATION_DEFERRED`, `NO_ANSWERS`, `REPORT_NOT_READY`

Error responses may include `meta` (safe identifiers only).

## Health & auth

| Method | Path            | Auth   | Description                                                                                               |
| ------ | --------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| GET    | `/health`       | public | Liveness                                                                                                  |
| GET    | `/health/ready` | public | Database, object storage and Keycloak reachable (503 otherwise)                                           |
| GET    | `/auth/me`      | bearer | Current local user (`AuthUser`: id, email, fullName, roles, createdAt); creates or links it on first call |

Registration, login, token refresh and logout are **not** API endpoints: they happen in Keycloak (OIDC Authorization Code + PKCE; see [ADR-0013](adr/0013-keycloak-identity-provider.md)). Every other endpoint needs `Authorization: Bearer <Keycloak access token>` with audience `ai-job-assistant-api`.

## Career profile

| Method        | Path                         | Description                                                                                                                                                                                                  |
| ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET           | `/profile`                   | Full profile: `details`, skills, experiences, educations, projects, certifications, languages, achievements                                                                                                  |
| PUT           | `/profile`                   | Replace personal, preference and professional fields incl. `headline` (`UpdateProfileRequest`); validates salary min ≤ max. The first save is audited as `profile.created`, later ones as `profile.updated`. |
| GET           | `/profile/completion`        | `percentage`, the weighted checklist `items`, and `missingSections` (keys of incomplete items)                                                                                                               |
| POST          | `/profile/import`            | Add user-selected items from a reviewed resume. Never overwrites; skips duplicate skills and languages.                                                                                                      |
| GET, POST     | `/profile/{section}`         | List / create                                                                                                                                                                                                |
| PATCH, DELETE | `/profile/{section}/:id`     | Update / delete (404 if not yours)                                                                                                                                                                           |
| PUT           | `/profile/{orderable}/order` | Body `{ ids: [...] }` must list every item of the section exactly once                                                                                                                                       |

- `{section}`: `skills`, `experiences`, `education`, `projects`, `certifications`, `languages`, `achievements`.
- `{orderable}`: all of those except `skills`, which are grouped by category.
- Skill categories: `FRONTEND`, `BACKEND`, `DATABASE`, `CLOUD`, `DEVOPS`, `TESTING`, `ARCHITECTURE`, `AI` (shown as "AI/ML"), `TOOLS`, `SOFT_SKILLS`, `OTHER`.

## Resumes

| Method             | Path                                                                                  | Description                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                | `/resumes?status=ACTIVE\|ARCHIVED\|ALL&q=&category=&tag=&sort=updated\|created\|name` | List. `q` searches name, description, category and tags; `category` and `tag` match case-insensitively; the default resume always comes first.                                               |
| POST               | `/resumes` (multipart: `file`, `name?`, `description?`, `category?`, `tags?`)         | Upload a PDF/DOCX → 201; parsing starts in the background. Upload rate limit applies.                                                                                                        |
| POST               | `/resumes/from-profile`                                                               | Create from profile facts (ACTIVE v1, no file)                                                                                                                                               |
| GET, PATCH, DELETE | `/resumes/:id`                                                                        | Detail / rename, description, category, tags / delete permanently (204). Deleting the default makes the most recently updated **active** resume the default, if there is one.                |
| POST               | `/resumes/:id/archive`, `/restore`, `/duplicate`                                      | Lifecycle actions                                                                                                                                                                            |
| POST, DELETE       | `/resumes/:id/default`                                                                | Set / clear the default. At most one per user (enforced by the database); setting a new one replaces the old; 409 `RESUME_ARCHIVED` for an archived resume. Archiving the default clears it. |
| POST               | `/resumes/:id/parse`                                                                  | Re-run parsing on the working version → 202                                                                                                                                                  |
| GET                | `/resumes/:id/parsing-status`                                                         | Status of the working version                                                                                                                                                                |
| GET                | `/resumes/:id/structured-data`                                                        | Extraction layers of the working version (see below)                                                                                                                                         |
| PATCH              | `/resumes/:id/structured-data`                                                        | Save reviewed `ResumeContent`. Writes to the open draft, or creates a new draft from the current version; frozen versions are never changed.                                                 |

The **working version** is the newest DRAFT if one exists, otherwise the current version.

Every version summary carries provenance: `source` (`UPLOAD`, `MANUAL_EDIT`, `DUPLICATE`, `PROFILE`), `parseStatus`, `hasAiExtraction` (a validated AI interpretation exists) and `contentConfirmedAt` (when the user confirmed the content; null while unreviewed).

## Resume versions

| Method     | Path                                        | Description                                                                                                    |
| ---------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET        | `/resumes/:id/versions`                     | List, newest first                                                                                             |
| POST       | `/resumes/:id/versions`                     | New DRAFT copying a base version's content (`baseVersionId`, default current)                                  |
| POST       | `/resumes/:id/versions/upload` (multipart)  | New DRAFT from a new file; parsing starts                                                                      |
| GET        | `/resumes/:id/versions/:vid`                | Detail incl. content and file info                                                                             |
| GET        | `/resumes/:id/versions/:vid/parse-status`   | Version parse status                                                                                           |
| POST       | `/resumes/:id/versions/:vid/parse`          | Re-run parsing (draft uploads only)                                                                            |
| GET, PATCH | `/resumes/:id/versions/:vid/extracted-data` | Read the extraction layers / save reviewed content (drafts only, else 409 `VERSION_NOT_EDITABLE`)              |
| POST       | `/resumes/:id/versions/:vid/activate`       | Make a reviewed draft current; the previous version becomes ARCHIVED (409 `VERSION_NOT_READY` if not reviewed) |
| GET        | `/resumes/:id/versions/:vid/file`           | Download the original (`attachment`, `nosniff`)                                                                |

`ResumeExtractedData` fields:

- `extractedText`: raw text from the file.
- `parsed`: deterministic parser output.
- `ai`: validated AI suggestion, or null.
- `aiStatus` and `aiNote`: `DISABLED`, `VALID`, `INVALID` or `FAILED`, plus the reason when AI wasn't used.
- `confirmed`: user-reviewed content.
- `editable`, `parseStatus` and `versionStatus`.

`ResumeContent` holds contact details, `headline` (taken verbatim from a job-title line in the resume header, or null), summary, skills with category, experiences, educations, projects, certifications, achievements, languages and an estimated years of experience.

## Jobs, analysis and matching

All endpoints are scoped to the signed-in user; another user's job id returns 404. Design: [ADR-0014](adr/0014-job-analysis-and-resume-matching.md).

| Method             | Path                                                                        | Description                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST               | `/jobs`                                                                     | Add a job: `title`, `companyName`, `description` (80–30 000 chars) required; `jobUrl`, `location`, `employmentType`, `source` optional → `JobDetail`. Same title + company + description again → 409 `DUPLICATE_JOB` with `meta.existingJobId`.                                                                                                                       |
| GET                | `/jobs?status=ACTIVE\|ARCHIVED\|ALL&q=&sort=created\|updated\|match\|title` | List with latest analysis status, best match (score, level, resume) and the user's chosen resume                                                                                                                                                                                                                                                                      |
| GET, PATCH, DELETE | `/jobs/:id`                                                                 | Detail (incl. `latestAnalysis`, `currentAnalysisId`, `recommendation`, `selectedResume`) / edit (marks the analysis `outdated` if title, company or description changed) / delete permanently with its analyses (resumes untouched)                                                                                                                                   |
| POST               | `/jobs/:id/archive`, `/jobs/:id/restore`                                    | Archive / restore. Archived jobs can't be analysed (409 `JOB_ARCHIVED`).                                                                                                                                                                                                                                                                                              |
| POST               | `/jobs/:id/analyze`                                                         | Start analysis + matching in the background → 202 `{ analysisId, status }`. 409 `ANALYSIS_IN_PROGRESS` while a run is pending/running. Rate limited (`JOB_ANALYSIS_RATE_LIMIT_MAX`). Poll `GET /jobs/:id` until `latestAnalysis.status` is `COMPLETED` or `FAILED` (with a user-facing `error`).                                                                      |
| GET                | `/jobs/:id/analysis`                                                        | Current completed analysis: summary (verbatim), `aiSummary`, seniority (+ stated/inferred), employment type, keywords, confidence, AI status, and `requirements[]` (`type`, `name`, `importance` REQUIRED/PREFERRED, `origin` EXPLICIT/INFERRED, `detectedBy` PARSER/AI, quoted `evidence`, `minYears`). 409 `ANALYSIS_NOT_AVAILABLE` before the first completed run. |
| GET                | `/jobs/:id/matches`                                                         | `{ weights, profile, resumes[] (ranked), excluded[], stale }`. Each match: `overallScore`, `level`, per-dimension `scores` (null = not stated in the job), `strengths`, `gaps`, `evidence`, exact `resumeVersionId` and version snapshot.                                                                                                                             |
| GET                | `/jobs/:id/recommendation`                                                  | `{ recommendation, reason }`: the top-ranked resume with reasons and gaps, or null with the reason (no reviewed active resumes).                                                                                                                                                                                                                                      |
| PUT, DELETE        | `/jobs/:id/selected-resume`                                                 | The user's own choice `{ resumeVersionId }` (may differ from the recommendation). Must be the current version of one of the user's active resumes: 404 if not theirs, 409 `RESUME_NOT_SELECTABLE` otherwise.                                                                                                                                                          |

The score is an **AI-assisted job compatibility score**: a transparent indicator of how well a resume's stated content covers the posting. It is not a hiring, interview or ATS prediction.

## Applications

The product **tracks** applications; it never submits them. All endpoints are scoped to the signed-in user (another user's ids → 404). Design: [ADR-0015](adr/0015-application-tracking.md).

| Method             | Path                                                                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST               | `/applications`                                                                                                         | Track an application: `jobId`, `resumeVersionId` (the exact version used; current reviewed version of an active resume of yours), optional `status` (SAVED · PREPARING · APPLIED), `appliedAt` (only with APPLIED; defaults to today), `source`, `applicationUrl`, first `note`. 409 `APPLICATION_EXISTS` (`meta.existingApplicationId`) if the job already has an active application; 409 `RESUME_NOT_SELECTABLE`, 409 `JOB_ARCHIVED`. |
| GET                | `/applications?archived=ACTIVE\|ARCHIVED\|ALL&status=&q=&appliedFrom=&appliedTo=&sort=updated\|created\|applied\|title` | List with job, company, resume used (name + version), status, applied date                                                                                                                                                                                                                                                                                                                                                              |
| GET, PATCH, DELETE | `/applications/:id`                                                                                                     | Detail (resume used, AI recommendation at creation, match score of the version used, allowed next statuses, important dates) / edit `source`, `applicationUrl`, `appliedAt` (once sent; not in the future), `rejectionReason` (only when rejected); the resume version can't be changed / delete permanently (only when archived, else 409 `APPLICATION_NOT_ARCHIVED`)                                                                  |
| POST               | `/applications/:id/status`                                                                                              | `{ status, note?, rejectionReason? }`. Only allowed transitions (or back to the previous status); otherwise 409 `INVALID_STATUS_TRANSITION`. Appends a history row; sets `appliedAt` the first time it becomes APPLIED.                                                                                                                                                                                                                 |
| POST               | `/applications/:id/archive`, `/restore`                                                                                 | Archive (read-only, hidden from the active list) / restore (409 if the job has another active application)                                                                                                                                                                                                                                                                                                                              |
| GET                | `/applications/:id/timeline`                                                                                            | Creation, status changes, notes and documents, newest first                                                                                                                                                                                                                                                                                                                                                                             |
| GET, POST          | `/applications/:id/notes`                                                                                               | List / add `{ body }`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| PATCH, DELETE      | `/applications/:id/notes/:noteId`                                                                                       | Edit / delete                                                                                                                                                                                                                                                                                                                                                                                                                           |
| GET, POST          | `/applications/:id/documents`                                                                                           | List / upload (multipart: `file` PDF or DOCX, `type` COVER_LETTER · TAILORED_RESUME · PORTFOLIO · OTHER, `name?`; upload rate limit)                                                                                                                                                                                                                                                                                                    |
| GET                | `/applications/:id/documents/:documentId/file`                                                                          | Download (`attachment`, `nosniff`, `no-store`)                                                                                                                                                                                                                                                                                                                                                                                          |
| DELETE             | `/applications/:id/documents/:documentId`                                                                               | Remove the document and its stored file                                                                                                                                                                                                                                                                                                                                                                                                 |

`GET /jobs/:id` includes `application` (the job's active application: id, status, resume used). `DELETE /resumes/:id` returns 409 `RESUME_IN_USE` and `DELETE /jobs/:id` returns 409 `JOB_HAS_APPLICATIONS` when applications reference them: archive instead.

## Application preparation

AI-assisted, grounded in the application's exact resume version and the user's profile; nothing is applied or final without the user. Works without an AI provider (drafts from verified data). Design: [ADR-0016](adr/0016-ai-application-preparation.md). Generation endpoints share the `JOB_ANALYSIS_RATE_LIMIT_MAX` limit and return 409 `AI_GENERATION_IN_PROGRESS` while another generation runs for the same application; 409 `ANALYSIS_NOT_AVAILABLE` if the job isn't analysed; 409 `APPLICATION_ARCHIVED` for archived applications.

| Method    | Path                                                             | Description                                                                                                                                                                                                                                                                               |
| --------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST, GET | `/applications/:id/preparation`                                  | Start (idempotent) / read: status (NOT_STARTED · READY · REVIEWED · APPROVED), exact resume version, match, counts, `blockers`, `aiEnabled`, `busyOperation`                                                                                                                              |
| POST      | `/applications/:id/preparation/approve`                          | Mark application-ready; 409 `PREPARATION_NOT_READY` (with the blockers) until everything is reviewed                                                                                                                                                                                      |
| POST, GET | `/applications/:id/preparation/resume-suggestions`               | Generate (keeps the user's decisions, replaces undecided ones) / list: `kind` REWRITE · REORDER · EMPHASIZE · GAP, `section`, `originalText`, `suggestedText`, `userText`, `reason`, `jobRequirement`, `confidence`, `source` AI · RULES, `status` PENDING · ACCEPTED · REJECTED · EDITED |
| PATCH     | `/applications/:id/preparation/resume-suggestions/:suggestionId` | `{ action: ACCEPT \| REJECT \| EDIT \| RESET, text? }` (EDIT only for rewrites and bullet moves)                                                                                                                                                                                          |
| GET       | `/applications/:id/preparation/tailored-resume`                  | The source version's content with accepted/edited suggestions applied (`sourceResumeVersionId`, `jobId`, `applicationId`); the version itself is never changed                                                                                                                            |
| POST, GET | `/applications/:id/preparation/cover-letter`                     | Generate a new version (`{ mode: GENERATE \| MANUAL }`) / latest + all versions (`source` AI · TEMPLATE · MANUAL, `generatedText`, `text`, `status` GENERATED · EDITED · APPROVED, `notClaimed`, `note`, `documentId`)                                                                    |
| PATCH     | `/applications/:id/preparation/cover-letter`                     | Save the user's text for the latest version (revokes approval)                                                                                                                                                                                                                            |
| POST      | `/applications/:id/preparation/cover-letter/approve`             | Approve the latest version; stores it as a DOCX `COVER_LETTER` application document                                                                                                                                                                                                       |
| POST, GET | `/applications/:id/questions`                                    | Add `{ question, maxWords?, maxCharacters? }` (limits detected from the text when omitted; type classified) / list                                                                                                                                                                        |
| POST      | `/applications/:id/questions/:questionId/generate`               | Suggest an answer (never overwrites `userAnswer`); `insufficientInformation` + `missingInformation` when it can't be answered from verified data                                                                                                                                          |
| PATCH     | `/applications/:id/questions/:questionId`                        | Save `userAnswer` (and/or limits)                                                                                                                                                                                                                                                         |
| POST      | `/applications/:id/questions/:questionId/approve`                | Approve the final answer (yours, or the suggestion); 400 if over the limit, 409 `ANSWER_REQUIRED` if there's nothing verified to approve                                                                                                                                                  |
| DELETE    | `/applications/:id/questions/:questionId`                        | Remove                                                                                                                                                                                                                                                                                    |

## Interviews

Practice and mock interviews for an application; sessions keep the exact application, job and resume version. Works without AI (questions from the job and resume, rule-based practice feedback). Design: [ADR-0017](adr/0017-interview-preparation.md). Generation/evaluation/completion share the `JOB_ANALYSIS_RATE_LIMIT_MAX` limit; 409 `AI_GENERATION_IN_PROGRESS` while one runs for the session; closed sessions return 409 `INTERVIEW_CLOSED`.

| Method    | Path                                             | Description                                                                                                                                                                                              |
| --------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET       | `/applications/:id/interview-focus`              | Match, strengths to discuss (shown in the resume), gaps (likely questions), responsibilities, `aiEnabled`                                                                                                |
| POST, GET | `/applications/:id/interviews`                   | Create `{ type: PREPARATION \| MOCK_INTERVIEW \| TECHNICAL \| BEHAVIORAL \| HR, focus?, difficulty?, questionCount? (5 \| 10 \| 15) }` (defaults Mixed · Medium · 10) / list this application's sessions |
| GET       | `/interviews`                                    | History across applications                                                                                                                                                                              |
| GET       | `/interviews/:id`                                | Detail with questions, answers (all attempts) and evaluations — in a mock interview, evaluations, expected topics and rationales are hidden until it is completed                                        |
| POST      | `/interviews/:id/questions/generate`             | Generate once (later calls return the stored questions)                                                                                                                                                  |
| GET       | `/interviews/:id/questions`                      | Questions                                                                                                                                                                                                |
| POST      | `/interviews/:id/start`                          | CREATED → IN_PROGRESS (409 `QUESTIONS_NOT_GENERATED`)                                                                                                                                                    |
| POST      | `/interviews/:id/questions/:questionId/answer`   | `{ answer }` stored unchanged; practice adds an attempt, mock takes one answer per question in order (409 `ANSWER_OUT_OF_ORDER`, `ANSWER_EXISTS`); 409 `INTERVIEW_NOT_STARTED`                           |
| POST      | `/interviews/:id/questions/:questionId/evaluate` | Practice feedback on the latest answer (idempotent); 409 `EVALUATION_DEFERRED` in a mock interview                                                                                                       |
| POST      | `/interviews/:id/complete`                       | Evaluate remaining answers and store the report (409 `NO_ANSWERS`); idempotent                                                                                                                           |
| POST      | `/interviews/:id/abandon`                        | → ABANDONED                                                                                                                                                                                              |
| GET       | `/interviews/:id/report`                         | Stored report: overall 0–100, label, answered/total, strengths, improvements, per-category and per-topic practice scores, optional AI summary (409 `REPORT_NOT_READY`)                                   |

## Job alerts, recommendations and notifications

Saved searches that find jobs, compare them with every active resume and recommend those at or above the alert's minimum score. Design: [ADR-0018](adr/0018-job-discovery-and-alerts.md). Development data (the `dev` source) is flagged `isDevelopment` / `isSampleData`.

| Method             | Path                           | Description                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                | `/job-sources`                 | Configured sources: key, name, kind, `isDevelopment`, `isEnabled`                                                                                                                                                                                                                                                                   |
| POST, GET          | `/job-alerts`                  | Create `{ name, keywords[≥1], locations?, remotePreference?, employmentTypes?, experienceLevel?, minimumMatchScore? (0–100, default 70), resumeMode? (BEST_MATCH \| DEFAULT_RESUME), isActive?, schedule? { type: DAILY \| WEEKLY \| CUSTOM, time: "HH:mm", days[], timezone } }` (max 20 per user) / list with last run and counts |
| GET, PATCH, DELETE | `/job-alerts/:id`              | Detail / partial update (recomputes `nextRunAt`; paused alerts have none) / delete (run history removed; recommendations kept)                                                                                                                                                                                                      |
| POST               | `/job-alerts/:id/run`          | Run Now (202, returns the RUNNING run); same pipeline as scheduled runs; 409 `JOB_SEARCH_IN_PROGRESS`; shares `JOB_ANALYSIS_RATE_LIMIT_MAX`                                                                                                                                                                                         |
| GET                | `/job-alerts/:id/runs`         | Run history: status (RUNNING/COMPLETED/PARTIAL/FAILED), found, new jobs, recommended, below threshold, skipped, per-source results, safe error message                                                                                                                                                                              |
| GET                | `/recommendations`             | `?status=ACTIVE (default: all but dismissed) \| NEW \| VIEWED \| SAVED \| APPLIED \| DISMISSED \| ALL&alertId=` ranked best first: match score/level, rank, explanation, required skills, recommended resume version, job, source, alert                                                                                            |
| GET                | `/recommendations/:id`         | Detail; marks a NEW recommendation VIEWED                                                                                                                                                                                                                                                                                           |
| POST               | `/recommendations/:id/save`    | SAVED, and adds the job to the Jobs list                                                                                                                                                                                                                                                                                            |
| POST               | `/recommendations/:id/dismiss` | DISMISSED (never re-recommended); 409 once applied                                                                                                                                                                                                                                                                                  |
| GET                | `/notifications`               | Latest 50 in-app notifications and `unreadCount`                                                                                                                                                                                                                                                                                    |
| PATCH              | `/notifications/:id/read`      | Mark one read                                                                                                                                                                                                                                                                                                                       |
| PATCH              | `/notifications/read-all`      | Mark all read                                                                                                                                                                                                                                                                                                                       |

Recommendations become APPLIED automatically once an application is tracked for the job. Jobs gain `origin` (MANUAL/DISCOVERED), `isSampleData` and `inLibrary`; `GET /jobs` lists discovered jobs only once saved or applied to.

## Career intelligence

Analytics computed from the signed-in user's own data, plus stored evidence-based insights. Design: [ADR-0019](adr/0019-career-intelligence.md). Rates are 0–1 and `null` when the denominator is 0; `reliable` is false below 5 applications.

| Method | Path                                    | Description                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/career-intelligence/overview`         | Full report: totals (tracked, submitted, in progress, analysed target jobs, outcome metrics), cumulative funnel (+ ever-reached and current counts per status, rejection categories), breakdowns (period, source, role, company, location, workMode, seniority, skill, weekday), resume-version performance, match-score buckets, skills, interview topics, patterns, data limitations |
| GET    | `/career-intelligence/funnel`           | `{ totals, funnel }`                                                                                                                                                                                                                                                                                                                                                                   |
| GET    | `/career-intelligence/resumes`          | Resume-version performance                                                                                                                                                                                                                                                                                                                                                             |
| GET    | `/career-intelligence/skills`           | `{ skills, interviewTopics }`                                                                                                                                                                                                                                                                                                                                                          |
| GET    | `/career-intelligence/roles`            | Breakdown by role                                                                                                                                                                                                                                                                                                                                                                      |
| GET    | `/career-intelligence/sources`          | Breakdown by source                                                                                                                                                                                                                                                                                                                                                                    |
| GET    | `/career-intelligence/match-scores`     | Outcomes by stored match score                                                                                                                                                                                                                                                                                                                                                         |
| GET    | `/career-intelligence/patterns`         | `{ patterns, limitations }`                                                                                                                                                                                                                                                                                                                                                            |
| GET    | `/career-intelligence/insights`         | Latest run, its insights (category, title, explanation, evidence = cited facts, confidence, action, source), `stale`, `generating`, `aiEnabled`, disclaimer. Starts a background run when the data changed                                                                                                                                                                             |
| POST   | `/career-intelligence/insights/refresh` | 202; regenerate now (409 `INSIGHTS_IN_PROGRESS`); shares `JOB_ANALYSIS_RATE_LIMIT_MAX`                                                                                                                                                                                                                                                                                                 |

Applications: statuses add `TECHNICAL_INTERVIEW` and `ACCEPTED`. `POST /applications/:id/status` accepts optional `rejectionCategory` (with REJECTED), `offerDetails` (with OFFER/ACCEPTED) and `occurredOn` (YYYY-MM-DD, not future, not before the application date); `PATCH /applications/:id` accepts `rejectionCategory` and `offerDetails`. Details and timeline expose them.

## Overview

| Method | Path                 | Description                                                                                                                                                                                                                                                                    |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/dashboard/summary` | Resume totals (total/active/archived), resumes needing review, latest upload, recently updated active resume, default resume, profile completion. application counts per status, NEW job recommendations by level (strong ≥ 70, moderate 50–69, low < 50). All from real data. |

## Rate limiting

All limits are per client IP, per `RATE_LIMIT_TTL_SECONDS` window:

- Default: `RATE_LIMIT_MAX`.
- Sign-in attempts are handled by Keycloak, not the API (brute-force detection with temporary lockout is on in the realm).
- Uploads: additionally `UPLOAD_RATE_LIMIT_MAX`.
- Starting a job analysis: additionally `JOB_ANALYSIS_RATE_LIMIT_MAX`.

The store is in memory; move it to Redis when running more than one API instance. Behind a proxy, set `TRUST_PROXY_HOPS`.

## Not implemented yet

Voice/video interviews, email/push notifications, real (non-development) job sources. See [PRODUCT_SPEC.md](PRODUCT_SPEC.md).
