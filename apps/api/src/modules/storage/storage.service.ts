import type { Readable } from 'node:stream';

export interface StoredObject {
  body: Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
}

/**
 * Object storage for user files (resumes, generated documents). Files never go in
 * PostgreSQL — only their keys. Implementations: S3 (prod, and SeaweedFS locally),
 * in-memory (unit tests). Callers are responsible for ownership checks before
 * reading or deleting a key.
 */
export abstract class StorageService {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract get(key: string): Promise<StoredObject>;
  abstract copy(sourceKey: string, destinationKey: string): Promise<void>;
  abstract delete(keys: string[]): Promise<void>;
  /** Readiness check. */
  abstract ping(): Promise<void>;
}
