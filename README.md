# AI Job Application Assistant

An AI-powered job-search assistant: maintain a career profile and multiple resumes, analyse jobs, find the best resume for each job (and why), tailor applications **without inventing anything**, and track outcomes.

> **Status: career profile, resume library, job analysis & resume matching, application tracking, AI-assisted application preparation interview practice, and job alerts with recommendations, with Keycloak sign-in.** Users sign in through Keycloak, build their career profile and keep multiple versioned resumes (upload PDF/DOCX, automatic extraction, review and confirmation, default resume, archive/restore, search, import to profile). Users can also paste a job posting: it is analysed (required vs preferred requirements, with evidence), compared against the career profile and **every** active resume, scored transparently, and the best resume is recommended (the user can choose another). Applications are tracked (never submitted by the product) with the exact resume version used, an append-only status history, notes, documents and a timeline. Each application can be prepared with resume suggestions, a cover letter and answers to application questions — grounded only in the user's data, never applied without review, and working without an AI provider. Users can practise for each application's interview (personalised questions, practice feedback, full mock interviews with a final report). Career Intelligence turns recorded outcomes into a funnel, resume-version and match-score performance, skill gaps and evidence-based insights — with sample-size guards and no invented numbers. Job alerts search configured job sources on a schedule (or on demand), compare every posting with all active resumes, and recommend only jobs above the user's minimum score — with the resume version to use and an explanation, plus in-app notifications. In development the only source is clearly labelled sample data (`JOB_SOURCES=dev`). Later features (analytics, settings) are clearly marked as placeholders. See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

## Stack

| Layer | Tech                                                                                 |
| ----- | ------------------------------------------------------------------------------------ |
| Web   | React 19 + Vite, React Router, TanStack Query, React Hook Form + zod, Tailwind CSS 4 |
| API   | NestJS 12 (ESM), REST, Swagger, pino, zod config, class-validator                    |
| Data  | PostgreSQL 16, Prisma 7 migrations                                                   |
| Tests | Vitest (API unit + e2e against real Postgres; React Testing Library)                 |
| Auth  | Keycloak 26 (OIDC Authorization Code + PKCE), `oidc-client-ts`, `jose`               |
| Infra | Docker Compose: Postgres, SeaweedFS (S3), Keycloak + its own Postgres                |

## Quick start

Prerequisites: Node 22 (`nvm use`), npm 11 (`npm i -g npm@11`), Docker.

```bash
npm install
./scripts/dev.sh      # or: npm run dev — local Postgres, S3 storage, Keycloak, migrations, API and web
```

It prints the URLs when everything is healthy (app: http://localhost:4200). Press Ctrl+C to stop. The first run creates `.env` from `.env.example`; local development never uses production services.

Checks: `npm run build && npm run lint && npm test && npm run test:e2e && npm run test:e2e:web`.

Full guide: [docs/LOCAL-DEVELOPMENT.md](docs/LOCAL-DEVELOPMENT.md).

| Goal                  | Command                                     | Touches                                                                                                        |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Local development** | `./scripts/dev.sh`                          | Only local Docker services and your machine; refuses production URLs                                           |
| **Deployment**        | `./scripts/deploy.sh "message"` (on `main`) | Validates, commits and pushes; Vercel and Render deploy from the push ([guide](docs/DEPLOYMENT-AUTOMATION.md)) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Product specification & roadmap](docs/PRODUCT_SPEC.md)
- [Database](docs/DATABASE.md)
- [API](docs/API.md)
- [AI architecture & trust rules](docs/AI_ARCHITECTURE.md)
- [Architecture decision records](docs/adr/README.md)
- [Local development](docs/LOCAL-DEVELOPMENT.md)
- [Career Intelligence](docs/CAREER-INTELLIGENCE.md)
- [Job discovery](docs/JOB-DISCOVERY.md)
- [Smart Apply](docs/SMART-APPLY.md)
- [Deployment (portfolio/testing: Vercel, Render, Neon, R2)](docs/DEPLOYMENT.md)
- [Deployment automation (`scripts/deploy.sh`)](docs/DEPLOYMENT-AUTOMATION.md)

## Repository

```
apps/api            NestJS API
apps/web            React + Vite app
packages/shared     Shared API contract types & domain constants
infrastructure/     Docker init scripts, Keycloak realm import
docs/               Specs, architecture, ADRs
```
