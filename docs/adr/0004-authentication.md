# ADR-0004: JWT access token + rotating httpOnly refresh cookie

> **Status: Superseded by [ADR-0013](0013-keycloak-identity-provider.md)** (Keycloak identity provider). Kept for history; none of this is in the code any more.

## Context

SPA + API, sensitive personal data, need for sessions that survive reloads without exposing long-lived credentials to JavaScript (XSS).

## Decision

- argon2id password hashing (19 MiB, t=2, p=1).
- 15-minute HS256 access JWT kept in memory only.
- Opaque refresh token in `httpOnly; SameSite=Strict; Path=/api/v1/auth` cookie, stored hashed, rotated on every use, with family-wide revocation on reuse.
- Same-origin deployment (dev proxy; prod edge routing) so cookies are first-party.
- Global auth guard; public routes opt out explicitly.
- Rate limits on credential endpoints; security events written to `audit_logs`.

Not chosen: server sessions only (would need sticky storage now), Passport (unnecessary indirection for one strategy), third-party auth provider (may be added later for SSO/social login; this design doesn't preclude it).

## Consequences

- Stateless request auth; revocation latency up to the access-token TTL.
- Needs email verification and password reset before public launch (requires transactional email).
- SameSite=Strict + JSON-only endpoints provide CSRF protection; revisit if cross-site embedding is ever needed.
