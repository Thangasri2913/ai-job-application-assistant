# ADR-0005: Redis + BullMQ for background jobs — deferred

## Context

Resume parsing, AI analysis, matching, document generation, discovery and notifications are slow or scheduled and must not block requests.

## Decision

Use Redis + BullMQ (`@nestjs/bullmq`) with one queue per capability and idempotent processors. Run workers in the same codebase, startable as a separate process (`main.worker.ts`) so they can scale independently.

**Not added in Phase 0**: no feature needs async work yet, and an unused Redis is operational cost without value. It will arrive with resume parsing. Redis will also back the rate limiter once the API runs on more than one instance.

## Consequences

- Phase 0 compose file runs PostgreSQL only.
- Job payloads must contain ids, not personal data.
