# ADR-0003: Provider-agnostic AI layer with validated structured output

## Context

AI is central (analysis, matching, tailoring) but vendors, prices and models change. Trust is the product's core value: AI must never fabricate career facts.

## Decision

- `AiProvider` interface behind a DI token; implementation chosen by `AI_PROVIDER` env.
- Feature code uses only `AiService.generateStructured`, which sends a JSON Schema (derived from zod) and **validates** the result with the same zod schema before returning it.
- Default provider is `none`, which throws — the app never silently returns made-up content.
- `MockAiProvider` returns only explicitly registered fixtures, for deterministic tests.
- No vendor provider is implemented until the first feature needs one.

## Consequences

- Switching or mixing vendors is a localised change.
- Every AI capability must define a schema; this is extra work but is what makes outputs safe to persist.
- Grounding checks (evidence must exist in the source) are a separate layer, added with the first AI feature.

## Update (Phase 1)

- Implemented providers: `UnconfiguredAiProvider` (default `none`), `MockAiProvider` (tests), and `AnthropicAiProvider` (official `@anthropic-ai/sdk`, structured outputs, server-side refusal fallbacks, `AI_MODEL` default `claude-opus-5`).
- The only consumer is resume structuring. Invalid output gets one controlled retry, then the result is recorded as `INVALID`. The Anthropic provider is unit-tested with a stubbed client and has not yet been run against the live API in development.
