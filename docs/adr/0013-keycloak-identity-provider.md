# ADR-0013: Keycloak as the identity provider (OIDC Authorization Code + PKCE)

Supersedes [ADR-0004](0004-authentication.md).

## Context

The first version of authentication (ADR-0004) was built into the API: argon2id password hashes, HS256 access tokens signed by the API, and rotating refresh cookies. It worked, but it meant the application owned every credential concern itself: password storage, brute-force protection, password reset, email verification and, later, MFA and social login. The product holds sensitive career data, and none of these features set it apart from other products. We want a standard, audited identity provider and no credentials in the application database.

## Decision

- **Keycloak 26** is the identity provider. It runs in Docker Compose (`keycloak` service, dev mode) with **its own PostgreSQL** (`keycloak-db` container and `keycloak-db-data` volume). Identity data never shares the application's Prisma-managed database.
- Realm `ai-job-assistant`, imported from `infrastructure/keycloak/ai-job-assistant-realm.json` on first start:
  - **Public client** `ai-job-assistant-web`: standard flow only (no implicit flow, no password grant), **PKCE S256 required**, exact redirect URI `http://localhost:4200/auth/callback`, web origin `http://localhost:4200`, post-logout redirect `http://localhost:4200/login`. There is **no client secret**: a browser cannot keep one.
  - Audience mapper that adds `ai-job-assistant-api` to access tokens.
  - Self-registration with email as username, password policy `length(12) and notUsername and notEmail`, brute-force protection, 5-minute access tokens.
- **React** (`oidc-client-ts` + `react-oidc-context`) runs the Authorization Code flow with PKCE:
  - Tokens live in `sessionStorage` (tab-scoped, cleared when the tab closes) and are renewed silently.
  - Registration uses the same flow with `prompt=create`.
  - Logout calls Keycloak's end-session endpoint with `id_token_hint`, which ends the Keycloak SSO session, not only the local one.
- **NestJS** validates every bearer token with `jose`:
  - It loads the JWKS discovered from `${issuer}/.well-known/openid-configuration` (cached, with rotation handled by `createRemoteJWKSet`).
  - It checks the signature (RS/PS/ES algorithms only), `iss`, `aud` (= `ai-job-assistant-api`), `exp`/`nbf`/`iat` (5 s tolerance), `typ = Bearer` and `azp` (= `ai-job-assistant-web`).
  - Payloads are never trusted without that verification.
  - The guard is global; `@Public()` routes opt out.
- **Local user sync.** On each authenticated request the guard upserts the local `users` row **keyed by the token's `sub`** (`users.keycloak_subject`, unique), not by email:
  - Email is copied from the token.
  - `full_name` is filled only while empty, because the user edits it in the app.
  - A new `auth_time` records a login.
  - All other application data hangs off the local `users.id`, so it does not depend on Keycloak's identifiers.
- The application database stores **no passwords and no sessions**. Migration `20261010180000_keycloak_identity` drops `users.password_hash` and the `sessions` table and adds `keycloak_subject`. `users.email` stops being unique, because Keycloak owns uniqueness and an email can change.

Not chosen:

- Keeping local auth: it would mean building reset, verification and MFA ourselves.
- A confidential "backend-for-frontend" client: more secure against XSS token theft, but it needs a server-side session store and is a larger change. This decision doesn't rule it out later.
- Auth0/Cognito: hosted, and not runnable offline in local development.
- Validating tokens through Keycloak's introspection endpoint: one network call per request; local JWKS verification is standard.

## Migrating existing users

Users created under ADR-0004 keep their `users` row (and all career data), with `keycloak_subject = NULL` and no password. They are reconnected like this:

1. **Linking at first Keycloak login.** When a token arrives whose `sub` is unknown, the API looks for an unlinked user (`keycloak_subject IS NULL`) with the same email. It links that user **only if the token says `email_verified = true`**; otherwise anyone could register a Keycloak account with someone else's email and take over their data. Each link is audited (`auth.user_linked`).
2. **Local development.** `verifyEmail` is off in the dev realm (no SMTP), so new Keycloak accounts are unverified and **will not link**. They get a fresh user row instead. To link a legacy account locally, mark the Keycloak user's email as verified in the admin console (Users → user → Email verified) before their first sign-in.
3. **Production.** Turn on `verifyEmail` and configure SMTP. Before go-live, export the legacy users' emails and import them into Keycloak with `emailVerified: true` and the "Update Password" required action (Admin REST API or partial import, no password hashes). Users then set a new password on first login and are linked by step 1. Old password hashes are not migrated: the column is dropped, and argon2 hashes would need a custom Keycloak provider.
4. **Back up before migrating** (`pg_dump -Fc`). The migration drops `password_hash` and `sessions` irreversibly. Nothing else is deleted.

## Consequences

- No password handling, hashing or token signing in application code. Brute-force protection, password policy, reset and (later) MFA and social login are Keycloak configuration.
- One more service to run and monitor. `/api/v1/health/ready` reports `identityProvider`. If Keycloak's discovery or JWKS is unreachable, the API answers `503 IDENTITY_PROVIDER_UNAVAILABLE` instead of rejecting users as unauthenticated.
- Access tokens can be read by JavaScript (sessionStorage), so XSS can steal them. This is mitigated by short token lifetimes, CSP/helmet and React's escaping. A BFF can be revisited if the threat model changes.
- Revocation latency is bounded by the 5-minute access-token lifetime. Disabling the local user (`status = DISABLED`) takes effect immediately (`403 ACCOUNT_DISABLED`).
- Production needs Keycloak in production mode (`start`, TLS, a real hostname), its own database backups, `verifyEmail` with SMTP, and exact HTTPS redirect URIs.
