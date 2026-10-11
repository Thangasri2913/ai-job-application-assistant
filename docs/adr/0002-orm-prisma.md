# ADR-0002: Prisma as ORM and migration tool

## Context

Need type-safe PostgreSQL access, reliable migrations, and support for jsonb (AI results), transactions and raw SQL where needed.

## Options

|                 | Prisma                                               | TypeORM                                         | Drizzle              |
| --------------- | ---------------------------------------------------- | ----------------------------------------------- | -------------------- |
| Type safety     | Generated, end-to-end                                | Decorators; weaker inference, nullable pitfalls | Excellent, SQL-like  |
| Migrations      | Declarative schema → SQL migrations, drift detection | Generated from entities; historically fragile   | drizzle-kit; younger |
| NestJS fit      | Good (service wrapper)                               | First-class module                              | Manual               |
| Complex SQL     | `$queryRaw` / TypedSQL                               | QueryBuilder                                    | Native strength      |
| Maturity / docs | High                                                 | High, slower maintenance                        | Growing              |

## Decision

Prisma 7 with the `prisma-client` generator (ESM output) and the `@prisma/adapter-pg` driver adapter. The schema file is the single source of truth; migrations are generated SQL committed to Git and applied with `prisma migrate deploy`.

## Consequences

- Excellent DX and safety for CRUD-heavy modules.
- Generated client lives in `apps/api/src/generated` (git-ignored, regenerated on install).
- For heavy analytics/matching queries we'll use TypedSQL / `$queryRaw` rather than fight the query API.
- Prisma's `latest` dist-tag currently points to an 8.0 release candidate; we pin `^7.10`.
