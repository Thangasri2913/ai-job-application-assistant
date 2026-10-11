import { expect, test } from '@playwright/test';
import { registerViaKeycloak, signInViaKeycloak, testAccount } from './keycloak';

/** Authentication end to end against the real Keycloak realm, API and database. */
test('register, use the app, log out and sign in again as the same user', async ({ page }) => {
  const account = testAccount();
  const meResponses: { status: number; id?: string }[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/v1/auth/me')) {
      const body = (await response.json().catch(() => ({}))) as { id?: string };
      meResponses.push({ status: response.status(), id: body.id });
    }
  });

  await test.step('protected page sends signed-out users to the login page', async () => {
    await page.goto('/resumes');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fresumes/);
    await expect(page.locator('input[type=password]')).toHaveCount(0);
  });

  await test.step('register through Keycloak and land back on the requested page', async () => {
    await registerViaKeycloak(page, account);
    await expect(page).toHaveURL(/localhost:4200\/resumes/);
    await expect(page.getByText('You don’t have any resumes yet.')).toBeVisible();
  });

  await test.step('the session survives a reload', async () => {
    await page.reload();
    await expect(page.getByText('You don’t have any resumes yet.')).toBeVisible();
  });

  await test.step('logout ends the app and Keycloak sessions', async () => {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/localhost:4200\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard/);
  });

  await test.step('sign in again (credentials required) and get the same account', async () => {
    await signInViaKeycloak(page, account);
    await expect(page.getByRole('heading', { name: 'Welcome, Thanga' })).toBeVisible();
  });

  const ok = meResponses.filter((r) => r.status === 200);
  expect(ok.length).toBeGreaterThanOrEqual(2);
  expect(new Set(ok.map((r) => r.id)).size).toBe(1);
});
