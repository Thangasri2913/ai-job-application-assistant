# AI Job Application Assistant

An AI-powered job-search assistant: maintain a career profile and multiple resumes, analyse jobs, find the best resume for each job (and why), tailor applications **without inventing anything**, and track outcomes.

> **Status: career profile, resume library, job analysis & resume matching, application tracking, AI-assisted application preparation interview practice, and job alerts with recommendations, with Keycloak sign-in.** Users sign in through Keycloak, build their career profile and keep multiple versioned resumes (upload PDF/DOCX, automatic extraction, review and confirmation, default resume, archive/restore, search, import to profile). Users can also paste a job posting: it is analysed (required vs preferred requirements, with evidence), compared against the career profile and **every** active resume, scored transparently, and the best resume is recommended (the user can choose another). Applications are tracked (never submitted by the product) with the exact resume version used, an append-only status history, notes, documents and a timeline. Each application can be prepared with resume suggestions, a cover letter and answers to application questions — grounded only in the user's data, never applied without review, and working without an AI provider. Users can practise for each application's interview (personalised questions, practice feedback, full mock interviews with a final report). Job alerts search configured job sources on a schedule (or on demand), compare every posting with all active resumes, and recommend only jobs above the user's minimum score — with the resume version to use and an explanation, plus in-app notifications. In development the only source is clearly labelled sample data (`JOB_SOURCES=dev`). Later features (analytics, settings) are clearly marked as placeholders. See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

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

```bash
nvm use                         # Node 22
npm i -g npm@11                 # npm 10.9 can't install this graph
cp .env.example .env            # set DB password (also in both URLs), S3 keys, Keycloak passwords
npm install
npm run db:up                   # Postgres :5434, S3 :8333, Keycloak :8180 (wait ~30 s until healthy)
npm run db:migrate:deploy
npm run dev:api                 # http://localhost:3000/api/docs
npm run dev:web                 # http://localhost:4200 → "Create account" (handled by Keycloak)
```

Checks: `npm run build && npm run lint && npm test && npm run test:e2e && npm run test:e2e:web`.

Full guide: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Product specification & roadmap](docs/PRODUCT_SPEC.md)
- [Database](docs/DATABASE.md)
- [API](docs/API.md)
- [AI architecture & trust rules](docs/AI_ARCHITECTURE.md)
- [Architecture decision records](docs/adr/README.md)
- [Deployment (portfolio/testing: Vercel, Render, Neon, R2)](docs/DEPLOYMENT.md)

## Repository

```
apps/api            NestJS API
apps/web            React + Vite app
packages/shared     Shared API contract types & domain constants
infrastructure/     Docker init scripts, Keycloak realm import
docs/               Specs, architecture, ADRs
```
