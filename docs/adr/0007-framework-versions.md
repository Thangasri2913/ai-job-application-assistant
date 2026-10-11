# ADR-0007: NestJS 12 (ESM), Node 22, TypeScript 5.9

## Context

At project start the development machine had Node 22.18, with Node 18 as the default. NestJS 12's official starter is ESM with Vitest. `@nestjs/cli` 12 depends on `@angular-devkit/core` 22, which needs Node ≥ 22.22.3, and its schematics need TypeScript 6.

## Decision

- Node 22 LTS, pinned in `.nvmrc` (22.18.0). `engines` requires ≥ 22.12.
- NestJS 12 as ESM, with Vitest for tests (an SWC plugin emits the decorator metadata Nest needs) and ESLint.
- The API is built with plain `tsc`, and `tsc-watch` in development, instead of `@nestjs/cli`. The CLI only added build/watch convenience and code generators.
- TypeScript ~5.9 across the repo.
- npm ≥ 11, because npm 10.9's arborist crashes on this dependency graph (`edgesOut`). npm 11 requires install scripts to be allow-listed in the root `package.json` `allowScripts`.

## Consequences

- One Node major and one TypeScript version for the whole repo.
- Once Node is ≥ 22.22.3, the Nest CLI can be reintroduced if its generators are wanted.
- The frontend framework choice is recorded in [ADR-0008](0008-react-frontend.md).
