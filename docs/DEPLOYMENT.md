# Deployment (portfolio / testing)

This guide prepares a **single-developer, portfolio/testing** deployment of the modular monolith. It is not a high-availability production setup.

| Component       | Target                  | What runs there                                                                       |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| Web (React SPA) | Vercel                  | Static build of `apps/web` (`apps/web/vercel.json`)                                   |
| API             | Render (Docker web svc) | `apps/api/Dockerfile`: HTTP API **and** in-process background work                    |
| PostgreSQL      | Neon                    | Application database (and, optionally, a second database for Keycloak)                |
| Object storage  | Cloudflare R2           | Private bucket for resumes and application documents (S3 API)                         |
| Keycloak        | Render (Docker web svc) | `infrastructure/keycloak-prod/Dockerfile`: production-mode Keycloak + JobAssist realm |

### Redis and background worker: not needed (yet)

The repository has **no Redis and no BullMQ**. All background work runs in-process inside the API ([ADR-0005](adr/0005-background-jobs.md), [ADR-0011](adr/0011-resume-parsing-pipeline.md), [ADR-0018](adr/0018-job-discovery-and-alerts.md)):

- resume parsing, job analysis and job-alert searches use in-process dispatchers whose state lives in PostgreSQL; unfinished work is re-queued when the API starts;
- the job-alert scheduler runs inside the API (`JOB_ALERT_SCHEDULER_ENABLED`), claiming due alerts with a compare-and-set on `next_run_at`, so it is safe even if two API instances run.

So **do not create an Upstash Redis database or a Render Background Worker** for this version: nothing would connect to them. Introduce them only together with a BullMQ implementation of the dispatcher abstractions (see ADR-0005).

> Render's free web services sleep after ~15 minutes without traffic. While asleep, scheduled alerts don't run; when the API wakes, every overdue alert is picked up on the next scheduler tick (it runs alerts whose `next_run_at` has passed). For reliable schedules use a paid instance that doesn't sleep.

---

## Local development

Prerequisites: Node 22 (`nvm use`), npm 11 (`npm i -g npm@11`), Docker.

```bash
cp .env.example .env             # set local passwords/keys (placeholders are fine locally)
npm install                      # also builds packages/shared and generates the Prisma client
npm run db:up                    # PostgreSQL :5434, SeaweedFS (S3) :8333, Keycloak :8180 (+ its DB)
npm run db:migrate:deploy        # apply migrations
npm run dev:api                  # API + background work + scheduler  → http://localhost:3000/api/v1
npm run dev:web                  # web                                 → http://localhost:4200
```

There is no separate worker or Redis to start: background work runs inside the API process. Development job discovery uses clearly labelled sample postings (`JOB_SOURCES=dev`).

---

## Production environment variables

Values are never committed. 🔒 = secret (store only in the hosting provider's secret settings).

### Frontend (Vercel — build-time, public)

Everything `VITE_*` is compiled into the browser bundle, so **never put secrets here**.

| Variable                  | Example / value          | Notes                                |
| ------------------------- | ------------------------ | ------------------------------------ |
| `VITE_API_URL`            | `https://API_URL/api/v1` | Full API base URL (cross-origin)     |
| `VITE_KEYCLOAK_URL`       | `https://AUTH_URL`       | Keycloak base URL, no trailing slash |
| `VITE_KEYCLOAK_REALM`     | `ai-job-assistant`       |                                      |
| `VITE_KEYCLOAK_CLIENT_ID` | `ai-job-assistant-web`   | Public client (PKCE), no secret      |

### Backend (Render — API service)

| Variable                                                                                           | Value             | Notes                                                                          |
| -------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`                                                                                         | `production`      | Set in the image; disables the development job source and the mock AI provider |
| `PORT`                                                                                             | (set by Render)   | Used when `API_PORT` is not set                                                |
| `CORS_ORIGINS`                                                                                     | `https://APP_URL` | Comma-separated exact origins; `*` is rejected in production                   |
| `TRUST_PROXY_HOPS`                                                                                 | `1`               | Render's proxy, so rate limits see the client IP                               |
| `LOG_LEVEL`                                                                                        | `info`            |                                                                                |
| `SWAGGER_ENABLED`                                                                                  | `false`           | Keep API docs off in public deployments                                        |
| `RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_MAX`, `JOB_ANALYSIS_RATE_LIMIT_MAX`, `RATE_LIMIT_TTL_SECONDS` | defaults          | Optional                                                                       |
| `RESUME_MAX_UPLOAD_BYTES`                                                                          | default 5 MB      | Optional                                                                       |

### Database (Neon)

| Variable                 | Value                                                              | Notes                                                                      |
| ------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL` 🔒        | Neon **pooled** connection string (`…-pooler…/db?sslmode=require`) | Used by the running API                                                    |
| `DIRECT_DATABASE_URL` 🔒 | Neon **direct** connection string (`…/db?sslmode=require`)         | Used only by `prisma migrate deploy` (migrations need a direct connection) |

### Redis

None — see above.

### Keycloak (API side)

| Variable              | Value                                      | Notes                                                 |
| --------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `KEYCLOAK_ISSUER_URL` | `https://AUTH_URL/realms/ai-job-assistant` | Must equal the `iss` claim in tokens exactly          |
| `KEYCLOAK_CLIENT_ID`  | `ai-job-assistant-web`                     | Tokens must be issued to this client (`azp`)          |
| `KEYCLOAK_AUDIENCE`   | `ai-job-assistant-api`                     | Added to access tokens by the realm's audience mapper |

### Keycloak service (Render — Keycloak service)

| Variable                         | Value                                             | Notes                                                                                 |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `KC_DB_URL` 🔒                   | `jdbc:postgresql://HOST/keycloak?sslmode=require` | Neon **direct** host; a separate database from the app's                              |
| `KC_DB_USERNAME`                 | database user                                     |                                                                                       |
| `KC_DB_PASSWORD` 🔒              | database password                                 |                                                                                       |
| `KC_HOSTNAME`                    | `https://AUTH_URL`                                | Public URL; determines the token issuer                                               |
| `KC_HTTP_ENABLED`                | `true`                                            | Render terminates TLS and forwards HTTP                                               |
| `KC_PROXY_HEADERS`               | `xforwarded`                                      | Trust Render's `X-Forwarded-*` headers                                                |
| `KC_HTTP_PORT`                   | `10000` (or set Render's `PORT` to `8080`)        | Keycloak must listen on the port Render routes to                                     |
| `KC_BOOTSTRAP_ADMIN_USERNAME`    | admin user name                                   | Temporary admin created on first start                                                |
| `KC_BOOTSTRAP_ADMIN_PASSWORD` 🔒 | strong password                                   | Replace with a permanent admin after first login                                      |
| `APP_URL`                        | `https://APP_URL`                                 | Substituted into the realm on **first** import (redirect URI, web origin, logout URI) |

### Object storage (Cloudflare R2)

| Variable                  | Value                                         | Notes                                          |
| ------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `S3_ENDPOINT`             | `https://ACCOUNT_ID.r2.cloudflarestorage.com` |                                                |
| `S3_REGION`               | `auto`                                        |                                                |
| `S3_BUCKET`               | e.g. `job-assist-files`                       | **Private** bucket; never enable public access |
| `S3_ACCESS_KEY_ID` 🔒     | R2 API token access key                       | Object read/write on this bucket only          |
| `S3_SECRET_ACCESS_KEY` 🔒 | R2 API token secret                           |                                                |
| `S3_FORCE_PATH_STYLE`     | `true`                                        |                                                |
| `S3_AUTO_CREATE_BUCKET`   | `false`                                       | Create the bucket in the R2 dashboard          |

Files are only ever served through the API after an ownership check; storage keys and bucket URLs are never sent to the browser.

### AI provider (optional)

| Variable               | Value                 | Notes                                                                                       |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`          | `none` or `anthropic` | `none` = rule-based features only (everything still works). `mock` is refused in production |
| `AI_MODEL`             | model id              | Only with `anthropic`                                                                       |
| `ANTHROPIC_API_KEY` 🔒 | API key               | Only with `anthropic`                                                                       |

### Background work / job discovery (API service)

| Variable                               | Value       | Notes                                                                                                                                                             |
| -------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JOB_ALERT_SCHEDULER_ENABLED`          | `true`      | In-process scheduler                                                                                                                                              |
| `JOB_ALERT_SCHEDULER_INTERVAL_SECONDS` | `60`        |                                                                                                                                                                   |
| `JOB_SOURCES`                          | `adzuna`    | Real jobs from the official Adzuna API. The `dev` sample source is refused in production. Empty = no source: alert runs fail with "No job sources are configured" |
| `ADZUNA_APP_ID` 🔒                     | from Adzuna | Register an application at https://developer.adzuna.com                                                                                                           |
| `ADZUNA_APP_KEY` 🔒                    | from Adzuna | Never logged; never sent to the browser                                                                                                                           |
| `ADZUNA_COUNTRY`                       | `in`        | Adzuna country code (`in`, `gb`, `us`, `au`, `ca`, `de`, …)                                                                                                       |
| `ADZUNA_MAX_DAYS_OLD`                  | `30`        | Optional: only ads up to this age                                                                                                                                 |
| `ADZUNA_DAILY_REQUEST_LIMIT`           | `200`       | Optional: this server's daily request budget (Adzuna's default allowance is 250/day)                                                                              |

---

## Deployment order

1. **PostgreSQL (Neon)** — create the project, the app database and a separate `keycloak` database. Everything else depends on it.
2. **Redis** — skip (not used by this version).
3. **Object storage (R2)** — create the private bucket and an API token scoped to it. The API checks storage on readiness and fails uploads without it.
4. **Keycloak (Render)** — needs its database. Its public URL (`AUTH_URL`) must be known before the API and web are configured, because it is the token issuer. Set `APP_URL` to the planned Vercel URL **before the first start** (the realm is imported once).
5. **API (Render)** — needs PostgreSQL (migrations run automatically on start), R2 and Keycloak's issuer URL. Its URL (`API_URL`) is needed by the web build.
6. **Worker** — nothing to deploy: background work runs in the API service.
7. **Web (Vercel)** — needs `API_URL` and `AUTH_URL` at build time. Afterwards make sure `CORS_ORIGINS` (API) and the Keycloak client's redirect URI / web origin match the final `APP_URL`.

If the Vercel URL is only known after the first web deploy: deploy the web once, then set `APP_URL` on Keycloak _before its first start_ — or, if Keycloak already imported the realm, update the client in the admin console (Clients → `ai-job-assistant-web` → Valid redirect URIs, Web origins, Valid post logout redirect URIs).

## Where each URL is configured

| Value                          | Where                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend URL `https://APP_URL` | API `CORS_ORIGINS`; Keycloak `APP_URL` (→ redirect URI, web origin, post-logout URI)                                                                  |
| API URL `https://API_URL`      | Web `VITE_API_URL=https://API_URL/api/v1`                                                                                                             |
| Keycloak issuer                | API `KEYCLOAK_ISSUER_URL=https://AUTH_URL/realms/ai-job-assistant`; Keycloak `KC_HOSTNAME=https://AUTH_URL`; web `VITE_KEYCLOAK_URL=https://AUTH_URL` |
| Keycloak redirect URI          | `https://APP_URL/auth/callback` (realm client, from `APP_URL`)                                                                                        |
| Keycloak web origins           | `https://APP_URL` (realm client, from `APP_URL`)                                                                                                      |
| CORS allowed origin            | API `CORS_ORIGINS=https://APP_URL`                                                                                                                    |

## Service settings

**API (Render, Docker):** Dockerfile `apps/api/Dockerfile`, Docker context = repository root. Health check path `/api/v1/health` (liveness). `/api/v1/health/ready` also checks the database, storage and Keycloak — useful for diagnosis, but don't use it as Render's health check (a sleeping Keycloak would restart the API). On start the container runs `prisma migrate deploy` (idempotent) and then the API.

**Keycloak (Render, Docker):** Dockerfile `infrastructure/keycloak-prod/Dockerfile`, Docker context = `infrastructure/keycloak-prod`. Health check path `/realms/ai-job-assistant/.well-known/openid-configuration`. Keycloak needs roughly 512 MB–1 GB of memory and starts slowly; a free 512 MB instance may be too small — use a paid instance if it fails to start. Email verification is off (no SMTP configured).

**Web (Vercel):** Root Directory `apps/web`. `vercel.json` sets the install/build commands (npm 11, only the web + shared workspaces), the SPA fallback to `index.html`, and basic security headers.

`render.yaml` (repository root) describes both Render services as a Blueprint; secrets are marked `sync: false` so they are entered in the dashboard, never committed.

## Verify before deploying

```bash
npm ci
npm run build                 # shared + API + web
npm run typecheck && npm run lint && npm run format:check
npm test                      # API unit + web
npm run test:e2e              # API e2e (needs local PostgreSQL + object storage + TEST_DATABASE_URL)
(cd apps/api && npx prisma validate && npx prisma migrate status)
docker build -f apps/api/Dockerfile -t job-assist-api .
docker build -t job-assist-keycloak infrastructure/keycloak-prod
```

After deploying: `GET https://API_URL/api/v1/health` → `{"status":"ok"}`; `GET https://API_URL/api/v1/health/ready` → all `up`; sign up at `https://APP_URL`.

## Real job discovery (production)

Production discovers real jobs only from **supported sources**: official APIs or published feeds, used within their terms. The sources, their terms, configuration and limitations are documented in [JOB-DISCOVERY.md](JOB-DISCOVERY.md). Implemented sources:

- **Adzuna** (`adzuna`): needs credentials.
- **Remotive** (`remotive`): no key. Read its terms first; it is not enabled by default.
- **Greenhouse** employer boards (`greenhouse`): configure `GREENHOUSE_BOARDS`.
- **Lever** employer sites (`lever`): configure `LEVER_SITES`.

LinkedIn, Naukri and Indeed are not integrated.

`render.yaml` sets `JOB_SOURCES=adzuna,greenhouse,lever`. Each source works once its settings are added in the Render dashboard; until then it is reported as not configured in the startup log and the source list.

- **Setup:** register an application at developer.adzuna.com and accept Adzuna's terms. Then set `JOB_SOURCES=adzuna`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` and `ADZUNA_COUNTRY` on Render. The startup log then shows `Job discovery sources: adzuna (real jobs).`
- **Terms:**
  - Each displayed ad is labelled **"Jobs by Adzuna"** with a link to Adzuna's local site (recommendation cards and the job page do this).
  - Adzuna's default allowance is 25 requests/minute and 250/day. Each alert run makes at most 4 requests (keywords × locations), and the server enforces a per-minute limit and `ADZUNA_DAILY_REQUEST_LIMIT`.
  - Commercial organisations get a trial and may need a licence, so check that your use fits Adzuna's terms.
- **What arrives:**
  - Adzuna returns real ads with a title, company, location, posting date and a link to the original posting.
  - Its `description` is usually a **snippet**, and the full text is used when the API provides it. Matching is therefore based on less text than a pasted posting, and some ads are screened out as having too little to compare. Thresholds are never lowered to compensate.
  - Ads without a company are skipped, never filled in.
- **Development sample data never reaches production users:**
  - The `dev` source is refused when `NODE_ENV=production`, both at startup and again before every search.
  - Jobs from a development source are stored with `jobs.is_sample_data = true`, and production recommendation endpoints (list, detail, save, dismiss, dashboard counts) exclude them at the query level.
- **How to verify the jobs are real:**
  - The run history lists the source as **Adzuna**, not "Development sample jobs".
  - Cards show **View posting** (an adzuna.* link) and **Jobs by Adzuna**, with no "Sample data" badge and no "Development mode" banner.
  - In the database, `SELECT count(*) FROM jobs WHERE origin = 'DISCOVERED' AND is_sample_data` should be `0`.

### Checking for and removing sample data in production

Production never enabled the `dev` source (it has been refused in production since job discovery shipped), so there should be no sample jobs. To check, read-only, in the Neon SQL editor:

```sql
SELECT count(*) AS sample_jobs FROM jobs WHERE is_sample_data;
SELECT count(*) AS sample_recommendations
FROM job_recommendations r JOIN jobs j ON j.id = r.job_id WHERE j.is_sample_data;
```

If any exist, they are already hidden from recommendations. To delete them, remove only sample jobs that no application uses (deleting a job cascades to its recommendations, analyses and matches; applications are kept by design):

```sql
DELETE FROM jobs j WHERE j.is_sample_data AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id);
```

## Troubleshooting job alerts in production

If alerts never produce recommendations, check the API's startup log on Render:

- `Job discovery has no usable job sources … (JOB_SOURCES is empty)` — set `JOB_SOURCES` (e.g. `adzuna,greenhouse,lever`) and the matching settings (above). `"greenhouse" is enabled but not configured (GREENHOUSE_BOARDS is empty)` / `LEVER_SITES is empty` means no employer boards are listed. `"adzuna" is enabled but not configured (ADZUNA_APP_ID and ADZUNA_APP_KEY are not set)` means the credentials are missing. Without a usable source, alert runs end as **Failed** with “No job sources are configured on this server…”, shown on the Job Alerts page.
- A run shows the source as **Failed** with "Adzuna rejected the API credentials", "request limit was reached", "could not be reached" or "The Greenhouse job board “x” was not found": the message comes from the source result (credentials are never logged). Other sources still run; the run is **Partly completed**.
- `Job alert scheduler started: checking for due alerts every 60s` — the scheduler is running. Each scheduled run logs `Due job alerts found`, `Job alert claimed for a scheduled run`, `Job search started`, `Job source searched` and `Job search finished` (ids and counts only).
- On Render's free plan the service sleeps when idle; due alerts run on the first scheduler tick after it wakes.
