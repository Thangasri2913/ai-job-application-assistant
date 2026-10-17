# ADR-0020: Smart Apply — hybrid application submission

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

Users want the app to apply for them. The existing modules prepare applications (cover letters and answers, ADR-0016) and track them (ADR-0015), but submission was entirely manual.

None of the job sources can accept an application from this app:

- Adzuna and Remotive only list jobs.
- Greenhouse's and Lever's application APIs need an API key issued by the employer.

Logging in to job sites, filling forms with browser automation, or bypassing CAPTCHA, 2FA or bot protection would breach their terms. Those are not options.

## Decision

**Hybrid policy.** An application is submitted automatically only through an integration that:

- the employer or provider explicitly authorises, and
- is implemented as a `SubmissionProvider` that declares its operation, authorisation, consent, restrictions, required fields, confirmation semantics and retry policy.

Every other application is prepared and handed off. The app gives the user the official application URL with its provenance (employer posting / listing page / added by the user). The user submits it themselves and may report it. The report is stored as `USER_REPORTED`, never as confirmed.

**Production providers today: none.** `SUBMISSION_PROVIDERS` is an empty list. `SMART_APPLY_AUTO_SUBMIT_ENABLED` defaults to `false`, and every discovery source returns a clear "discovery-only" reason. Tests use a mocked provider.

**A workflow layer beside the tracker.** The new `smart_applications` table holds the submission workflow:

```
DISCOVERED → PREPARING → NEEDS_USER_INPUT ⇄ READY_FOR_REVIEW
  → AWAITING_USER_SUBMISSION → SUBMITTED (user-reported)
  → SUBMITTING → SUBMITTED (provider-confirmed) | FAILED
CANCELLED, FAILED → PREPARING (prepare again)
```

The legal moves are defined once in `SMART_APPLY_TRANSITIONS` (shared package). Every move:

- is row-locked;
- is recorded in `smart_apply_events` (append-only);
- is audited.

The tracker's `ApplicationStatus` is kept in step (PREPARING while preparing, APPLIED once submitted, SAVED on cancel), without overloading its post-submission pipeline enum.

**Answers.**

- Questions come from the employer's public form (Greenhouse `?questions=true`) or from the user.
- Only answers the user provided or confirmed are reused (`profile_answers`).
- STANDARD answers are reused as confirmed.
- SENSITIVE answers (work authorisation, salary, legal declarations and attestations) are only pre-filled, and must be confirmed for every application.
- DEMOGRAPHIC answers are never saved or reused.
- Profile facts (notice period, salary, work authorisation) are only pre-filled.
- Nothing is guessed. AI prompts treat employer text as untrusted data (`preparation@2`).

**Submission safety.**

- Consent is versioned, and changing the wording invalidates it. The user must approve each application.
- There is a per-user daily limit, enforced under a per-user advisory lock so concurrent requests can't race past it.
- The idempotency key is stored on the application and sent with every attempt. Concurrent requests are serialised by row locks.
- Retries happen only after a definite non-acceptance, with exponential backoff and bounded attempts.
- Ambiguous outcomes (timeouts, lost connections, a restart mid-attempt) are never resent. They are reconciled with the provider first.
- Confirmation references come only from the provider.

**Processing.** An in-process worker follows the existing dispatcher pattern (no Redis or BullMQ):

- a global concurrency limit, with one user's tasks run one at a time;
- a timer for due retries and reconciliations;
- restart recovery;
- graceful shutdown.

## Consequences

- **Today, nothing is ever submitted by the app.** Users get prepared materials, guided answers and a reliable handoff. Adding a real integration means:
  - an agreement with the employer or provider;
  - a `SubmissionProvider` implementation with its declared semantics;
  - mocked tests;
  - enabling `SMART_APPLY_AUTO_SUBMIT_ENABLED`.
- **Unattended processing only runs while the API process runs.** A sleeping free-tier host pauses retries and reconciliation. State is in PostgreSQL, so nothing is lost or duplicated, but timing is not guaranteed. A durable queue or scheduler (ADR-0005) is the next step before any high-volume automatic submission.
- **Employer questions exist only for Greenhouse jobs.** Other jobs only have questions the user adds; their official forms may ask more, which the handoff makes clear.
