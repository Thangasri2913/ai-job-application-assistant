# ADR-0009: SeaweedFS for local S3-compatible storage

## Context

ADR-0006 chose S3-compatible object storage and planned MinIO for local development. When resume upload was built, the MinIO community images were no longer available from Docker Hub or Quay.

## Decision

- The API talks to storage only through `StorageService` (`@aws-sdk/client-s3` implementation). Production uses a managed S3. There is an in-memory implementation for unit tests.
- Local development and e2e tests use **SeaweedFS** (`chrislusf/seaweedfs`, `weed server -s3`) in Docker Compose. Its S3 identity config is generated at container start from `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` in `.env`, so no credentials are committed.
- Path-style addressing (`S3_FORCE_PATH_STYLE=true`) locally. The bucket is auto-created in development only.

## Consequences

- The same S3 API code path is exercised locally and in integration tests (put, get, copy, batch delete, head bucket).
- Swapping the local server (MinIO, Garage, LocalStack) only changes `docker-compose.yml`.
- Readiness (`/health/ready`) now also checks storage.
