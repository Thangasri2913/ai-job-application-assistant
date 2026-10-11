# ADR-0011: Layered resume parsing with an in-process dispatcher

## Context

Uploaded resumes must become structured data the user can review. AI providers are optional and may be unavailable or wrong. Parsing must not block the upload request. ADR-0005 deferred Redis/BullMQ until it was genuinely needed.

## Decision

- **Layers:** text extraction (`unpdf` for PDF, `mammoth` for DOCX) → deterministic parser (rule-based, versioned `PARSER_VERSION`) → optional AI structuring → validation → user review.
- The deterministic parser only reorganises text that is present, and a unit test asserts every extracted string occurs in the source. It never infers skills or metrics. Technologies are detected only when literally present, with case-sensitive matching for common English words.
- AI structuring runs only if `AI_PROVIDER` ≠ `none`. Its output is zod-validated, then **grounded**: any value not found in the extracted text is dropped and counted. It's stored separately (`ai_extraction`) and is never applied without user review.
- Each layer is stored separately on the version (`extracted_text`, `parsed_data`, `ai_extraction`, `content`). User-confirmed `content` has the highest authority, and nothing is written to the career profile except through explicit, selective import.
- **Async execution:** `ParsingDispatcher` interface. The current implementation is in-process: it runs after the response, claims the job atomically (`PENDING → PROCESSING`), drains on shutdown and re-queues unfinished work on startup. Status lives in the database and the UI polls it.

## Consequences

- No Redis needed yet. Moving to BullMQ means a new `ParsingDispatcher` implementation plus a worker process, with no caller changes.
- In-process parsing shares CPU with the API. Fine at current scale (small files, fast extraction), and the trigger for BullMQ is heavier work such as OCR, AI calls at volume, or multiple API instances.
- Scanned/image-only PDFs fail with a clear message. OCR is future work.
