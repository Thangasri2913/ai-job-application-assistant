# Database

PostgreSQL 16, accessed through Prisma 7 (`apps/api/prisma/schema.prisma`). ORM choice: [ADR-0002](adr/0002-orm-prisma.md).

## Conventions

- Table names are plural snake_case (`users`, `resume_versions`); columns are snake_case via `@map`.
- Primary keys are UUID v7 (`@default(uuid(7))`): time-ordered and not guessable.
- Timestamps use `timestamptz(3)`. Calendar dates (employment, education) use `date`, exchanged as `YYYY-MM-DD`.
- Every user-owned table has a `user_id` foreign key that cascades on user deletion, plus an index starting with `user_id`.
- User-ordered lists have a `sort_order` column, indexed as `(user_id, sort_order)`.
- Files never go in the database. It stores only object-storage keys and metadata ([ADR-0006](adr/0006-file-storage.md)).
- JSONB is used only for genuinely flexible, versioned extraction output (`parsed_data`, `ai_extraction`). Everything the user confirms is normalised ([ADR-0012](adr/0012-normalised-resume-content.md)).
- All schema changes are migrations committed to Git. Production uses `prisma migrate deploy` only. Data-moving migrations run inside one explicit `BEGIN … COMMIT`.

## Migrations

| Migration                                          | Contents                                                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                                             | users, sessions, audit_logs                                                                                                                                                                                                             |
| `career_profile_and_resume_library`                | profile tables, resumes, resume_versions, default_resumes                                                                                                                                                                               |
| `parse_status_needs_review`                        | `NEEDS_REVIEW` parse status (kept separate: Postgres can't use a new enum value in the transaction that adds it)                                                                                                                        |
| `profile_extensions_and_normalized_resume_content` | salary range, employment types, languages, achievements, `sort_order`; `resumes.category`; `resume_files`; normalised resume content. Moves existing data and drops the old JSON column.                                                |
| `keycloak_identity`                                | Adds `users.keycloak_subject` (unique); `users.email` becomes a non-unique index; drops `users.password_hash` and the `sessions` table ([ADR-0013](adr/0013-keycloak-identity-provider.md)). Back up first: the drops are irreversible. |
| `profile_headline`                                 | Nullable `headline` on `user_profiles` and `resume_versions` (additive).                                                                                                                                                                |
| `jobs_and_resume_matching`                         | `jobs`, `job_analyses`, `job_requirements`, `match_analyses`, `resume_recommendations` and their enums (additive; [ADR-0014](adr/0014-job-analysis-and-resume-matching.md)).                                                            |
| `application_tracking`                             | `applications`, `application_status_history`, `application_notes`, `application_documents` and their enums (additive; [ADR-0015](adr/0015-application-tracking.md)).                                                                    |
| `application_preparation`                          | `application_preparations`, `resume_suggestions`, `cover_letter_versions`, `application_questions`, `ai_usage` and their enums (additive; [ADR-0016](adr/0016-ai-application-preparation.md)).                                          |
| `interview_preparation`                            | `interview_sessions`, `interview_questions`, `interview_answers`, `interview_evaluations` and their enums (additive; [ADR-0017](adr/0017-interview-preparation.md)).                                                                    |

## Schema

### Identity and security

| Table        | Purpose                                                                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`      | Local account synced from Keycloak: `keycloak_subject` (token `sub`, unique; null only for not-yet-linked legacy users), email (copied from the IdP, indexed, not unique), name, status, last login. **No passwords.** |
| `audit_logs` | Append-only security and data events. Metadata holds ids, counts and reasons only.                                                                                                                                     |

### Career profile (the user's source of truth)

| Table                                      | Notes                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_profiles`                            | 1:1 with users. Contact details and links; preferences (`work_modes` enum[], `employment_types` enum[], `salary_min`/`salary_max`/`salary_currency`, notice period, work authorisation); headline; summary; `years_of_experience numeric(4,1)` stored exactly as entered; current and previous titles and companies; professional `headline` |
| `skills`                                   | Unique on `(user_id, normalized_name)`; `category` enum (FRONTEND … SOFT_SKILLS, OTHER). This plays the role of "UserSkill": a skill belongs to one user.                                                                                                                                                                                    |
| `experiences`                              | company, title, location, start/end date, `is_current`, responsibilities/achievements/technologies `text[]`, `sort_order`                                                                                                                                                                                                                    |
| `educations`, `projects`, `certifications` | Per-user lists with `sort_order`                                                                                                                                                                                                                                                                                                             |
| `profile_languages`                        | Unique on `(user_id, normalized_name)`; proficiency is free text                                                                                                                                                                                                                                                                             |
| `achievements`                             | Career achievements not tied to one job: title, description, date, `sort_order`                                                                                                                                                                                                                                                              |

### Resume library

```
resumes ─1:n─ resume_versions ─n:1─ resume_files        (original upload, immutable)
   │                │
   │                ├─ resume_version_skills          ┐
   │                ├─ resume_version_experiences     │ normalised, version-specific content
   │                ├─ resume_version_educations      │ (each resume can emphasise different
   │                ├─ resume_version_projects        │  experience than the profile)
   │                └─ resume_version_certifications  ┘
   └─0..1─ default_resumes (PK user_id)
```

| Table              | Notes                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resumes`          | Identity: name, description, `category` (free text), `tags text[]`, status ACTIVE/ARCHIVED, `current_version_id` (unique FK)                                                                                                                                                                                                                                                                    |
| `resume_files`     | Original uploads: `storage_key` (unique), safe filename, MIME type, size, sha256. Versions of the same resume may share a file; a duplicated resume gets its own copy. `ON DELETE RESTRICT` from versions, so a file can't disappear while referenced.                                                                                                                                          |
| `resume_versions`  | Unique on `(resume_id, version_number)`. Status DRAFT/ACTIVE/ARCHIVED; source UPLOAD/MANUAL_EDIT/DUPLICATE/PROFILE; parent version; `file_id`; parse status and extraction (`extracted_text`, `parsed_data` JSONB, `ai_extraction` JSONB); confirmed scalar content (contact, headline, summary, years, `achievements[]`, `languages[]`), `has_content`, `content_confirmed_at`, `activated_at` |
| `resume_version_*` | Ordered rows per version. Skills are unique per version (case-insensitive) and indexed by `normalized_name` for future matching queries.                                                                                                                                                                                                                                                        |
| `default_resumes`  | PK `user_id` gives at most one default per user. Composite FK `(resume_id, user_id) → resumes(id, user_id)` ensures it's the user's own resume. Cascades on delete.                                                                                                                                                                                                                             |

### Parse status lifecycle

`NOT_APPLICABLE` (no file) · `PENDING` → `PROCESSING` → `NEEDS_REVIEW` (extracted, awaiting the user) → `COMPLETED` (confirmed) · `FAILED` (with a safe message; can be re-run).

### Integrity rules

- Content of ACTIVE or ARCHIVED versions is frozen; the services only write content to DRAFTs. Editing a current resume always creates a new draft version.
- Deleting a resume deletes its versions and content rows, then removes `resume_files` rows (and stored objects) that nothing references any more.
- Deleting a user cascades every private row. Object-storage purge on account deletion is a known gap (see ARCHITECTURE.md › Known limitations).

### Jobs and matching

| Table                    | Notes                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jobs`                   | User's posting: title, company, description + `normalized_description`, `content_hash` (unique per user → duplicate detection), URL, location, employment type, source, status ACTIVE/ARCHIVED, `current_analysis_id` (latest completed run), `selected_resume_version_id` (the user's own choice, SetNull)                                                             |
| `job_analyses`           | One row per analysis run (history kept): status PENDING/RUNNING/COMPLETED/FAILED, safe `error`, analyser version, `job_content_hash` at run time (→ `outdated`), verbatim summary, `ai_summary`, seniority (+ stated/inferred), employment type, keywords, confidence, AI status/provider/prompt version, validated `ai_extraction` (JSONB), `excluded_resumes` (JSONB) |
| `job_requirements`       | Per run: type SKILL/EXPERIENCE/EDUCATION/RESPONSIBILITY/OTHER, name, `normalized_name`, importance REQUIRED/PREFERRED, origin EXPLICIT/INFERRED, detected by PARSER/AI, quoted `evidence`, `min_years`. Unique `(analysis_id, type, normalized_name)`                                                                                                                   |
| `match_analyses`         | Per run and subject (profile or one resume version; unique `(analysis_id, subject_key)`): overall + six dimension scores, strengths, gaps, `evidence` (JSONB), rank, `scoring_version`, and the **exact `resume_version_id`** with a name/version snapshot. Composite FK `(job_id, user_id) → jobs(id, user_id)` keeps owner and job consistent                         |
| `resume_recommendations` | One per completed run: the top match, its score, reasons and gaps                                                                                                                                                                                                                                                                                                       |

Deleting a job cascades to its analyses, requirements, matches and recommendations. Deleting a resume never deletes match history: the version reference becomes null and the snapshot remains.

### Applications

| Table                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applications`               | One per tracked application: `job_id` + `user_id` (composite FK to `jobs`, **RESTRICT**), `resume_version_id` (**required, never changed, RESTRICT**), status enum, `applied_at` (date), source, URL, rejection reason, snapshots of the AI recommendation (`recommended_resume_version_id`, `recommended_score`) and of the used version's match (`match_analysis_id`, `match_score`), `archived_at` |
| `application_status_history` | Append-only `(from_status, to_status, changed_at, note)`; the first row has `from_status` null. Indexed by `(application_id, changed_at)` and `(to_status, changed_at)` for later time-in-stage and conversion analysis                                                                                                                                                                               |
| `application_notes`          | Notes with created/updated timestamps                                                                                                                                                                                                                                                                                                                                                                 |
| `application_documents`      | Cover letters, tailored resumes, portfolios: type, name, server-generated `storage_key` (unique, never exposed), original filename, MIME type, size, sha256. Files in object storage                                                                                                                                                                                                                  |

Rules: at most one non-archived application per job (enforced by the service under a row lock); a job or resume version referenced by an application can't be deleted (archive instead); permanent deletion of an application is only possible once archived and removes its history, notes and documents.

### Application preparation

| Table                      | Notes                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application_preparations` | One per application (unique); `resume_version_id` = the application's version (**RESTRICT**), `job_id`, status, `approved_at`, generation claim (`busy_operation`, `busy_since`), note/time of the last suggestion run                                                          |
| `resume_suggestions`       | kind, section, `original_text` (verbatim resume line), `suggested_text`, `user_text` (edit), reason, job requirement, confidence, source (AI/RULES), status, `target` (JSONB, reorder target), `superseded_at` (undecided suggestions replaced by a later run are kept, hidden) |
| `cover_letter_versions`    | Unique `(preparation_id, version_number)`; `generated_text` (as generated) separate from `text` (current), source, status, `not_claimed[]`, note, `document_id` (DOCX created on approval, SetNull)                                                                             |
| `application_questions`    | Per application: question, type, `max_words`/`max_characters`, `suggested_answer` + source, `insufficient_information`, `missing_information[]`, `assumptions[]`, note, **`user_answer` (separate)**, status, timestamps                                                        |
| `ai_usage`                 | user, application, operation, provider, model, outcome, attempts, time. No prompts or outputs                                                                                                                                                                                   |

### Interviews

| Table                   | Notes                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interview_sessions`    | Per application: `application_id`, `job_id`, `resume_version_id` (**RESTRICT**, exact version at creation), type, focus, difficulty, question count, status, `current_index` (mock progress), question source/note, `overall_score`, stored `report` (JSONB), generation claim, started/completed times |
| `interview_questions`   | Unique `(session_id, order)`: question, category, difficulty, `expected_topics[]`, rationale, source (AI/RULES)                                                                                                                                                                                         |
| `interview_answers`     | Unique `(question_id, attempt)`; the answer exactly as submitted — **never updated**                                                                                                                                                                                                                    |
| `interview_evaluations` | One per answer (unique): source, overall (0–10), dimensions (JSONB), strengths, improvements, STAR (JSONB), technical breakdown (JSONB), feedback, note                                                                                                                                                 |

### Job discovery

| Table                 | Notes                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `job_search_alerts`   | Per user: criteria (keywords, locations, remote preference, employment types, level), `minimum_match_score`, `selected_resume_mode`, `is_active`, schedule (type, local `schedule_time`, `schedule_days`, IANA `timezone`), `last_run_at`, `next_run_at` |
| `job_sources`         | Global, unique `key`: name, kind (DEVELOPMENT/API/FEED), `is_development`, `is_enabled`, health. **No credentials** (those stay in environment variables)                                                                                                |
| `discovered_jobs`     | Unique `(user_id, source_id, external_id)`: every posting an alert considered, with outcome (RECOMMENDED/BELOW_THRESHOLD/DUPLICATE/ANALYSIS_FAILED), screening score, canonical URL, dedup key, and the user's job (SetNull)                             |
| `job_search_runs`     | Per alert run: trigger, status (RUNNING/COMPLETED/FAILED/PARTIAL), found / created / skipped / below-threshold / recommended counts, per-source results (JSONB), safe error message                                                                      |
| `job_recommendations` | Unique `(user_id, job_id)`; FK `(job_id, user_id)` → `jobs` (same user only): match score, recommended resume version (SetNull + name/version snapshot), rank, reason(s), gaps, required skills matched/missing, status and timestamps                   |
| `notifications`       | Unique `(user_id, dedup_key)`: channel (IN_APP; EMAIL/PUSH reserved), type, title, body, link, `read_at`                                                                                                                                                 |

`jobs` gains `origin` (MANUAL/DISCOVERED), `is_sample_data` and `in_library`.

## Prisma commands

| Task                                        | Command (from repo root)                                            |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Apply migrations                            | `npm run db:migrate:deploy`                                         |
| Create a migration after editing the schema | `npm run db:migrate -- --name <change>`                             |
| Regenerate the client                       | `npm run prisma:generate -w @job-assist/api` (also runs on install) |
| Check status / drift                        | `cd apps/api && npx prisma migrate status`                          |
| Browse data                                 | `npm run db:studio -w @job-assist/api`                              |

Keycloak keeps its own data (users, credentials, sessions) in a **separate** PostgreSQL container (`keycloak-db`, volume `keycloak-db-data`), which Prisma never touches.
