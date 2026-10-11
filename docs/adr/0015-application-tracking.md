# ADR-0015: Application tracking with the exact resume version

## Context

After a job is analysed and a resume recommended ([ADR-0014](0014-job-analysis-and-resume-matching.md)), users apply on the employer's site. They then need to track progress, keep notes and documents, and later learn which resumes work. That learning is only possible if every application permanently records the exact resume version that was sent. The product must never submit applications itself.

## Decision

- **`applications`** is one row per tracked application.
  - Owner is enforced by a composite FK `(job_id, user_id) → jobs(id, user_id)`.
  - Status is the `ApplicationStatus` enum: SAVED, PREPARING, APPLIED, RECRUITER_SCREEN, ASSESSMENT, INTERVIEW, FINAL_INTERVIEW, OFFER, REJECTED, WITHDRAWN, NO_RESPONSE. This extends the shared vocabulary that already existed, and the API rejects anything else.
  - Other fields: `applied_at` (a date), source, URL and rejection reason.
- **Exact resume version.**
  - `resume_version_id` is required, set at creation and never changed; the API doesn't accept it in updates.
  - It must be the current, reviewed version of one of the user's active resumes. Drafts are excluded because they are still editable.
  - Its FK is `ON DELETE RESTRICT`. A resume with a version used by an application can only be archived: `DELETE /resumes/:id` returns `409 RESUME_IN_USE`.
  - New versions of that resume never affect the application. The UI says "Newer version exists" and keeps showing the version used.
- **Recommended vs selected vs used.**
  - At creation the application snapshots the job's AI recommendation (`recommended_resume_version_id`, `recommended_score`), and the compatibility of the version actually used (`match_analysis_id`, `match_score`).
  - Creating an application also sets the job's selected resume to the version used.
  - These may differ, and keeping all three supports later "best-performing resume" analysis.
- **Status lifecycle.** `APPLICATION_TRANSITIONS` (shared) lists the allowed moves, for example SAVED → PREPARING/APPLIED/WITHDRAWN, APPLIED → screen/assessment/interview/offer/rejected/withdrawn/no response, and REJECTED/WITHDRAWN as terminal.
  - Going back to the immediately previous status is always allowed, to correct a mistake.
  - Every change appends to **`application_status_history`** `(from_status, to_status, changed_at, note)`; rows are never updated.
  - Changes lock the application row.
  - `applied_at` is set automatically the first time the status becomes APPLIED and is never overwritten by later changes. The user can correct it (PATCH, not in the future).
- **Duplicates.**
  - At most one _active_ (non-archived) application per job.
  - Creation locks the job row and returns `409 APPLICATION_EXISTS` with `meta.existingApplicationId`.
  - Restoring an archived application while another is active is refused the same way.
  - A database partial unique index was not used, because Prisma can't model it without schema drift; the row lock gives the same guarantee for this write path.
- **Archive before delete.**
  - Applications are archived; archived ones keep their history and are read-only.
  - Permanent deletion is only allowed after archiving.
  - A job with applications can be archived, not deleted (`409 JOB_HAS_APPLICATIONS`; FK `RESTRICT`).
- **Notes and documents.**
  - `application_notes` supports create, edit and delete.
  - `application_documents` holds a type (COVER_LETTER, TAILORED_RESUME, PORTFOLIO, OTHER), name and file metadata. Files go to object storage under a server-generated key `users/<uid>/applications/<id>/<uuid>.<ext>`, validated by content (PDF/DOCX), with the upload rate limit.
  - Original resume files are never modified. A future AI cover letter or tailored resume becomes another document of the application.
- **Timeline.** Built on read from status history, notes and documents, newest first. Nothing is duplicated into a separate events table.
- **Analytics foundation.** Status history timestamps, `applied_at` and the per-application resume and recommendation snapshots are enough to compute later:
  - applications submitted
  - by status
  - interview, offer and rejection rates
  - time to interview
  - outcomes per resume

  No statistics are computed or shown yet, apart from real per-status counts on the dashboard.

## Consequences

- An application is a reliable historical record: the version sent stays retrievable and unchanged.
- Users can't delete a resume or job that applications depend on; the UI explains how to archive instead.
- The transition map is deliberately permissive in realistic directions and strict about skipping submission. It is easy to extend in one shared place.
