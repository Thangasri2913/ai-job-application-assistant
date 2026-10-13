# Product Specification

## Vision

A personal AI job-search agent that continuously finds relevant opportunities, chooses the right resume, helps prepare the application, tracks outcomes, and improves the candidate's job-search strategy.

## Principles

1. **Never fabricate.** The AI may rephrase the user's facts; it must never invent employers, titles, dates, projects, technologies, certifications, education, achievements, responsibilities or metrics. Where a metric is missing it suggests: _"Add a measurable result here if you have one."_
2. **Show provenance.** Every claim is labelled as _User fact_, _External source_ (e.g. the job description), _AI inference_, or _AI suggestion_. See `packages/shared/src/provenance.ts`.
3. **Originals are immutable.** Resume edits and tailoring create new versions; nothing is silently overwritten. Applications record the exact resume version sent.
4. **The user decides.** Recommendations are explained and can always be overridden. The product never submits applications on the user's behalf.
5. **Honest UI.** No fake metrics, no placeholder numbers presented as data. Unbuilt features are labelled as such.
6. **Career data is sensitive.** Strict per-user isolation, minimal logging, no PII in logs.

## Roadmap

### Phase 0 — Foundation ✅ (this release)

Monorepo, NestJS API, React app shell, PostgreSQL + migrations, authentication, health checks, error handling, logging, Swagger, AI abstraction, documentation, tests.

### Phase 1 — Core workflow

| Feature                                                   | Status                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Authentication via Keycloak (OIDC + PKCE)                 | ✅ Done                                                                    |
| Career profile (experience, skills, education, projects)  | ✅ Done                                                                    |
| Multiple resume management + versions                     | ✅ Done                                                                    |
| Resume upload (PDF/DOCX → object storage)                 | ✅ Done                                                                    |
| Resume parsing (async, structured, user-confirmable)      | ✅ Done                                                                    |
| Job input (paste description / URL text)                  | ✅ Done                                                                    |
| Job analysis (requirements, skills, explicit vs inferred) | ✅ Done                                                                    |
| Resume-to-job matching across all resumes                 | ✅ Done                                                                    |
| Best resume recommendation with explanation + override    | ✅ Done                                                                    |
| Application tracking (pipeline, resume version used)      | ✅ Done                                                                    |
| Dashboard with real metrics                               | Profile, resume and application pipeline counts; rates come with analytics |

### Phase 2 — Generation (application preparation ✅ done)

Done: grounded resume suggestions with a tailored draft (original never changed), versioned cover letters, application-question answers within word/character limits, explicit approval ([ADR-0016](adr/0016-ai-application-preparation.md)). Still to come: exporting the tailored draft as a new resume version or document, and a diff view.
Resume tailoring (new version, diff vs. original, every change traceable to a source fact), cover letters, application messages.

### Phase 3 — Interview & insights (interview preparation ✅ done)

Done (career intelligence, [ADR-0019](adr/0019-career-intelligence.md)): outcome tracking (technical interview, accepted, rejection categories, offer details, actual dates), funnel and conversion analytics, resume-version and match-score performance, skill gaps, guarded pattern detection and evidence-based insights (rules, optional AI).

Done: personalised practice and mock interviews with stored questions, immutable answers, practice feedback (AI or rule-based) and reports ([ADR-0017](adr/0017-interview-preparation.md)). Still to come: voice/video practice.
Interview preparation per job; career insights from application outcomes.

### Phase 4 — Discovery

Job alerts (roles, location, work type, experience, minimum match, schedule, timezone), scheduled discovery via permitted sources, ranking, notifications, daily digest.

Done: job alerts with time-zone-aware schedules and Run Now, the source-adapter pipeline (normalise, de-duplicate, screen against every resume, full analysis, rank, explain), recommendations (save/dismiss/applied) and in-app notifications ([ADR-0018](adr/0018-job-discovery-and-alerts.md)). Only a development fixture source exists, labelled as sample data. Still to come: real job sources (official APIs/feeds), email digest.

### Later

Subscriptions/billing, usage limits, admin tooling.

## Matching (Phase 1 design intent)

For a job, every resume (latest version) is scored. Recommendation priority:

1. Relevant experience
2. Relevant responsibilities
3. Relevant skills
4. Relevant achievements
5. Keyword coverage

The explanation lists strengths, gaps and missing skills, each with provenance. The user can pick a different resume.

## Application pipeline stages

Saved → Applied → Recruiter Screen → Assessment → Interview → Final Interview → Offer, plus terminal Rejected / Withdrawn / No Response. Defined in `packages/shared/src/applications.ts`.

## Dashboard metrics (when data exists)

Applications, Interviews, Offers, Rejections, Pending, Response rate, Interview rate, Offer rate — computed only from the user's own data.
