import { expect, type Page } from '@playwright/test';

/** Status code of an API call made with the signed-in user's own access token. */
export async function apiStatus(page: Page, path: string): Promise<number> {
  return page.evaluate(async (p) => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith('oidc.user:'));
    const token = key
      ? (JSON.parse(sessionStorage.getItem(key)!) as { access_token: string }).access_token
      : '';
    return (await fetch(`/api/v1${p}`, { headers: { Authorization: `Bearer ${token}` } })).status;
  }, path);
}

/** JSON body of an API GET made with the signed-in user's own access token. */
export async function apiJson<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (p) => {
    const key = Object.keys(sessionStorage).find((k) => k.startsWith('oidc.user:'));
    const token = key
      ? (JSON.parse(sessionStorage.getItem(key)!) as { access_token: string }).access_token
      : '';
    const res = await fetch(`/api/v1${p}`, { headers: { Authorization: `Bearer ${token}` } });
    return (await res.json()) as T;
  }, path);
}

/** An API call (any method) made with the signed-in user's own access token. */
export async function apiCall<T>(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ m, p, b }) => {
      const key = Object.keys(sessionStorage).find((k) => k.startsWith('oidc.user:'));
      const token = key
        ? (JSON.parse(sessionStorage.getItem(key)!) as { access_token: string }).access_token
        : '';
      const res = await fetch(`/api/v1${p}`, {
        method: m,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(b === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: b === undefined ? undefined : JSON.stringify(b),
      });
      const text = await res.text();
      return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
    },
    { m: method, p: path, b: body },
  );
}

/** Uploads a resume from the library, reviews it and makes it current (v1). */
export async function addReviewedResume(
  page: Page,
  name: string,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.getByRole('link', { name: 'Resumes', exact: true }).click();
  await page.getByRole('button', { name: 'Add resume' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Resume file').setInputFiles(file);
  await dialog.getByLabel(/Resume name/).fill(name);
  await dialog.getByRole('button', { name: 'Upload' }).click();
  await expect(dialog.getByText('Resume processed.')).toBeVisible();
  await dialog.getByRole('link', { name: 'Review information' }).click();
  await page.getByRole('button', { name: 'Save and make current' }).click();
  await expect(page.getByText('Current version · v1')).toBeVisible();
}
