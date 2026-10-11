import { randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/** Throwaway test account, generated per run (never committed). */
export function testAccount() {
  return {
    email: `e2e-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`,
    password: `Pw-${randomBytes(12).toString('base64url')}`,
  };
}

/** From the app's login page: Create account → Keycloak registration → back in the app. */
export async function registerViaKeycloak(
  page: Page,
  account: { email: string; password: string },
  name = { first: 'Thanga', last: 'Sri' },
) {
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/localhost:8180\/realms\/ai-job-assistant\//);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#password-confirm').fill(account.password);
  await page.locator('#firstName').fill(name.first);
  await page.locator('#lastName').fill(name.last);
  await page.locator('form').locator('[type=submit]').click();
}

/** From the app's login page: Sign in → Keycloak login form → back in the app. */
export async function signInViaKeycloak(page: Page, account: { email: string; password: string }) {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/localhost:8180\/realms\/ai-job-assistant\//);
  await page.locator('#username').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#kc-login').click();
}
