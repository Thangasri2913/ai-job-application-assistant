# ADR-0001: npm-workspaces monorepo, modular monolith

## Context

Two TypeScript apps (web SPA, NestJS API) share API contracts. Team is small; product scope is large but early.

## Decision

- One repository with npm workspaces: `apps/api`, `apps/web`, `packages/shared`.
- No Nx/Turborepo yet: two apps don't justify the tooling; can be adopted later without restructuring.
- A **single** `packages/shared` (contract types + domain constants, zero runtime deps) instead of separate `shared`/`types`/`config` packages. Config is app-specific (env schema lives in the API); splitting now would add build plumbing for empty packages.
- Backend is a modular monolith: NestJS modules own their tables and expose services; no microservices.

## Consequences

- One install, one lockfile, atomic cross-app changes.
- `packages/shared` must be built before the apps (`postinstall` does this).
- Module boundaries are enforced by convention and review; a lint rule for cross-module imports can be added later.
