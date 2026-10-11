import { Readable } from 'node:stream';
import { type StoredObject, StorageService } from './storage.service.js';

/** Test double. Not registered in the application module. */
export class InMemoryStorageService extends StorageService {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
    return Promise.resolve();
  }

  get(key: string): Promise<StoredObject> {
    const object = this.objects.get(key);
    if (!object) return Promise.reject(new Error(`No such key: ${key}`));
    return Promise.resolve({
      body: Readable.from(object.body),
      contentType: object.contentType,
      contentLength: object.body.length,
    });
  }

  copy(sourceKey: string, destinationKey: string): Promise<void> {
    const object = this.objects.get(sourceKey);
    if (!object) return Promise.reject(new Error(`No such key: ${sourceKey}`));
    this.objects.set(destinationKey, { ...object });
    return Promise.resolve();
  }

  delete(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
    return Promise.resolve();
  }

  ping(): Promise<void> {
    return Promise.resolve();
  }
}
