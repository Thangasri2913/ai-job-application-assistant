# Architecture Decision Records

| #                                                | Decision                                                                                                                | Status                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [0001](0001-monorepo-structure.md)               | npm-workspaces monorepo, modular monolith                                                                               | Accepted                                      |
| [0002](0002-orm-prisma.md)                       | Prisma as ORM / migration tool                                                                                          | Accepted                                      |
| [0003](0003-ai-provider-abstraction.md)          | Provider-agnostic AI layer with validated structured output                                                             | Accepted (Anthropic provider added)           |
| [0004](0004-authentication.md)                   | JWT access token + rotating httpOnly refresh cookie                                                                     | Superseded by 0013                            |
| [0005](0005-background-jobs.md)                  | Redis + BullMQ, introduced when needed                                                                                  | Accepted (deferred; see 0011)                 |
| [0006](0006-file-storage.md)                     | S3-compatible object storage                                                                                            | Accepted (implemented; local server per 0009) |
| [0007](0007-framework-versions.md)               | NestJS 12 (ESM) / Node 22 / TypeScript 5.9 / npm 11                                                                     | Accepted                                      |
| [0008](0008-react-frontend.md)                   | React + Vite for the web app (replaces Angular)                                                                         | Accepted                                      |
| [0009](0009-local-object-storage-seaweedfs.md)   | SeaweedFS for local S3 (MinIO images unavailable)                                                                       | Accepted                                      |
| [0010](0010-resume-versioning.md)                | Resume identity + immutable versions; DB-enforced single default                                                        | Accepted                                      |
| [0011](0011-resume-parsing-pipeline.md)          | Layered parsing (deterministic → optional AI → review), in-process dispatcher                                           | Accepted                                      |
| [0012](0012-normalised-resume-content.md)        | Normalised resume-version content; `resume_files`                                                                       | Accepted                                      |
| [0013](0013-keycloak-identity-provider.md)       | Keycloak identity provider, OIDC Authorization Code + PKCE                                                              | Accepted                                      |
| [0014](0014-job-analysis-and-resume-matching.md) | Job analysis (rules + grounded AI) and deterministic matching of all resumes                                            | Accepted                                      |
| [0015](0015-application-tracking.md)             | Application tracking with the exact, immutable resume version                                                           | Accepted                                      |
| [0016](0016-ai-application-preparation.md)       | AI application preparation: grounded suggestions, versioned cover letters, answers; explicit approval                   | Accepted                                      |
| [0017](0017-interview-preparation.md)            | Interview practice and mock interviews: stored questions, immutable answers, separate evaluations, honest gap questions | Accepted                                      |
| [0018](0018-job-discovery-and-alerts.md)         | Job discovery & alerts: source adapters (dev fixtures only), per-user jobs, deterministic screening, idempotent runs    | Accepted                                      |

Template: Context → Decision → Consequences. Supersede rather than edit accepted ADRs; append an "Update" section for refinements.
