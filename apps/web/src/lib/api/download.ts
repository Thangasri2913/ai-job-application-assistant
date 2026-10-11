import { renewAccessToken, tokenSource } from '../auth/token-source';
import { ApiError } from './api-error';
import { API_BASE_URL } from './http';

/** Downloads an authenticated file and hands it to the browser as a save. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const attempt = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let response = await attempt(await tokenSource.getAccessToken()).catch(() => {
    throw ApiError.network();
  });
  if (response.status === 401) {
    const renewed = await renewAccessToken();
    if (!renewed) tokenSource.sessionExpired();
    else response = await attempt(renewed);
  }
  if (!response.ok)
    throw ApiError.fromResponse(response.status, await response.json().catch(() => undefined));

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
