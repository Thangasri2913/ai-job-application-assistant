import { renewAccessToken, tokenSource } from '../auth/token-source';
import { ApiError } from './api-error';
import { API_BASE_URL } from './http';

/**
 * Multipart upload with progress events (fetch has no upload progress).
 * Same auth behaviour as apiRequest: one refresh-and-retry on 401.
 */
export async function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  try {
    return await send<T>(path, form, await tokenSource.getAccessToken(), onProgress);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const renewed = await renewAccessToken();
    if (!renewed) {
      tokenSource.sessionExpired();
      throw error;
    }
    return send<T>(path, form, renewed, onProgress);
  }
}

function send<T>(
  path: string,
  form: FormData,
  token: string | null,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${path}`);
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.((event.loaded / event.total) * 100);
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(ApiError.fromResponse(xhr.status, body));
    };
    xhr.onerror = () => reject(ApiError.network());
    xhr.send(form);
  });
}
