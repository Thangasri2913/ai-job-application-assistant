# Smart Apply

Smart Apply prepares job applications, asks the user for anything only they can provide, and either:

- **submits automatically**, only through an integration the employer or provider explicitly authorises (none exists today); or
- **hands off**: the user opens the official application page, submits it there, and may report that they did.

The design decision is recorded in [ADR-0020](adr/0020-smart-apply.md).

## Supported vs unsupported submission

| Path                                        | Status                                                                             | How it is confirmed                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Provider integration (`SubmissionProvider`) | **Interface only. No production integration exists.** Tests use a mocked provider. | `PROVIDER_CONFIRMED`: a successful provider response, with the provider's own reference if it gives one. |
| Handoff to the official site                | **Works for every job.**                                                           | `USER_REPORTED`: the user's own report. Labelled "Reported by you (not verified)".                       |

Job sources are discovery-only:

| Source                  | Why it can't submit                                          |
| ----------------------- | ------------------------------------------------------------ |
| Greenhouse              | Its application API needs an API key issued by the employer. |
| Lever                   | Its application API needs an API key issued by the employer. |
| Adzuna                  | Lists jobs only; no application API.                         |
| Remotive                | Lists jobs only; no application API.                         |
| Development sample jobs | Can't be applied to.                                         |

The app never uses browser automation, stored passwords, or CAPTCHA, 2FA or bot-protection bypasses.

### Adding an authorised integration

1. Get explicit authorisation from the employer or provider, e.g. an API key issued for this purpose.
2. Implement `SubmissionProvider` (`apps/api/src/modules/smart-apply/submission/submission-provider.ts`). It must declare `capabilities`: operation, authorisation, consent, restrictions, required fields, confirmation semantics and retry policy. It also needs `supports(target)`, `submit()` and `reconcile()`.
3. `submit()` must return:
   - `CONFIRMED` only on the provider's success response;
   - `REJECTED` (with `retryable`) only when the provider states the application was not accepted;
   - `AMBIGUOUS` otherwise.

   It must honour the idempotency key.

4. Register it in the `SUBMISSION_PROVIDERS` factory and test it with a mocked transport.
5. Set `SMART_APPLY_AUTO_SUBMIT_ENABLED=true`.

## Workflow

| State                      | Meaning                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DISCOVERED`               | Job chosen for Smart Apply                                                                           |
| `PREPARING`                | Background preparation: job analysis if missing, cover letter, employer questions, answer resolution |
| `NEEDS_USER_INPUT`         | Required questions lack a confirmed answer                                                           |
| `READY_FOR_REVIEW`         | AI-prepared; awaiting the user's review and approval                                                 |
| `AWAITING_USER_SUBMISSION` | Approved; submit on the official site                                                                |
| `SUBMITTING`               | Sent to an authorised integration. If `uncertain` (needs reconciliation), it is never resent.        |
| `SUBMITTED`                | `PROVIDER_CONFIRMED` or `USER_REPORTED`                                                              |
| `FAILED`                   | Preparation failed, or the provider permanently rejected it. The user can prepare again or hand off. |
| `CANCELLED`                | Cancelled before anything was sent. It can be prepared again.                                        |

`SMART_APPLY_TRANSITIONS` in `packages/shared/src/smart-apply.ts` defines every legal move; anything else is a 409. The tracker's status follows the workflow:

| Smart Apply             | Tracker status                  |
| ----------------------- | ------------------------------- |
| Preparing               | `PREPARING`                     |
| Submitted (either kind) | `APPLIED`, with a history entry |
| Cancelled               | `SAVED`                         |

A tracker status the user set further along themselves is never changed.

## Answers and consent

- **Questions come from two places.** For Greenhouse jobs, the employer's own form is read from the public Job Board API (`?questions=true`). Contact and file fields are skipped, and voluntary demographic sections are left to the official form. The user can also add questions.
- **Sensitivity is decided per question:**
  - STANDARD answers can be saved and reused as confirmed.
  - SENSITIVE answers (work authorisation, salary, legal declarations and attestations) are pre-filled from a saved answer or the profile, but need explicit confirmation for each application.
  - DEMOGRAPHIC answers are voluntary, used only for the current application, and never saved.
- **Reuse:**
  - Saved answers are keyed by meaning only where the meaning is fixed (notice period, salary). Anything else (including work authorisation and location) must have the same wording.
  - Motivation answers are never reused.
  - Salary and notice-period answers expire after 90 days; others after 365.
  - Answers outside the employer's options are never reused.
- **No guessing, and data stays out of logs.** A question without a provided answer waits for the user. Audit events never contain answer text.
- **Automatic-submission consent** is versioned (`AUTO_SUBMIT_CONSENT_VERSION`), so changing the wording invalidates earlier consent. Each application still needs the user's approval.

## Limits and reliability

| Setting                                 | Default     | Notes                                                            |
| --------------------------------------- | ----------- | ---------------------------------------------------------------- |
| Applications prepared per user per 24 h | 10 (max 50) | User setting                                                     |
| Automatic submissions per user per 24 h | 3 (max 20)  | User setting. Enforced under a per-user advisory lock.           |
| `SMART_APPLY_MAX_CONCURRENT`            | 2           | Global background-task limit; one user's tasks run one at a time |
| `SMART_APPLY_MAX_SUBMISSION_ATTEMPTS`   | 3           | Retries only after a definite non-acceptance                     |
| `SMART_APPLY_RETRY_BASE_SECONDS`        | 60          | Backoff: base × 2^(attempt−1)                                    |
| `SMART_APPLY_WORKER_INTERVAL_SECONDS`   | 30          | Checks for due retries and reconciliations                       |
| `SMART_APPLY_AUTO_SUBMIT_ENABLED`       | `false`     | Global kill switch                                               |
| `SMART_APPLY_FETCH_EMPLOYER_QUESTIONS`  | `true`      | Reads Greenhouse forms                                           |

- **Duplicate protection:**
  - one Smart Apply application per user and job (unique constraint);
  - one active tracker application per job;
  - the idempotency key is stored on the application and sent with every attempt;
  - concurrent submit requests are serialised by row locks.
- **Ambiguous outcomes** (timeout, lost connection, a restart mid-attempt) are marked `AMBIGUOUS` and reconciled with the provider before anything else happens. The user can report the submission themselves meanwhile.
- **Hosting limitation:** the worker is in-process. On a sleeping host, retries and reconciliations wait until the process wakes. State is durable in PostgreSQL, but timing is not guaranteed; see ADR-0020.

## API (all authenticated; ids are ownership-checked)

| Method and path                                                                                                      | Purpose                                                      |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/v1/smart-apply/settings` · `PUT …/settings`                                                                | Mode, limits, consent, notification preferences              |
| `GET /api/v1/smart-apply/applications?state=A,B&sort=updatedAt\|createdAt\|matchScore&order=desc&page=1&pageSize=20` | List                                                         |
| `POST /api/v1/smart-apply/applications` `{ jobId, resumeVersionId? }` → 202                                          | Prepare (idempotent per job)                                 |
| `GET …/applications/:id`                                                                                             | Detail: questions, materials, eligibility, history, attempts |
| `GET …/applications/:id/materials`                                                                                   | Resume version content, cover letter, answers                |
| `GET …/applications/:id/eligibility`                                                                                 | Why it is or isn't eligible for automatic submission         |
| `PUT …/applications/:id/questions/:questionId/answer` `{ answer, confirm, saveForReuse? }`                           | Answer (auto-resumes when complete)                          |
| `POST …/applications/:id/resume` → 202                                                                               | Prepare again                                                |
| `POST …/applications/:id/approve`                                                                                    | Approve. Hands off unless eligible.                          |
| `POST …/applications/:id/handoff`                                                                                    | Submit on the official site instead                          |
| `POST …/applications/:id/submit` (header `Idempotency-Key`) → 202                                                    | Authorised integration only                                  |
| `GET …/applications/:id/submission`                                                                                  | Submission status and attempts                               |
| `POST …/applications/:id/manual-submission` `{ confirm: true, submittedOn?, note? }`                                 | User-reported submission                                     |
| `POST …/applications/:id/cancel`                                                                                     | Before submission                                            |
| `GET /api/v1/smart-apply/questions`                                                                                  | Inbox of required questions                                  |
| `GET /api/v1/smart-apply/saved-answers` · `DELETE …/saved-answers/:id`                                               | Reusable answers                                             |

Example (placeholder data):

```bash
curl -X POST "$API/api/v1/smart-apply/applications" \
  -H "Authorization: Bearer <access-token>" -H "Content-Type: application/json" \
  -d '{"jobId":"00000000-0000-0000-0000-000000000001"}'

curl -X PUT "$API/api/v1/smart-apply/applications/<id>/questions/<questionId>/answer" \
  -H "Authorization: Bearer <access-token>" -H "Content-Type: application/json" \
  -d '{"answer":"No","confirm":true,"saveForReuse":true}'

curl -X POST "$API/api/v1/smart-apply/applications/<id>/manual-submission" \
  -H "Authorization: Bearer <access-token>" -H "Content-Type: application/json" \
  -d '{"confirm":true}'
```

Errors use the standard shape:

| Status | Error codes                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| 409    | `INVALID_STATE_TRANSITION`, `ANSWERS_REQUIRED`, `AUTO_SUBMIT_NOT_ALLOWED`, `SUBMISSION_IN_PROGRESS`, `ALREADY_SUBMITTED` |
| 429    | `DAILY_LIMIT_REACHED`                                                                                                    |
| 422    | `RESUME_REQUIRED`                                                                                                        |

## Notifications

When the user's preferences allow, in-app notifications are sent for:

- `SMART_APPLY_INPUT_NEEDED`: answers needed;
- `SMART_APPLY_SUBMISSION_UPDATE`: confirmed, failed or uncertain.

The push contract (`SmartApplyNotificationPayload`: event, id, link; never answers or personal data) is defined in the shared package. Push delivery is future work and needs no third-party service today.

## Database migration

The migration is `20261013200000_smart_apply` and is additive only. It adds:

- new tables and enums;
- two `NotificationType` values;
- nullable or defaulted columns on `application_questions`.

To apply it locally, run `npm run db:migrate:deploy` with `.env` pointing at local Docker. Production applies it through the existing Render deploy (`prisma migrate deploy`).

## Files

- **API module:** `apps/api/src/modules/smart-apply/`
  - `smart-apply.service.ts`
  - `in-process-smart-apply-worker.ts`
  - `answer-policy.ts`
  - `eligibility.ts`
  - `employer-questions.ts`
  - `submission/submission-provider.ts`
  - controller, DTOs, mapper
- **Shared contract:** `packages/shared/src/smart-apply.ts` (states, transitions, display labels, types)
- **Web:** `apps/web/src/features/smart-apply/`. Entry points are "Prepare application" on recommendation cards and job pages.
- **Tests:**
  - API unit specs in the module;
  - `apps/api/test/smart-apply.e2e-spec.ts`;
  - `apps/web/src/features/smart-apply/pages/smart-apply.test.tsx`;
  - `apps/web/e2e/smart-apply-smoke.spec.ts`.
- **Other changes:**
  - AI prompts are hardened against instructions embedded in job or application text (`preparation@2`);
  - the API accepts an optional `KEYCLOAK_MOBILE_CLIENT_ID`.
