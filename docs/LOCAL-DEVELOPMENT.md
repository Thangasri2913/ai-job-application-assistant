# Local development

## Quick start

```bash
git clone <repository-url>
cd JOB-ASSIST
npm install            # optional: ./scripts/dev.sh installs dependencies if they are missing
./scripts/dev.sh       # or: npm run dev
```

On first run `dev.sh` creates `.env` from `.env.example`. Its placeholder passwords work for local development as they are, so no further configuration is required. After that, `./scripts/dev.sh` is the only command you need.

## Local development vs. deployment

These are two separate workflows:

|               | Local development                                                                                 | Deployment                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Command       | `./scripts/dev.sh`                                                                                | `./scripts/deploy.sh "message"`                                                                                        |
| Runs          | Local Docker services (PostgreSQL, S3 storage, Keycloak), the API and the web app on your machine | Checks (format, lint, typecheck, build, tests), then commits and pushes `main`; Vercel and Render deploy from the push |
| Configuration | Your local `.env` (local values only: `dev.sh` refuses production URLs)                           | Production values live only in the Vercel and Render settings, never in `.env` or the repository                       |
| Guide         | This document                                                                                     | [DEPLOYMENT-AUTOMATION.md](DEPLOYMENT-AUTOMATION.md), [DEPLOYMENT.md](DEPLOYMENT.md)                                   |

## Prerequisites

| Tool          | Version                                  | Notes                                                                        |
| ------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| Node.js       | 22.x (≥ 22.12; pinned 22.18 in `.nvmrc`) | `nvm use`. Node 18 is not supported.                                         |
| npm           | 11+                                      | `npm i -g npm@11`. npm 10.9 crashes on this dependency graph (`edgesOut`).   |
| Docker        | with Compose v2, daemon running          | Runs PostgreSQL, S3-compatible storage, Keycloak and Keycloak's PostgreSQL   |
| curl          | any                                      | Used by `dev.sh` for health checks                                           |
| Google Chrome | any current                              | Only for the browser end-to-end tests (Playwright uses the installed Chrome) |

Supported environment: Linux and macOS with bash. On Windows, use WSL2.

## One-command startup: `./scripts/dev.sh`

What it does, in order (any failure stops it with an explanation):

1. **Checks prerequisites:**
   - Node, npm 11, Docker Compose and the Docker daemon are available.
   - Creates `.env` from `.env.example` if it is missing; an existing `.env` is never overwritten.
   - **Refuses production configuration.** It stops if `DATABASE_URL`, `DIRECT_DATABASE_URL`, `TEST_DATABASE_URL` or `S3_ENDPOINT` aren't local, if Keycloak or `VITE_API_URL` point at a remote host, or if `NODE_ENV=production`. It shows host names only, never values.
   - Checks that the API and web ports are free.
2. **Starts local infrastructure** with `npm run db:up` (PostgreSQL, SeaweedFS S3, Keycloak and its database), and waits until PostgreSQL is healthy, storage answers and Keycloak serves the realm's discovery document.
3. **Prepares the database:**
   - installs dependencies if `node_modules` is missing (`npm ci`);
   - builds `packages/shared` if needed;
   - runs `prisma generate`, then `prisma migrate deploy` against the **local** database. The URL is passed explicitly, so no other database can be reached.
4. **Starts the API** with `npm run dev:api` (tsc-watch: recompiles and restarts on changes).
5. **Starts the web app** with `npm run dev:web` (Vite with hot reload).
6. **Health checks:** waits for `GET /api/v1/health`, reports `GET /api/v1/health/ready` (database, storage, Keycloak), then checks that the web app serves. It then prints the URLs.

Output from both servers appears in the terminal prefixed `[api]` / `[web]`, and is also written to `.dev/api.log` and `.dev/web.log` (git-ignored).

| Option          | Effect                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--no-install`  | Never install dependencies (fails if `node_modules` is missing)                                                                                |
| `--no-keycloak` | Don't start the local Keycloak; use another **development** Keycloak configured in `.env` (it must be reachable; production hosts are refused) |
| `--reset-db`    | Reset the **local** database first (deletes all its data). Asks you to type `reset`                                                            |
| `--help`        | Usage                                                                                                                                          |

Pass options through npm with `npm run dev -- --no-install`.

### Stopping

Press **Ctrl+C**. `dev.sh` stops only the API and web processes it started; it stops them as process groups and never kills other Node processes. The Docker containers keep running so the next start is fast. Stop them with `npm run db:down` (data is kept in Docker volumes).

If the API or web server exits on its own, `dev.sh` names which one stopped, prints the last lines of its log and stops the other.

Running `dev.sh` again is safe: containers are reused, migrations that are already applied are skipped, and `.env` is left alone.

### Local URLs

Ports come from `.env` (`API_PORT`, `POSTGRES_HOST_PORT`, `S3_HOST_PORT`, `KEYCLOAK_HOST_PORT`) and `apps/web/vite.config.ts`; `dev.sh` prints the ones in use.

| What                        | Default URL                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------- |
| App                         | http://localhost:4200                                                              |
| OIDC callback (React route) | http://localhost:4200/auth/callback                                                |
| API                         | http://localhost:3000/api/v1 (Swagger at /api/docs when `SWAGGER_ENABLED=true`)    |
| API health / readiness      | http://localhost:3000/api/v1/health · /api/v1/health/ready                         |
| Keycloak admin console      | http://localhost:8180/admin (user `KEYCLOAK_ADMIN_USERNAME`, password from `.env`) |
| Realm issuer                | http://localhost:8180/realms/ai-job-assistant                                      |
| OIDC discovery              | http://localhost:8180/realms/ai-job-assistant/.well-known/openid-configuration     |
| User self-service (account) | http://localhost:8180/realms/ai-job-assistant/account                              |
| PostgreSQL                  | localhost:5434 (databases `job_assist` and `job_assist_test`)                      |
| S3-compatible storage       | http://localhost:8333                                                              |

## Local services

**PostgreSQL** runs in Docker (`postgres` service, port 5434). `job_assist` is the development database and `job_assist_test` is used only by the API integration tests. The local `.env` must point `DATABASE_URL` **and** `DIRECT_DATABASE_URL` at it; `dev.sh` refuses anything else. Production database URLs belong only in Render.

**Object storage:** locally, resume and document files go to SeaweedFS, an S3-compatible container (`object-storage`, port 8333, [ADR-0009](adr/0009-local-object-storage-seaweedfs.md)). The API uses the same S3 code path as production (Cloudflare R2), so **no R2 account or credentials are needed locally**. The local S3 keys in `.env` are arbitrary; the container is configured from them. Never put R2 credentials in your local `.env`: `dev.sh` refuses a non-local `S3_ENDPOINT`.

**AI provider:** `AI_PROVIDER=none` (the default) needs no key, and every feature works with its rule-based layer, with notes in the UI saying that AI isn't configured. To try AI locally, set `AI_PROVIDER=anthropic`, `AI_MODEL` and `ANTHROPIC_API_KEY` in `.env`. `AI_PROVIDER=mock` is only for tests.

**Background work** (resume parsing, job analysis, job-alert searches and the alert scheduler, career-insight generation) runs inside the API process. There is no Redis and no separate worker to start.

## Authentication (Keycloak)

Design and security rationale: [ADR-0013](adr/0013-keycloak-identity-provider.md).

- The realm, client, roles and audience mapper are imported from `infrastructure/keycloak/ai-job-assistant-realm.json` when Keycloak first starts. Import **skips a realm that already exists**. To re-import after editing the file: `docker compose rm -sf keycloak keycloak-db && docker volume rm ai-job-assistant_keycloak-db-data && npm run db:up`. This deletes all local Keycloak users; check the volume name first with `docker volume ls`.
- **Create a test account:** open http://localhost:4200 → **Create account**. Enter a throwaway email and a password of 12+ characters that doesn't contain the email. Don't commit test credentials. Alternatively, create one in the admin console: realm `ai-job-assistant` → Users → Add user, then Credentials → Set password (Temporary: off).
- **Flow:**
  1. Sign in redirects to Keycloak (PKCE S256).
  2. Keycloak sends the browser back to `/auth/callback`.
  3. The app lands on the page you came from, or `/dashboard`.
  4. The first API call creates your local user, keyed by Keycloak `sub`.
  5. Reloading keeps the session (sessionStorage). Closing the tab ends it locally.
- **Log out** ends the Keycloak session too; the next sign-in asks for credentials again.
- **Roles:** every user gets the realm role `user`. Roles come from the token's `realm_access.roles`.
- **Existing (pre-Keycloak) users:** see "Migrating existing users" in ADR-0013. Locally, mark the Keycloak user's email as verified before their first sign-in to link them to their old data.

## Environment variables

| Variable                                                                                                                                            | Default           | Purpose                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`, `LOG_LEVEL`                                                                                                                             | development, info | Runtime and log level (pino; secrets redacted)                                                                                           |
| `API_PORT`, `CORS_ORIGINS`, `SWAGGER_ENABLED`, `TRUST_PROXY_HOPS`                                                                                   | 3000, –, false, 0 | HTTP                                                                                                                                     |
| `DATABASE_URL`, `TEST_DATABASE_URL`                                                                                                                 | –                 | PostgreSQL (dev / integration tests)                                                                                                     |
| `POSTGRES_*`, `POSTGRES_HOST_PORT`                                                                                                                  | – , 5434          | Docker Compose database                                                                                                                  |
| `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_AUDIENCE`                                                                                    | –                 | API token validation: issuer `http://localhost:8180/realms/ai-job-assistant`, `azp` `ai-job-assistant-web`, `aud` `ai-job-assistant-api` |
| `KEYCLOAK_HOST_PORT`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_DB_PASSWORD`                                                  | 8180, admin, –, – | Docker Compose Keycloak (never read by the API or the browser)                                                                           |
| `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`, `VITE_API_URL`                                                               | –, –, –, /api/v1  | React (public values only; Vite exposes just `VITE_*`)                                                                                   |
| `RATE_LIMIT_TTL_SECONDS`, `RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_MAX`, `JOB_ANALYSIS_RATE_LIMIT_MAX`                                                  | 60, 100, 10, 20   | Rate limits (per client, per window)                                                                                                     |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_AUTO_CREATE_BUCKET`, `S3_HOST_PORT` | –                 | Resume file storage ([ADR-0009](adr/0009-local-object-storage-seaweedfs.md)). Production: managed S3, auto-create off.                   |
| `RESUME_MAX_UPLOAD_BYTES`                                                                                                                           | 5242880           | Upload size limit                                                                                                                        |
| `AI_PROVIDER`                                                                                                                                       | none              | `none` · `mock` · `anthropic`                                                                                                            |
| `AI_MODEL`, `ANTHROPIC_API_KEY`                                                                                                                     | claude-opus-5, –  | Only for `AI_PROVIDER=anthropic`                                                                                                         |

One `.env` at the repo root serves Compose, the API, Prisma and Vite (`envDir: '../..'`). Never put a secret in a `VITE_*` variable: it ends up in the browser bundle.

All API variables are validated at startup (`apps/api/src/config/env.schema.ts`). The API refuses to start with invalid configuration and names the bad variables, never their values.

## Running tests and other commands

| Task                                                                               | Command                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------- |
| Build everything                                                                   | `npm run build`                         |
| Lint                                                                               | `npm run lint`                          |
| Type-check                                                                         | `npm run typecheck`                     |
| Unit tests (API + web)                                                             | `npm test`                              |
| API integration tests (real Postgres + S3)                                         | `npm run test:e2e`                      |
| Browser end-to-end tests against real Keycloak (starts API and web if not running) | `npm run test:e2e:web`                  |
| Follow Keycloak logs                                                               | `npm run keycloak:logs`                 |
| Format                                                                             | `npm run format`                        |
| New migration after editing `schema.prisma`                                        | `npm run db:migrate -- --name <change>` |
| Apply migrations                                                                   | `npm run db:migrate:deploy`             |
| Prisma Studio                                                                      | `npm run db:studio -w @job-assist/api`  |
| Start everything locally                                                           | `./scripts/dev.sh` (or `npm run dev`)   |
| Stop infrastructure                                                                | `npm run db:down`                       |

API integration tests don't need Keycloak: they swap the JWKS for a local test key pair and sign tokens with it, so the real verifier (issuer, audience, `azp`, expiry, signature) still runs. The Playwright tests register fresh throwaway accounts in the real Keycloak each run:

- `keycloak-auth.spec.ts`: register, log out, sign in again as the same user.
- `phase1-workflow.spec.ts`: profile → upload → review → library.
- `interview-smoke.spec.ts`: from an application, open interview preparation, run technical practice (answer + feedback), complete a 10-question mock interview (no feedback until the end), check the report persists after a refresh, open the earlier session from history, upload v2 of the resume and confirm the sessions stay on v1. A second user gets 404.
- `application-preparation-smoke.spec.ts`: from an analysed job and its application, open preparation, confirm the exact version, generate suggestions and accept/reject/edit them, view the tailored draft, generate, edit and approve a cover letter (stored as a DOCX document), add a question with a word limit, generate, edit and approve the answer, approve the preparation, reload to confirm everything persisted, then upload v2 of the resume and confirm the application and preparation stay on v1. A second user gets 404.
- `application-tracking-smoke.spec.ts`: track an application from an analysed job (recommended version preselected), move it to Applied, add a note and a cover letter, move it to Interview, check the timeline, upload v2 of the resume and confirm the application still uses v1, see it in the list and the dashboard pipeline, and a second user gets 404.
- `job-matching-smoke.spec.ts`: add a realistic job, analyse it, compare two reviewed resumes (PDF and DOCX), see scores, evidence and the recommendation, choose another resume, edit the job and see the recommendation change, and a second user gets 404 on the job.
- `career-resume-smoke.spec.ts`: the full career profile + resume library smoke test (profile, experience, skills, PDF and DOCX uploads, review, default rules, new version, archive/restore, and a second user who gets 404 on the first user's resume).

They **reuse** an API on :3000 and Vite on :4200 if they are already running (your `dev:api`/`dev:web`), otherwise they start them. They write to the development database, but only for the new throwaway users.

Integration tests apply migrations to `job_assist_test`, truncate between tests, and use a separate `job-assist-test` bucket. They refuse to run without `TEST_DATABASE_URL`, or if it is the same as `DATABASE_URL`/`DIRECT_DATABASE_URL`. **Run only one `npm run test:e2e` at a time:** concurrent runs truncate each other's data and fail with deadlocks or spurious 404s.

## Database migration workflow

1. Edit `apps/api/prisma/schema.prisma`.
2. Create a migration against the local database: `npm run db:migrate -- --name <change>`. It is applied locally and the client regenerated.
3. Commit the new folder under `apps/api/prisma/migrations/`. Never edit a migration that has already been applied anywhere.
4. Other developers get it automatically: `dev.sh` runs `prisma migrate deploy` on every start.
5. Production applies pending migrations when the API container starts on Render (see [DEPLOYMENT.md](DEPLOYMENT.md)).

`dev.sh` never resets the database unless you pass `--reset-db` and confirm.

## Resetting local infrastructure completely

This deletes **all local data**: the development and test databases, stored files and local Keycloak users.

```bash
docker compose down --volumes   # stops containers and deletes the postgres, object-storage and keycloak-db volumes
./scripts/dev.sh                # recreates everything, imports the Keycloak realm, applies migrations
```

To reset only the development database: `./scripts/dev.sh --reset-db`.

## Project layout

```
apps/api/src
  config/          env schema + typed config
  common/          errors, filters, decorators (Public, CurrentUser, rate limits), validation
  database/        PrismaService
  modules/
    auth/          Keycloak token verifier (jose), global AuthGuard, GET /auth/me
    users, health, audit
    profile/       career profile + sections (skills, experience, education, projects,
                   certifications, languages, achievements), import from resume
    resumes/       library, versions, upload validation, parsing pipeline, structured data
    overview/      profile completion, dashboard summary
    jobs/          job intake, analysis (rules + optional AI), deterministic matching, recommendation
    applications/  application tracking: exact resume version, status history, notes, documents, timeline
    application-preparation/ suggestions, tailored draft, cover letters, answers (rules + grounded AI), approval
    interviews/    practice & mock interviews: stored questions, immutable answers, evaluations, reports
    storage/       StorageService (S3; in-memory for unit tests)
    ai/            AiService + providers (none, mock, anthropic)
  generated/       Prisma client (git-ignored)
apps/api/prisma    schema + migrations
apps/api/test      integration tests (supertest, real DB/S3)

apps/web/src
  lib/api          HTTP client (bearer token, renew once on 401), upload with progress, download
  lib/auth         token source (OIDC session → HTTP client)
  features/
    auth/          OIDC config + provider, AuthProvider, route guards, login/callback/error pages
    career-profile/ pages, section components/forms, hooks (TanStack Query), zod schemas
    resumes/       library/detail/review pages, upload dialog, content editor/view, hooks, services
    dashboard/     dashboard page + summary query
    placeholder/   clearly labelled "not available yet" pages
  layout/          AppShell, AuthLayout, navigation
  shared/ui/       design-system primitives (Button, TextField, Dialog, TagInput, …)
  router.tsx       route tree (lazy-loaded pages)
apps/web/e2e       Playwright browser tests
packages/shared    API contract types and enums shared by web and api
```

## Troubleshooting

- **Sample jobs locally**: `JOB_SOURCES=dev` (the default in `.env.example`) uses built-in sample postings, clearly labelled "Sample data". To try real jobs locally, register with Adzuna and set `JOB_SOURCES=adzuna` (or `adzuna,dev`) with `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` in your local `.env`; mind the 250 requests/day allowance.
- **Job alerts find nothing / no recommendations**: the API log shows `Job discovery sources: …` at startup — locally it should list `dev (sample data)` (`JOB_SOURCES=dev` in `.env`). A run's outcome and reason are shown on the alert card (e.g. no reviewed resume, nothing above the minimum match score) and in its run history. The scheduler runs every 60 s; **Run now** uses the same pipeline.

- **`dev.sh` says a URL points at a remote host**: your `.env` contains non-local values (for example production Neon or R2). Replace them with the local values from `.env.example`. Production values belong only in Render and Vercel.
- **`dev.sh` says a port is already in use**: an API or web server is already running (e.g. your own `npm run dev:api`). Stop it first; `dev.sh` never stops processes it didn't start.
- **`dev.sh` waits for Keycloak and times out**: first starts take longer. Check `npm run keycloak:logs`, then run `dev.sh` again.

- **`Invalid environment configuration`**: the message lists the variables to fix.
- **`npm error … edgesOut`**: you're on npm 10.9. Use npm 11.
- **Port 5432/6379 already in use**: this project uses 5434 for Postgres and no Redis. Change `POSTGRES_HOST_PORT` and both database URLs if 5434 is taken.
- **Readiness reports storage down**: run `docker compose up -d object-storage` and check that the S3 keys in `.env` match.
- **Test DB missing on an old volume**: `docker compose exec postgres createdb -U job_assist job_assist_test`.
- **Readiness reports `identityProvider` down / UI says sign-in unavailable / API returns 503 `IDENTITY_PROVIDER_UNAVAILABLE`**: Keycloak isn't up yet or `KEYCLOAK_ISSUER_URL` is wrong. Check `docker compose ps keycloak` and `npm run keycloak:logs`, and open the discovery URL above. The API caches discovery, so restart it if Keycloak was down when it first needed it.
- **Keycloak page says "Invalid parameter: redirect_uri"**: the app isn't on `http://localhost:4200`. The realm allows exactly `http://localhost:4200/auth/callback`; for another origin, edit the client's redirect URIs and web origins in the admin console, plus `CORS_ORIGINS`.
- **Every API call returns 401 after login**: the token's `iss` must equal `KEYCLOAK_ISSUER_URL` exactly. Use `localhost` in both places, never `127.0.0.1` in one and `localhost` in the other; `KC_HOSTNAME` pins the issuer. Also check that `aud` contains `ai-job-assistant-api` (the audience mapper on the client).
- **Sent back to `/login?reason=expired`**: silent renewal failed (the Keycloak session ended or was revoked). Sign in again.
- **Keycloak container restarts / unhealthy**: `KEYCLOAK_DB_PASSWORD` changed after the first start. Either restore the old value, or remove the `keycloak-db-data` volume, which deletes local Keycloak users.
- **Admin password doesn't work**: it was fixed on Keycloak's first start, so changing `KEYCLOAK_ADMIN_PASSWORD` later has no effect. Use the original value, or recreate the `keycloak-db-data` volume (this deletes local Keycloak users).
- **Upload says "Resume could not be parsed."**: the file is stored; the dialog shows why (e.g. a scanned PDF with no selectable text — there is no OCR). Use **Retry**, **Upload another file**, or **Continue manually** to type the details in.
- **A resume stays "Processing…" after an API restart**: parsing runs in-process, and pending versions are re-queued when the API starts. If one is still stuck, open it and use **Retry** (`POST /resumes/:id/versions/:vid/parse`).
- **Upload rejected with `UNSUPPORTED_FILE_TYPE`**: the file's content must really be PDF or DOCX; the browser's MIME type and a renamed extension are not trusted.
- **Job analysis says it couldn’t find any skills or requirements**: the pasted text has no recognisable requirements (e.g. only a company blurb). Paste the full posting including the requirements and responsibilities, then **Try again**.
- **A job shows “Your resumes changed after this analysis”**: you uploaded, reviewed or archived resumes since the run. **Analyse again** compares the current versions; earlier results stay attached to the versions they used.
- **A resume is listed under “Not compared”**: it has no reviewed current version. Review its upload (Resumes → the resume → Review now), then analyse the job again.
- **Deleting a resume or job fails with “used for applications”**: applications must keep the exact resume version and job they refer to. Archive the resume or job instead; existing applications keep working.
- **“You already have an application for this job”**: each job has at most one active application. Open it from the link, or archive it first if you really applied twice.
- **A status isn’t offered in the status selector**: only realistic next steps are allowed (e.g. Saved can’t jump to Interview; record Applied first). The previous status is always offered, to undo a mistake.
- **Preparation drafts say “AI is not configured on this server”**: with `AI_PROVIDER=none` (the default) suggestions, cover letters and answers are built only from your verified data. Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` to enable AI drafting; output is still grounded and needs your approval.
- **“Something is already being generated for this application”**: one generation at a time per application; wait for it to finish (a stuck claim expires after 5 minutes).
- **Preparation says to analyse the job first**: preparation uses the job's stored requirements and match; analyse the job, then return.
- **Interview feedback says technical accuracy is “not assessed”**: without an AI provider, feedback is rule-based (topic coverage, structure, specificity, length). Configure `AI_PROVIDER` for AI evaluation.
- **“This session is completed and can’t be changed”**: completed and abandoned sessions are read-only history; start a new session to practise again.
