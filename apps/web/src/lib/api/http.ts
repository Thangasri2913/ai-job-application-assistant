import { API_PREFIX, API_VERSION } from '@job-assist/shared';
import { renewAccessToken, tokenSource } from '../auth/token-source';
import { ApiError } from './api-error';

/** Same-origin by default (Vite proxies /api in development). */
export const API_BASE_URL = import.meta.env.VITE_API_URL || `/${API_PREFIX}/v${API_VERSION}`;

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Serialised as JSON unless it is FormData. */
  body?: unknown;
}

/**
 * JSON API client. Sends the Keycloak access token as a Bearer token; on a 401 it renews
 * the session once (silently, via refresh token) and retries. If that fails the session
 * is over and the app returns to sign-in.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await send<T>(path, options, await tokenSource.getAccessToken());
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const renewed = await renewAccessToken();
    if (!renewed) {
      tokenSource.sessionExpired();
      throw error;
    }
    return send<T>(path, options, renewed);
  }
}

async function send<T>(path: string, options: RequestOptions, token: string | null): Promise<T> {
  const { body, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  finalHeaders.set('Accept', 'application/json');
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`);

  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: payload,
    });
  } catch {
    throw ApiError.network();
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw ApiError.fromResponse(response.status, data);
  return data as T;
}
