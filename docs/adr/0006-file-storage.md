# ADR-0006: S3-compatible object storage

## Context

Resumes and generated documents are binary files containing PII.

## Decision

- Store files in S3-compatible storage (AWS S3 in production; locally see ADR-0009); the database stores only keys and metadata.
- Private bucket; access via short-lived pre-signed URLs scoped to the owning user.
- Keys are random (`users/<userId>/resumes/<uuid>`), never derived from file names.
- Upload validation: size limit, allow-list of types verified by magic bytes (PDF, DOCX), not just extension/MIME; malware scanning before parsing.
- Encryption at rest (SSE) and lifecycle rules for deleted accounts.

**Implemented in Phase 1** behind `StorageService`. Locally MinIO was replaced by SeaweedFS (ADR-0009). Still to do before launch: malware scanning, SSE configuration, lifecycle rules, and the account-deletion purge.
