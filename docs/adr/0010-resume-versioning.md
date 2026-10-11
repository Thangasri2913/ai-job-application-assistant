# ADR-0010: Resume identity + immutable versions

## Context

Users keep several resumes (Angular, Full Stack…). The product must never silently overwrite a resume. Future matching compares a job against every resume, and applications must record the exact version sent.

## Decision

- `resumes` holds the identity (name, tags, status, default). `resume_versions` holds content snapshots numbered per resume.
- Version lifecycle: **DRAFT** (editable) → **ACTIVE** (current, frozen) → **ARCHIVED** (superseded, frozen, retained). Only drafts can change. Editing creates a new draft from a base version, and activating it supersedes the previous ACTIVE version.
- Sources: UPLOAD, MANUAL_EDIT, DUPLICATE, PROFILE (AI_TAILORED later). `parent_version_id` records lineage.
- Original files are immutable. Versions of the same resume may share an object. Duplicating a resume copies the object.
- Resume metadata (name, description, tags) is not versioned: it labels the resume and isn't content that gets matched or sent.
- Default resume uses a separate `default_resumes` table: PK `user_id` gives at most one per user, and the composite FK `(resume_id, user_id)` ensures it's the user's own resume. The database enforces both.
- Archive is soft (data retained and readable). Delete is permanent, after confirmation. Once applications exist, deleting a referenced resume will be refused.

## Consequences

- Matching (next phase) scores `current_version_id` of each active resume. Results and applications store `resume_version_id`, which never changes meaning.
- Storage grows with versions, which is acceptable for text-sized content. Files are deduplicated within a resume.

## Update (Phase 1 completion)

Version content is now stored in normalised tables instead of one JSON document, and original files live in `resume_files` ([ADR-0012](0012-normalised-resume-content.md)). Parse status gained `NEEDS_REVIEW` (extracted, awaiting the user's confirmation). Saving structured data on a resume whose working version is frozen creates a new draft automatically.
