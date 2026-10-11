# ADR-0012: Normalised resume-version content

## Context

The first Phase 1 build stored each version's confirmed content as one JSONB document. The product needs resume-specific content: an Angular resume and a full-stack resume emphasise different experience. The next phase compares a job against every resume's skills, experience and achievements. The brief asks that JSON be used only where structure is genuinely flexible.

## Decision

- Confirmed (user-reviewed) content is normalised per version:
  - columns on `resume_versions`: contact, summary, years, `achievements[]`, `languages[]`
  - rows in `resume_version_skills`, `resume_version_experiences`, `resume_version_educations`, `resume_version_projects`, `resume_version_certifications`, ordered by `sort_order`
- `resume_version_skills` is unique per version (case-insensitive) and indexed by `normalized_name` for matching queries.
- Original uploads move to `resume_files`. Versions reference a file, edits of the same resume share it, and duplicates copy it.
- Extraction output stays JSONB (`parsed_data`, `ai_extraction`). It is a suggestion, versioned by `parser_version`/prompt version, and its shape may evolve independently.
- The API contract (`ResumeContent`) is unchanged. `resume-content.repository.ts` is the only code that reads and writes the normalised form.
- The migration converted existing data in SQL inside one transaction and was verified to have no schema drift.

## Consequences

- Matching can use SQL over skills and experience across all of a user's versions.
- Writing content replaces a draft's rows, which is acceptable because only drafts are writable.
- Slightly more code than a JSON column, all contained in one repository module.
