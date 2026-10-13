# Architecture

## Overview

AI Job Application Assistant is a **modular monolith**: one NestJS API, one React SPA, one PostgreSQL database, in an npm-workspaces monorepo.

```
Browser (React SPA)
   │  same origin: /api/* proxied (dev) or routed by the edge (prod)
   ▼
NestJS API  /api/v1
   ├── auth, users, health          ← Phase 0
   ├── audit                         ← security & data events
   ├── profile                       ← Phase 1: career profile (source of truth)
   ├── resumes                       ← Phase 1: library, versions, upload, parsing pipeline
   ├── overview                      ← Phase 1: profile completion, dashboard summary (read model)
   ├── storage                       ← S3 abstraction (SeaweedFS locally)
   ├── ai                            ← provider abstraction + validation (optional resume structuring)
   └── jobs, applications, documents, interview, notifications,
       analytics, subscriptions, admin                  ← planned modules
   │
   ├── PostgreSQL (Prisma)
   ├── S3-compatible object storage  (ADR-0006, ADR-0009)
   └── Redis + BullMQ                ← planned (ADR-0005); in-process dispatcher for now (ADR-0011)
```

## Repository layout

| Path                    | Purpose                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `apps/api`              | NestJS API (ESM, Prisma, Vitest)                                                          |
| `apps/web`              | React 19 + Vite SPA (React Router, TanStack Query, React Hook Form + zod, Tailwind CSS 4) |
| `packages/shared`       | API contract types and domain vocabulary shared by both apps. No runtime deps.            |
| `infrastructure/docker` | Container init scripts                                                                    |
| `docs`                  | Product, architecture, ADRs                                                               |

Why one `packages/shared` rather than `shared`/`types`/`config`: see [ADR-0001](adr/0001-monorepo-structure.md).

## Backend module rules

1. **A module owns its tables.** Other modules call its exported service, never its Prisma models directly. This keeps future extraction into a service possible.
2. **Secure by default.** `AuthGuard` (Keycloak token validation) is global; routes opt out with `@Public()`. Every user-owned query must filter by the authenticated `userId` (see Data isolation).
3. **Thin controllers.** Controllers map HTTP ↔ DTOs; business rules live in services.
4. **No vendor SDKs in feature code.** AI goes through `AiService`; storage will go through a `StorageService`; job sources through `JobSourceAdapter`s.
5. **Cross-cutting setup lives in `bootstrap/configure-app.ts`** and is reused by e2e tests, so tests exercise the real pipeline.

### Request pipeline

`helmet` → CORS (`CORS_ORIGINS` only, never `*`) → pino-http (request id, redacted logging) → `ThrottlerGuard` → `AuthGuard` → `ValidationPipe` (whitelist, forbid unknown fields) → controller → `AllExceptionsFilter` (uniform `ApiErrorResponse`).

### Configuration

All env vars are validated by a zod schema at boot (`src/config/env.schema.ts`); the process refuses to start with invalid configuration. One `.env` at the repo root serves Compose, the API and Prisma locally.

## Authentication

Keycloak is the identity provider ([ADR-0013](adr/0013-keycloak-identity-provider.md)). The application stores no passwords, issues no tokens and keeps no sessions.

```
Browser (React)                 Keycloak :8180                      NestJS :3000
  │ Sign in / Create account      realm ai-job-assistant              │
  │──── /auth?code_challenge=S256 ──▶│ login / registration page       │
  │◀─── /auth/callback?code ─────────│                                 │
  │──── POST /token (code+verifier) ▶│ (public client, no secret)      │
  │◀─── access + id + refresh token ─│                                 │
  │──── GET /api/v1/... Authorization: Bearer <access token> ─────────▶│
  │                                  │◀── discovery + JWKS (cached) ───│ verify signature, iss,
  │                                  │                                 │ aud, exp, typ, azp
  │◀──────────────────────────────────────────── data for local user ──│ upsert users by `sub`
```

- **React** (`features/auth`): `oidc-client-ts` via `react-oidc-context`.
  - Authorization Code + PKCE (S256).
  - Tokens stored in `sessionStorage`, renewed silently before expiry.
  - **Create account** is the same flow with `prompt=create`.
  - **Log out** calls Keycloak's end-session endpoint with `id_token_hint`, so the Keycloak session really ends, and returns to `/login`.
- **API** (`modules/auth`):
  - `KeycloakTokenVerifier` uses `jose`. It verifies the signature against the JWKS from OIDC discovery (issuer must match `KEYCLOAK_ISSUER_URL`), plus `iss`, `aud` = `KEYCLOAK_AUDIENCE`, `exp`/`nbf`/`iat` (5 s tolerance), `typ` = `Bearer` and `azp` = `KEYCLOAK_CLIENT_ID`. Only asymmetric algorithms are accepted.
  - The global `AuthGuard` then calls `UsersService.syncIdentity`, which:
    - finds the local user by `keycloak_subject` (the token's `sub`), or creates it;
    - links a pre-Keycloak user with the same email only when the token's `email_verified` is true;
    - syncs the email, and fills `full_name` only while it is empty (the user owns it after that);
    - records a login when `auth_time` changes.
  - Controllers receive `AuthenticatedUser { userId, keycloakSubject, email, name, roles }`.
- **Failure handling:**

  | Situation                 | API response                        | What the UI does                                                                                      |
  | ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
  | No token or invalid token | `401 UNAUTHORIZED`                  | Renews silently once; if that fails, clears the session and sends the user to `/login?reason=expired` |
  | Expired token             | `401 TOKEN_EXPIRED`                 | Same as above                                                                                         |
  | Local user disabled       | `403 ACCOUNT_DISABLED`              | Shows the auth error page                                                                             |
  | Keycloak unreachable      | `503 IDENTITY_PROVIDER_UNAVAILABLE` | Shows the auth error page with Try again / Sign out                                                   |

  Error responses never echo the token. pino redacts `Authorization`.

- **Audit:** `auth.user_created`, `auth.user_linked`, `auth.login`.

Known trade-offs: tokens can be read by JavaScript (sessionStorage), so the defences against XSS are short lifetimes, CSP and React's escaping; a backend-for-frontend could remove this. Email verification is off in the local realm (no SMTP).

## Career profile (Phase 1)

The profile is the user's **source of truth**. Only the user changes it: directly, or by explicitly importing items they selected while reviewing a parsed resume.

- **Normalised tables.** `user_profiles` (1:1) holds:
  - personal details and links
  - preferences: roles, locations, work modes, employment types, salary min/max/currency, notice period, work authorisation
  - professional details: headline, summary, years of experience, current/previous titles and companies

  The list sections are separate tables: `skills` (grouped by 10 categories + Other), `experiences`, `educations`, `projects`, `certifications`, `profile_languages`, `achievements`.

- **Exact values.** `yearsOfExperience` is stored as entered (`numeric(4,1)`), so 3.3 stays 3.3. The parser's computed estimate lives only inside resume content and is never copied silently.
- **Ordering.** Ordered sections carry `sort_order`; `PUT /profile/{section}/order` must list every item exactly once.
- **Import.** `POST /profile/import` **adds** list items and **fills empty** scalar fields only. It never overwrites, skips skills and languages the user already has (case-insensitive), and reports what was filled and what was kept.

### Profile completion

Computed by `computeProfileCompletion` (`apps/api/src/modules/overview/profile-completion.ts`). Each item is all-or-nothing; weights sum to 100 and are returned with a hint so the UI can say exactly what's missing. `missingSections` lists the keys of the incomplete items.

| Item                 | Weight | Complete when                        |
| -------------------- | ------ | ------------------------------------ |
| Basic information    | 10     | name, phone and location set         |
| Professional links   | 5      | LinkedIn, GitHub or portfolio set    |
| Professional summary | 10     | summary ≥ 50 characters              |
| Job preferences      | 10     | ≥ 1 preferred role and ≥ 1 work mode |
| Work experience      | 20     | ≥ 1 experience entry                 |
| Skills               | 15     | ≥ 5 skills                           |
| Education            | 10     | ≥ 1 education entry                  |
| Projects             | 10     | ≥ 1 project                          |
| Resume               | 10     | ≥ 1 active resume in the library     |

## Resume library (Phase 1)

```
Resume ("Angular Developer Resume", category "Frontend", tags)  ← identity, default, archive
 ├── ResumeVersion v1  UPLOAD       ARCHIVED   ← superseded, frozen, retained
 ├── ResumeVersion v2  MANUAL_EDIT  ACTIVE     ← current; frozen
 └── ResumeVersion v3  UPLOAD       DRAFT      ← being reviewed; editable
        │
        ├── ResumeFile (original upload, immutable; shared by edits of the same resume)
        └── normalised content: skills, experiences, educations, projects, certifications,
            contact, summary, achievements, languages  (resume-specific, may differ from profile)
```

- **Immutable versions** ([ADR-0010](adr/0010-resume-versioning.md)). Only DRAFTs change. Activating a reviewed draft supersedes the previous ACTIVE version, which becomes ARCHIVED and stays retrievable. Saving structured data on a resume whose working version is frozen creates a new draft. Nothing is ever overwritten, which is what will let applications reference the exact version sent.
- **Resume-specific content** ([ADR-0012](adr/0012-normalised-resume-content.md)). Each version has its own normalised rows, so an Angular-focused and a full-stack-focused resume can emphasise different experience. Matching reads them directly.
- **Default resume.** At most one per user, and only the user's own resume; the database enforces both (`default_resumes`). Setting a new default replaces the old one. Archived resumes can't become the default (409), and archiving the default clears it. Deleting the default hands the role to the most recently updated active resume, or leaves no default if none is left.
- **Library search.** `GET /resumes` filters by status, free-text `q` (name, description, category, tags), category and tag, and sorts by updated, created or name; the default always comes first. Categories are free text (suggested: General, Frontend, Backend, Full Stack, Angular, React, DevOps, Data), so new ones need no code change.
- **Archive vs delete.** Archive hides a resume and keeps everything readable. Delete is permanent, after a confirmation dialog, and removes rows plus any files no longer referenced. Once applications exist, a referenced resume will be archive-only.
- **Matching.** Jobs are scored against every active resume's current version and each match stores that exact `resume_version_id` (see Jobs below).

### Upload & parsing pipeline ([ADR-0011](adr/0011-resume-parsing-pipeline.md))

```
POST /resumes (multipart, ≤ 5 MB in memory, upload rate limit)
  → validate by magic bytes (file-type); extension must agree; filename sanitised
  → put original in object storage  users/<uid>/resumes/<rid>/<uuid>.<ext>  (server-generated key)
  → Resume + ResumeFile + ResumeVersion v1 (DRAFT, parse PENDING)  → 201
  → ParsingDispatcher.dispatch(versionId)       (in-process, after the response)
        → PROCESSING → extract text (unpdf / mammoth)
        → deterministic parser (rule-based, PARSER_VERSION)           → parsed_data
        → optional AI structuring (AI_PROVIDER ≠ none): zod-validated,
          one controlled retry, grounded against the text              → ai_extraction {status…}
        → NEEDS_REVIEW  |  FAILED (safe message; POST …/parse to retry)
UI polls parse status → user reviews/edits in the editor → PATCH structured-data
  → parse status COMPLETED, content saved to normalised rows → activate → frozen, current
```

| Layer            | Stored in                                    | Authority               |
| ---------------- | -------------------------------------------- | ----------------------- |
| Raw text         | `resume_versions.extracted_text`             | external source         |
| Parser output    | `parsed_data` (JSONB)                        | suggestion              |
| AI structuring   | `ai_extraction` (JSONB, with status)         | suggestion              |
| Reviewed content | normalised `resume_version_*` rows + columns | **highest** (user fact) |

The detail page shows **Parsing information**: status, parser version, AI usage, counts, any error, and the raw text. Every version is labelled with where its information came from: **Extracted from file**, **AI interpreted** (validated AI suggestion), **From your profile**, and **Confirmed by you** or **Not confirmed yet**. Items in the current version are labelled "From your file" or "Added by you".

The headline is taken verbatim from a job-title line in the resume header (e.g. under the name), skipping lines that hold contact details; if there is none it stays empty.

**Failures are never hidden.** If parsing fails the upload dialog says "Resume could not be parsed." with the reason and offers **Retry** (re-runs parsing on the stored file), **Upload another file**, or **Continue manually** (opens the review editor with empty fields).

## Jobs, analysis and resume matching

Design and rationale: [ADR-0014](adr/0014-job-analysis-and-resume-matching.md).

```
POST /jobs (title, company, pasted description)  → normalise, content_hash (duplicates → 409)
POST /jobs/:id/analyze → job_analyses row PENDING (row lock: one run at a time) → 202
  → JobAnalysisDispatcher (in-process, re-queued on restart)
     → rule-based analyser: sections, skills (normalised), years, degree, responsibilities,
       required vs preferred, explicit vs inferred, verbatim evidence
     → optional AI (job.analyze): zod-validated, 1 controlled retry, grounded in the text
     → too little structure → FAILED with a clear message
     → subjects: career profile + current version of EVERY active resume
       (archived never; unreviewed listed as "not compared")
     → scoreMatch() per subject  (pure, deterministic, evidence for every judgement)
     → rankMatches() → recommendation (top match, reasons/gaps from stored results)
     → one transaction: requirements, matches, recommendation, jobs.current_analysis_id
UI polls GET /jobs/:id → shows requirements, all scores, evidence, recommendation, user choice
```

- **Module boundaries.** `JobsModule` owns the job tables. It reads resumes only via `ResumesService.listMatchCandidates` / `findSelectableVersion`, and the profile via `ProfileService.getProfile`. Skill normalisation lives in `common/skills/skill-normalization.ts`.
- **Score.** Weights (skills 40, experience 25, responsibilities 15, projects 10, education 5, keywords 5) and credits are in `jobs/matching/scoring-config.ts`. Dimensions the job doesn't mention are excluded and the remaining weights re-normalised. Bands: 0–49 Low, 50–69 Moderate, 70–84 Strong, 85–100 Excellent. The product calls it an "AI-assisted job compatibility score", never a hiring, interview or ATS probability.
- **History.** Each run is kept, and matches reference the exact resume version. If the user's current resume versions change, results are flagged `stale` until re-analysed. If the job text changes, the analysis is flagged `outdated`.
- **User control.** The recommendation is advisory; `PUT /jobs/:id/selected-resume` records the user's own choice.

## Application tracking

Design and rationale: [ADR-0015](adr/0015-application-tracking.md). The product records applications; it never submits them, stores job-board credentials or automates forms.

```
Job page → "Track application" → choose the exact resume version
   (AI-recommended version preselected; any current reviewed version of an active resume)
POST /applications → lock job row → one active application per job → snapshot recommendation
   + match score → application (status SAVED/PREPARING/APPLIED) + first history row (+ note)
POST /applications/:id/status → allowed transition (or undo) → append history → appliedAt once
notes, documents (object storage) → timeline = history + notes + documents, newest first
```

- **Recommended vs selected vs used.** The AI recommendation is advisory. The job keeps the user's selection. The application stores the version actually used, plus snapshots of the recommendation and match score at creation, so later analytics can compare them.
- **Immutability.** `applications.resume_version_id` never changes and is `RESTRICT`. New versions of the resume don't affect existing applications (the UI flags "Newer version exists"), and resumes or jobs referenced by applications can only be archived.
- **Module boundaries.** `ApplicationsModule` owns the four application tables, validates resume versions through `ResumesService.findSelectableVersion`, and exposes `pipeline()` to the dashboard (`OverviewModule`).

## Application preparation

Design and rationale: [ADR-0016](adr/0016-ai-application-preparation.md).

```
Application (exact resume version) → POST …/preparation (one per application)
context = application's version content + career profile + stored job requirements + match evidence
   (only the signed-in user's data; loaded through ResumesService, JobAnalysisService, ProfileService)
suggestions:  rules (always) + AI rewrites (optional) → grounded → PENDING → user accepts/rejects/edits
              → tailored draft computed on read (original version never changed)
cover letter: AI (grounded, 1 retry) or template from verified data → version N → edit → approve → DOCX document
answers:      AI (grounded, limits enforced) or profile/resume facts → suggestedAnswer ≠ userAnswer → approve
preparation:  NOT_STARTED → READY → REVIEWED → APPROVED (explicit; revoked by later changes)
```

- **Grounding** (`application-preparation/grounding.ts`): AI text may not contain a skill/technology or a number absent from the user's verified data. Rewrites must quote an existing line exactly and add no numbers. Failing output is retried once with feedback, then replaced by the deterministic draft with a note.
- **Prompts** live in `application-preparation/prompts.ts`; all start with the same non-fabrication principles (no invented experience, skills, metrics, employers, certifications, education or achievements; say what is missing; no hiring guarantees or ATS claims).
- **Labels.** Every piece of content shows its source (AI generated · from your match analysis · draft from your verified data · written by you) and its review state (not reviewed · user edited · user approved).
- **Usage.** `AiUsageService` records each AI call (no content) for future metering.

## Interview preparation

Design and rationale: [ADR-0017](adr/0017-interview-preparation.md).

```
Application → POST /applications/:id/interviews (type, focus, difficulty, count)
  session stores the exact application, job and resume version
  → POST …/questions/generate (once): AI (validated; drops duplicates, presumed experience, invented numbers)
                                     or rules (job requirements, match evidence, resume lines, question bank)
  → start → answers (immutable; practice: attempts; mock: in order, one each)
  → practice: evaluate per answer (AI or rule-based practice checks)  |  mock: feedback hidden
  → complete: evaluate the rest → report from stored evaluations (+ optional AI summary) → stored, read-only
```

- **Context** comes from the shared `PreparationContextLoader` (application preparation uses the same loader), always for the session's stored resume version.
- **Honesty:** gap questions ask openly about missing skills; feedback never supplies results or metrics; rule-based feedback marks technical accuracy as not assessed; reports are labelled practice feedback.

## Career intelligence

Reference: [CAREER-INTELLIGENCE.md](CAREER-INTELLIGENCE.md). Design and rationale: [ADR-0019](adr/0019-career-intelligence.md).

```
applications (+ status history, outcome details, match-score snapshot) ┐
jobs + analyses + matches (target jobs, skill evidence)                ├─ CareerDataLoader (read-only, by user)
resume versions, interview reports                                     ┘
  → pure analytics: totals, cumulative funnel, breakdowns, resume versions, match buckets,
    skills, interview topics, sample-size-guarded patterns, data limitations
  → facts (numbered, computed statements) → rule insights | optional AI (must cite facts)
  → career_insight_runs / career_insights (in-process dispatcher; regenerated when the facts change)
```

- **Never invented:** rates are null without a denominator; groups below 5 applications are "limited data" and never compared; patterns need 10 submitted applications; historical match scores are the stored snapshots.
- **Evidence:** stored insight evidence is always the computed fact text; the AI can only cite fact ids.

## Data isolation

A user must never access another user's data. Pattern for every user-owned resource:

```ts
prisma.resume.findFirst({ where: { id, userId: principal.userId } }); // never findUnique({ where: { id } })
```

Not-found and not-owned both return **404** (don't reveal existence). Versions are always loaded through their resume's owner (`where: { id, resumeId, resume: { userId } }`), and file downloads go through the same check — object-storage keys are never exposed to clients.

`apps/api/test/isolation.e2e-spec.ts` signs up User A and User B and asserts that **every** resume, version, file and profile-item endpoint returns 404 for User B using User A's ids, that User B's lists never include User A's data, and that User A's data is unchanged afterwards. `jobs.e2e-spec.ts` does the same for every job, analysis, match, recommendation and resume-choice endpoint, and checks that User B's analysis never compares User A's resumes. `applications.e2e-spec.ts` covers every application, status, timeline, note and document endpoint, plus creating an application with another user's job or resume version. `preparation.e2e-spec.ts` covers every preparation, suggestion, cover-letter and question endpoint, and checks that another user's resume never appears in an AI prompt. `interviews.e2e-spec.ts` covers every interview endpoint and creating a session for another user's application. `job-discovery.e2e-spec.ts` covers every alert, run, recommendation and notification endpoint, and checks that another user's search creates separate jobs. `career-intelligence.e2e-spec.ts` checks that another user's analytics and insights are never visible.

## Security model (Phase 1 additions)

- Uploads: authenticated only; multer in-memory with size/part limits; content validated by magic bytes, extension must match; client filename sanitised and only used for display/Content-Disposition; files are never executed or rendered server-side.
- Downloads: owner check → stream from storage with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.
- Audit events (`audit_logs`): `profile.updated`, `profile.imported_from_resume`, `resume.uploaded`, `resume.upload_rejected`, `resume.parsed`, `resume.parse_failed`, `resume.updated`, `resume.duplicated`, `resume.archived`, `resume.restored`, `resume.deleted`, `resume.set_as_default`, `resume.default_cleared`, `resume.version_created`, `resume.version_content_updated`, `resume.version_activated`, `resume.file_downloaded`, `job.created`, `job.updated`, `job.archived`, `job.restored`, `job.deleted`, `job.analysis_started`, `job.analysis_completed`, `job.analysis_failed`, `job.match_analysis_created`, `job.resume_recommended`, `job.resume_selected`, `job.resume_selection_cleared`, `application.created`, `application.updated`, `application.status_changed`, `application.archived`, `application.restored`, `application.deleted`, `application.note_created`, `application.note_updated`, `application.note_deleted`, `application.document_added`, `application.document_removed`, `application.document_downloaded`, `application.document_rejected`, `preparation.started`, `preparation.approved`, `preparation.resume_suggestions_generated`, `preparation.resume_suggestion_accepted|rejected|edited|reset`, `preparation.cover_letter_generated|edited|approved`, `preparation.question_added|generated|deleted`, `preparation.answer_edited|approved`, `interview.session_created`, `interview.started`, `interview.questions_generated`, `interview.answer_submitted`, `interview.answer_evaluated`, `interview.completed`, `interview.report_generated`, `interview.abandoned`, `job.discovered`, `job_alert.created|updated|deleted`, `job_search.started|finished`, `job_recommendation.created|saved|dismissed`, `career_insights.requested|generated`. Metadata holds ids, counts and reasons only — never file contents or profile values.
- Upload rate limit: `UPLOAD_RATE_LIMIT_MAX` per window, and job analysis `JOB_ANALYSIS_RATE_LIMIT_MAX`, in addition to the global limit.

## Job discovery and alerts

Design and rationale: [ADR-0018](adr/0018-job-discovery-and-alerts.md).

```
Run Now / JobAlertScheduler (in-process, compare-and-set on next_run_at, time-zone aware)
  → startRun (locks the alert; one RUNNING run per alert) → JobSearchDispatcher (per-user queue)
  → JobSourceAdapter[] (JOB_SOURCES; only the alert's search terms are sent)
  → normalise (skill normaliser, canonical URL) → alert criteria
  → de-duplicate (source+external id → URL → company+title+location → description similarity)
  → screen: analyzeJobText + scoreMatch against every active resume (same engine as jobs)
  → below threshold: discovered_jobs only │ above: user's own Job (DISCOVERED, not in library)
  → JobAnalysisService.analyzeNow (full stored analysis) → JobRecommendation (rank + explanation)
  → one IN_APP notification per run
```

- **Sources:** only `dev` (development fixtures, labelled as sample data everywhere, refused in production) ships today. Real providers must use official APIs or feeds within their terms, with credentials in environment variables only. Never scrape, bypass CAPTCHA, bot protection or logins, or submit applications.
- **Isolation:** jobs, discoveries, recommendations and notifications are per user; `job_sources` is the only shared table and holds no user data.
- **Idempotency:** unique keys on postings, job content, recommendations and notifications make retries harmless.

## Frontend structure

React 19 + TypeScript + Vite ([ADR-0008](adr/0008-react-frontend.md)).

```
src/
  lib/api/        HTTP client (bearer token, silent renew once on 401, ApiError), upload with progress, download
  lib/auth/       token source bridging the OIDC session to the HTTP client
  features/
    auth/           OIDC provider + config, AuthProvider (/auth/me), route guards, login/callback/error pages
    career-profile/ CareerProfilePage, section components and forms, hooks, zod schemas
    resumes/        ResumeLibraryPage, ResumeDetailPage, ResumeReviewPage, upload dialog,
                    content editor/view, status badges, hooks, services
    jobs/           JobsPage, AddJobPage, JobDetailsPage; JobForm, JobRequirements, JobSummary, MatchScore,
                    ResumeComparison, MatchEvidence, ResumeRecommendation, AnalysisStatus; hooks, services, zod schema
    applications/   ApplicationsPage, ApplicationDetailsPage; CreateApplicationDialog, ResumeVersionSelector,
                    ApplicationStatusSelector, ApplicationTimeline, ApplicationNotes, ApplicationDocuments,
                    ApplicationCard, JobApplicationPanel (on the job page); hooks, services
    application-preparation/ ApplicationPreparationPage; PreparationHeader, ResumeSuggestions, ResumeSuggestionCard,
                    CoverLetterEditor, ApplicationQuestions, ApplicationQuestionCard, LimitCounter, ApprovalStatus
    interviews/     InterviewPreparationPage, InterviewSessionPage, InterviewHistoryPage, InterviewReportPage;
                    InterviewSetup, PracticeQuestion, AnswerFeedback, MockInterview, InterviewReportView, InterviewHistoryList
    dashboard/      DashboardPage + summary query
    placeholder/    labelled "not available yet" pages for later phases
  layout/         AppShell (sidebar + topbar), AuthLayout
  shared/ui/      primitives (Button, TextField, Dialog, ConfirmDialog, TagInput, ListInput, …)
  router.tsx      route tree; feature pages are lazy-loaded
e2e/              Playwright browser tests (real stack)
```

Routes (all except `/login` and `/auth/callback` require sign-in):

| Route                                           | Page                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`, `/auth/callback`                      | Sign in / create account (Keycloak), OIDC callback                                                                                                                                                                                                                                                                                                                              |
| `/dashboard`                                    | Profile completion, active resumes, resumes needing review, default and recently updated resume                                                                                                                                                                                                                                                                                 |
| `/profile`                                      | Career profile: details (personal, professional, preferences) and section tabs                                                                                                                                                                                                                                                                                                  |
| `/resumes`                                      | Resume library: Active/Archived tabs, search, category filter, sort, upload, create from profile                                                                                                                                                                                                                                                                                |
| `/resumes/:resumeId`                            | Resume detail: current content, version history with provenance, parsing information, actions                                                                                                                                                                                                                                                                                   |
| `/resumes/:resumeId/versions/:versionId/review` | Review and correct extracted information; save the draft or make it current                                                                                                                                                                                                                                                                                                     |
| `/jobs`                                         | Jobs: Active/Archived, search, sort; title, company, match %, best resume, status, created; open/archive                                                                                                                                                                                                                                                                        |
| `/jobs/new`                                     | Paste a job (title, company, description + optional details) → saved and analysed                                                                                                                                                                                                                                                                                               |
| `/jobs/:jobId`                                  | Analysis progress/failure, match overview, comparison of every resume with evidence, recommendation + user choice, career-profile comparison, requirements, job overview, edit/re-analyse/archive/delete                                                                                                                                                                        |
| `/applications`                                 | Applications: Active/Archived, search, status and applied-date filters, sort; table (job, company, resume used + version, status, applied, updated) or board by stage                                                                                                                                                                                                           |
| `/applications/:applicationId`                  | Resume used (exact version) vs AI recommendation, status selector (allowed moves only), job, important dates (applied date editable), timeline, documents, notes, archive/restore/delete                                                                                                                                                                                        |
| `/applications/:applicationId/preparation`      | Application preparation: selected resume (exact version), match summary, status and what still needs review, resume suggestions (Original / Suggested / Why; accept, reject, edit) and tailored draft, cover letter (generate/regenerate/write, edit, approve, versions), application questions (suggestion vs your answer, word/character counter, approve), explicit approval |
| `/applications/:applicationId/interviews`       | Interview preparation: focus (resume version, match, strengths to discuss, gaps, responsibilities), setup (type, difficulty, count) to start practice or a mock interview, this application's sessions                                                                                                                                                                          |
| `/interviews`                                   | Interview history across applications                                                                                                                                                                                                                                                                                                                                           |
| `/interviews/:sessionId`                        | Practice (question navigator, answer, feedback, attempts) · mock interview (one question at a time, progress) · completed report with all questions, answers and feedback (read-only)                                                                                                                                                                                           |
| `/interviews/:sessionId/report`                 | The stored report                                                                                                                                                                                                                                                                                                                                                               |
| `/analytics`, `/settings`                       | Labelled placeholders for later phases                                                                                                                                                                                                                                                                                                                                          |

- **Server state:** TanStack Query, through per-feature service modules; components never call `fetch` directly. Reordering is optimistic with rollback.
- **Forms:** React Hook Form + zod (`features/<x>/validation`). Server field errors are mapped back onto fields.
- **Auth:** `OidcSessionProvider` (Keycloak, PKCE) owns tokens. `AuthProvider` loads `/auth/me`. `RequireAuth` / `RedirectIfAuthenticated` guard routes without redirect loops: a signed-out user goes to `/login?returnUrl=…`, and a signed-in user on `/login` goes to `/dashboard`. The client renews once on 401 (single in-flight).
- **Styling:** Tailwind CSS 4 with semantic tokens; dark mode follows the OS. No Angular code or dependencies remain.

## Known limitations

- **Parsing** is rule-based. Unusual layouts (multi-column PDFs, tables) may extract poorly, so the user always reviews. Scanned/image-only PDFs fail with a clear message (no OCR yet).
- **AI provider** (Anthropic) is implemented and unit-tested but has not been exercised against the live API here (no credentials). With the default `AI_PROVIDER=none` the product works without AI.
- **Background work** runs in-process (re-queued on restart). Move to BullMQ when parsing gets heavier or the API runs on several instances (ADR-0005).
- **Uploads:** no malware scanning, no DOCX decompression-size (zip-bomb) limit, no per-user storage quotas yet.
- **Rate limits** are in memory, per instance.
- **Accounts:** handled by Keycloak. The local realm has email verification off (no SMTP), and Keycloak runs in dev mode. There is no account-deletion flow that purges stored files yet.
- **Career intelligence** computes analytics per request (fine at single-user scale) and stays deliberately cautious: comparisons need 10 submitted applications and groups of 5. Work arrangement is only known for discovered jobs.
- **Job discovery** ships only the development fixture source; no real job board is connected yet. Alerts are scheduled in-process (see ADR-0018).
- **Create resume from profile** saves structured content; generating a PDF/DOCX document is a later phase.
