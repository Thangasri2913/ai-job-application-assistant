import { expect, test } from '@playwright/test';
import { registerViaKeycloak, testAccount } from './keycloak';
import { buildResumePdf, RESUME_LINES } from './resume-pdf';

/**
 * Phase 1 definition of done, end to end in a real browser:
 * register (Keycloak) → career profile → upload resume → parse → review → save → library.
 */
test('a new user builds a profile and a reviewed resume library', async ({ page }) => {
  const account = testAccount();

  await test.step('register through Keycloak', async () => {
    await page.goto('/login');
    await registerViaKeycloak(page, account);
    await expect(page.getByRole('heading', { name: 'Welcome, Thanga' })).toBeVisible();
  });

  await test.step('create the career profile', async () => {
    await page.getByRole('link', { name: 'Career Profile', exact: true }).click();
    await page.getByLabel(/^Phone/).fill('+91 98765 43210');
    await page.getByLabel(/^Location/).fill('Chennai');
    await page.getByLabel(/Years of experience/).fill('3.3');
    await page.getByLabel('Remote').check();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/Years of experience/)).toHaveValue('3.3');
  });

  await test.step('upload a resume and wait for parsing', async () => {
    await page.getByRole('link', { name: 'Resumes' }).click();
    await expect(page.getByText('You don’t have any resumes yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Add resume' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Resume file').setInputFiles({
      name: 'Angular_Resume.pdf',
      mimeType: 'application/pdf',
      buffer: buildResumePdf(RESUME_LINES),
    });
    await dialog.getByLabel(/Resume name/).fill('Angular Developer');
    await dialog.getByLabel(/Category/).fill('Frontend');
    await dialog.getByRole('button', { name: 'Upload' }).click();
    await expect(dialog.getByText('Resume processed.')).toBeVisible();
    await dialog.getByRole('link', { name: 'Review information' }).click();
  });

  await test.step('review the extracted information and save it', async () => {
    await expect(page.getByText('Extracted automatically — please review.')).toBeVisible();
    await expect(page.getByLabel(/^Name/).first()).toHaveValue('Thanga Sri');
    await expect(page.getByLabel(/^Email/).first()).toHaveValue('thanga.sri@example.com');
    await page
      .locator('#content-summary')
      .fill('Angular developer focused on component libraries.');
    await page.getByRole('button', { name: 'Save and make current' }).click();
    await expect(page.getByText('Current version · v1')).toBeVisible();
    await expect(page.getByText('Angular developer focused on component libraries.')).toBeVisible();
  });

  await test.step('the resume appears in the library, ready and settable as default', async () => {
    await page.getByRole('link', { name: 'All resumes' }).click();
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: 'Angular Developer' }) });
    await expect(card.getByText('Ready')).toBeVisible();
    await expect(card.getByText(/Frontend ·/)).toBeVisible();
    await card.getByRole('button', { name: 'Set as default' }).click();
    await expect(card.getByText('Default')).toBeVisible();
  });

  await test.step('the dashboard reflects real data', async () => {
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByText('Active resumes · 1 total')).toBeVisible();
    await expect(page.getByText('Angular Developer').first()).toBeVisible();
  });
});
