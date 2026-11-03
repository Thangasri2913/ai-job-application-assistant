# ADR-0021: Learn & Prepare — static, provenance-labelled learning catalogue

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

Users preparing for a role need structured learning, from concepts through practice and a portfolio project to interview preparation. Software development roles come first. Later phases may add progress tracking, AI-generated content and job-linked recommendations. Phase 1 needs a catalogue and a way to browse it.

Two constraints shape the design:

- Learning content must not overstate its quality. Users must be able to tell AI-drafted text from content a person reviewed. They must also be able to tell links to providers' official material from text this app wrote.
- Future per-user progress needs stable identifiers to point at.

## Decision

- **Static, typed catalogue in API code.** Paths, modules, lessons, exercises, projects and resources are TypeScript objects in `apps/api/src/modules/learning/catalogue/`, typed by `packages/shared/src/learning.ts`. They are served by two read-only endpoints:
  - `GET /learning-paths` (with `role`, `difficulty` and `status` filters);
  - `GET /learning-paths/:pathId`.

  There are no tables or migrations, and content changes are code-reviewed.

- **Integrity enforced at start-up and in tests.** The rules are slug ids, unique ids, contiguous ordering, https URLs, and a status that is consistent with the content. Counts and durations are derived from the content, not stored.
- **Explicit provenance on every item.**
  - Original content carries `{ origin, review }`. All current content is `AI_GENERATED` and `UNREVIEWED`. `REVIEWED` requires a named reviewer and a date, and is used only when a review really happened.
  - External links are `CURATED`, with a `linkCheck` that records reachability (HTTP 200 on a date), not a content review.
- **Planned paths are visible but empty.** Planned roles have `status: PLANNED` and no modules, so they cannot be mistaken for courses.
- **Auth like the rest of the API.** The endpoints are behind the global auth guard, even though the catalogue is the same for everyone. The web route sits inside the signed-in shell.
- **Untrusted rendering rules.** Lesson text is rendered as plain text. Only `https` resource URLs become links; they open in a new tab with `noopener noreferrer`. The app never fetches external pages.

## Consequences

- No migration, nothing in production data to change, and the catalogue is easy to review, diff and test.
- Content updates need a deploy. That is acceptable while content is small and curated. If authors outside the codebase need to edit it, move to a database or CMS, keeping the same ids and shared types.
- Stable ids let a later `learning_progress` table reference lessons. Ids must not be renamed once released, and removed content needs a defined "retired" behaviour.
- Two paths have full curricula; three are planned. Every content item is visibly labelled AI-generated and not reviewed until real reviews happen.
