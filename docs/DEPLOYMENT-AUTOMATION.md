# Deployment automation

One command validates the repository, commits and pushes to `main`. **Pushing to `main` is the deployment**: Vercel and Render watch the repository and deploy automatically. The script never calls the Vercel or Render APIs and contains no secrets.

```bash
./scripts/deploy.sh "fix: job alert form validation"
```

Setup and environment variables for each service are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Architecture

```
React (Vercel) ──OIDC + PKCE──▶ Keycloak (Render)
      │ Bearer token
      ▼
NestJS API (Render, Docker) ──▶ Neon PostgreSQL
      │                    └──▶ Cloudflare R2 (private bucket)
      └─ in-process background work: resume parsing, job analysis,
         job-alert searches and the job-alert scheduler
```

There is no Redis, no BullMQ and no separate worker: background work runs inside the API process, with its state in PostgreSQL. A deployment is therefore just: new web build (Vercel) and new API container (Render).

| Component | Deployed by                                                                  | Live URL                                                     |
| --------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Web       | Vercel, Root Directory `apps/web` (`apps/web/vercel.json`)                   | https://ai-job-application-assistant-murex-seven.vercel.app  |
| API       | Render Docker web service (`apps/api/Dockerfile`, context = repository root) | https://ai-job-assistant-api-i4ho.onrender.com/api/v1/health |
| Keycloak  | Render Docker web service (`infrastructure/keycloak-prod/`)                  | https://ai-job-application-assistant-nlo8.onrender.com       |

## Deployment flow

`./scripts/deploy.sh "message"` runs these steps and **stops at the first failure**:

| Step                    | What it does                                                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[1/8]` Environment     | Repository root; git, Node (22.12+ or 24+) and npm 11+ available; dependencies installed; on `main`; not behind `origin/main`; nothing pre-staged                                                                                                                           |
| `[2/8]` Secrets         | Refuses un-ignored secret files (`.env*`, `*.pem`, `*.key`, credentials, …), protected files already tracked, and secret-looking values in changed files (private keys, cloud keys, hosted database URLs with passwords). Prints file names/line numbers only, never values |
| `[3/8]` Formatting      | `npm run format:check`                                                                                                                                                                                                                                                      |
| `[4/8]` Lint            | `npm run lint`                                                                                                                                                                                                                                                              |
| `[5/8]` Typecheck       | `npm run typecheck`                                                                                                                                                                                                                                                         |
| `[6/8]` Build           | `npm run build` (shared + API + web)                                                                                                                                                                                                                                        |
| `[7/8]` Tests           | `npm test` (API unit + web); with `--full` also `npm run test:e2e`                                                                                                                                                                                                          |
| `[8/8]` Commit and push | Stages changes **excluding** secrets and generated output (no blind `git add .`), verifies `git diff --cached --name-only`, shows `git status --short`, commits with your message and pushes `main`                                                                         |

After a successful push it prints the commit hash, branch and both deployment targets.

### Then, automatically

- **Vercel** builds `apps/web` with the commands in `apps/web/vercel.json` (npm 11, web + shared workspaces, SPA rewrites) and the `VITE_*` variables from the Vercel project, then publishes the new deployment.
- **Render** rebuilds the API image from `apps/api/Dockerfile`. On start the container runs `prisma migrate deploy` (applies pending migrations, idempotent), then the API. Render switches traffic once the health check `/api/v1/health` passes. The Keycloak service also redeploys if Render's auto-deploy is on for it; its realm is imported only once, so existing Keycloak configuration is not changed by a redeploy.

Watch progress in the Vercel and Render dashboards. Afterwards check `https://ai-job-assistant-api-i4ho.onrender.com/api/v1/health` (and `/health/ready` for database, storage and Keycloak).

## Required local tools

- git, with push access to `origin`
- Node 22.12+ (`nvm use`, see `.nvmrc`) or Node 24+
- npm 11 (`npm i -g npm@11`) and installed dependencies (`npm ci`)
- Docker is **not** needed for a normal deployment. `--full` needs the local PostgreSQL and object storage (`npm run db:up`).

## Commands

```bash
./scripts/deploy.sh "message"           # validate, commit, push → deploy
./scripts/deploy.sh --full "message"    # + API end-to-end tests
./scripts/deploy.sh --dry-run           # run every check and show what would be committed; no commit, no push
./scripts/deploy.sh --help
```

Deployment requires the `main` branch. Merge feature work into `main` first (e.g. via a pull request), then run the script on an up-to-date `main`.

Run only one e2e run at a time: every e2e suite resets the shared local test database, so two concurrent runs break each other.

## Environment variables and secrets

| Where              | What                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel project     | `VITE_API_URL`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` — public values, compiled into the bundle        |
| Render API service | `NODE_ENV`, `CORS_ORIGINS`, `TRUST_PROXY_HOPS`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `KEYCLOAK_*`, `S3_*`, `AI_PROVIDER`, `JOB_*`, … |
| Render Keycloak    | `KC_*` (database, hostname, proxy, bootstrap admin), `APP_URL`                                                                         |
| Local `.env`       | Development values only (git-ignored). `.env.example` documents every variable with placeholders                                       |

Rules:

- Production secrets live **only** in the Vercel and Render settings (and the Neon/R2/Keycloak dashboards). Never in source code, never in a committed file, never in `VITE_*` variables.
- `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `*.p12` and `*.pfx` are git-ignored, and the script refuses to stage them even if they weren't.
- If a secret is ever committed, removing the file is not enough: **rotate the credential** (Neon password, R2 token, Keycloak admin password, AI key) in its provider, then update Render/Vercel.

## Failure behavior

- Any failing step prints `✗ Failed: <command>` and `Deployment stopped. Nothing was committed or pushed.`, and exits non-zero.
- A failure while pushing (network, rejected push) leaves the commit local and says so; fix the cause and run `git push origin main`.
- If Vercel or Render fails to build after the push, the previous deployment keeps serving traffic. Fix forward with another deployment, or roll back (below).

## Rollback

Roll back through Git so the repository, Vercel and Render stay consistent:

```bash
git switch main && git pull
git log --oneline -5                    # find the bad commit
git revert <bad-commit-sha>             # creates a new commit that undoes it
./scripts/deploy.sh "revert: <what was undone>"   # validates and pushes the revert
```

Vercel and Render then deploy the reverted code automatically. Prefer `git revert` over `git reset --hard` + force-push: it keeps history and never rewrites `main`.

For an immediate stop-gap while the revert builds, both dashboards can re-activate an earlier deployment (Vercel: _Promote_ an earlier deployment; Render: _Rollback_ to a previous deploy). Still push the revert afterwards, or the next push re-deploys the bad code.

**Database migrations are not rolled back** by reverting code: Prisma migrations only move forward. If a deployment included a migration, write a new migration that undoes it (and make sure the reverted code works with the migrated schema) rather than editing or deleting applied migrations.
